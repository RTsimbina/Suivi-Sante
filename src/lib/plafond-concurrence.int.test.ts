/**
 * P5 — Tests d'intégration RÉELS de concurrence PostgreSQL (audit, point 5).
 *
 * Prérequis : une vraie base PostgreSQL de RECETTE, via DATABASE_URL.
 * Sans DATABASE_URL, la suite est SAUTÉE (skipIf) — aucun mock : si ces
 * tests s'exécutent, ils parlent à un vrai serveur PostgreSQL.
 *
 *   DATABASE_URL=postgresql://… npx vitest run src/lib/plafond-concurrence.int.test.ts
 *
 * Ce que ça vérifie (miroir du chemin transactionnel de POST /api/dossiers) :
 *   1. Le verrou FOR UPDATE sur le barème sérialise deux transactions.
 *   2. La 2e transaction ATTEND (preuve : elle n'acquiert le verrou qu'après
 *      le commit de la 1re — ordre strict des horodatages).
 *   3. Après libération du verrou, la consommation est RELUE À JOUR
 *      (READ COMMITTED) : le recalcul voit le dossier de la 1re transaction.
 *   4. La 2e opération est REJETÉE si le plafond est insuffisant — aucune
 *      ligne supplémentaire écrite.
 *   5. Une transaction annulée (rollback) ne laisse aucune trace.
 *   6. Les consommations enregistrées sont cohérentes (somme exacte).
 *
 * NB : Données SYNTHÉTIQUES uniquement (entités dédiées, jamais réelles).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const URL_RECETTE = process.env.DATABASE_URL_RECETTE ?? process.env.DATABASE_URL;

// Deux sessions PostgreSQL DISTINCTES = deux transactions concurrentes réelles.
const t1 = new PrismaClient({ datasourceUrl: URL_RECETTE });
const t2 = new PrismaClient({ datasourceUrl: URL_RECETTE });
const admin = new PrismaClient({ datasourceUrl: URL_RECETTE });

const SOC = 'test-conc-soc';
const ASR = 'test-conc-assure';
const BAREME = 'test-conc-bareme';
const ANNEE_DEBUT = new Date(2026, 0, 1);
const ANNEE_FIN = new Date(2026, 11, 31, 23, 59, 59);

/** Somme de consommation — même définition que plafond-check.ts (statuts). */
async function consommer(session: PrismaClient): Promise<number> {
  const r = await session.$queryRaw<{ total: string | null }[]>`
    SELECT COALESCE(SUM(COALESCE("montantPaye","montantValide","montantReclame")), 0) AS total
    FROM "Dossier"
    WHERE "assureId" = ${ASR} AND "societeId" = ${SOC}
      AND "dateReception" >= ${ANNEE_DEBUT} AND "dateReception" <= ${ANNEE_FIN}
      AND "statut" IN ('EN_ANALYSE','VALIDE','EN_COMPTABILITE','EN_PAIEMENT','PAYE')`;
  return Number(r[0].total ?? 0);
}

describe.skipIf(!URL_RECETTE)('Concurrence PostgreSQL réelle — verrous FOR UPDATE sur plafond annuel', () => {
  beforeAll(async () => {
    // Nettoyage de tout reste d'exécution précédente (idempotence)
    await admin.dossier.deleteMany({ where: { societeId: SOC } });
    await admin.bareme.deleteMany({ where: { societeId: SOC } });
    await admin.assure.deleteMany({ where: { societeId: SOC } });
    await admin.contrat.deleteMany({ where: { societeId: SOC } });
    await admin.societe.deleteMany({ where: { id: SOC } });

    await admin.societe.create({ data: { id: SOC, nom: 'Recette Concurrence', actif: true } });
    await admin.assure.create({ data: { id: ASR, societeId: SOC, nom: 'Assuré Concurrence', actif: true } });
    await admin.bareme.create({
      data: { id: BAREME, societeId: SOC, prestation: 'CONSULTATION', tauxCouverture: 80, plafond: 100000, valideDu: ANNEE_DEBUT },
    });
  });

  afterAll(async () => {
    await admin.dossier.deleteMany({ where: { societeId: SOC } });
    await admin.bareme.deleteMany({ where: { societeId: SOC } });
    await admin.assure.deleteMany({ where: { societeId: SOC } });
    await admin.contrat.deleteMany({ where: { societeId: SOC } });
    await admin.societe.deleteMany({ where: { id: SOC } });
    await t1.$disconnect();
    await t2.$disconnect();
    await admin.$disconnect();
  });

  it('T2 attend le verrou FOR UPDATE, relit une consommation à jour puis est rejetée', async () => {
    const horodatages: Record<string, number> = {};

    // ─── T1 : verrou + insertion 90 000 + maintien du verrou 600 ms ──────
    const p1 = t1.$transaction(async (tx) => {
      // Même séquence que POST /api/dossiers : verrou du barème d'abord
      await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${BAREME} FOR UPDATE`;
      horodatages.t1VerrouAcquis = Date.now();
      await tx.dossier.create({
        data: {
          numeroDossier: 'TEST-CONC-0001',
          dateReception: new Date(2026, 5, 10),
          societeId: SOC,
          beneficiaire: 'Bénéficiaire test',
          typeDossier: 'CONSULTATION',
          statut: 'VALIDE',
          montantReclame: 90000,
          montantValide: 90000,
          assureId: ASR,
        },
      });
      horodatages.t1Insere = Date.now();
      // Maintien du verrou : toute autre transaction FOR UPDATE doit attendre
      await new Promise((r) => setTimeout(r, 600));
      horodatages.t1Commit = Date.now();
      return 'T1_OK';
    });

    // ─── T2 : démarrée pendant que T1 tient le verrou ────────────────────
    await new Promise((r) => setTimeout(r, 200)); // T1 a déjà le verrou
    horodatages.t2Demarre = Date.now();

    let t2Resultat: { rejetee: boolean; consommeRelu: number; attenduMs: number } | null = null;
    const p2 = t2.$transaction(async (tx) => {
      // Bloque jusqu'au commit de T1 (preuve temporelle ci-dessous)
      await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${BAREME} FOR UPDATE`;
      horodatages.t2VerrouAcquis = Date.now();
      // Relecture APRÈS libération : la consommation doit inclure T1
      const consomme = await consommer(tx as unknown as PrismaClient);
      horodatages.t2Relu = Date.now();
      // Recalcul plafond : 100 000 − consommé relu ; demande 30 000
      const reliquat = 100000 - consomme;
      if (consomme >= 100000 || 30000 > reliquat) {
        return { rejetee: true, consommeRelu: consomme, attenduMs: horodatages.t2VerrouAcquis - horodatages.t2Demarre };
      }
      await tx.dossier.create({
        data: {
          numeroDossier: 'TEST-CONC-0002',
          dateReception: new Date(2026, 5, 11),
          societeId: SOC,
          beneficiaire: 'Bénéficiaire test',
          typeDossier: 'CONSULTATION',
          statut: 'VALIDE',
          montantReclame: 30000,
          montantValide: 30000,
          assureId: ASR,
        },
      });
      return { rejetee: false, consommeRelu: consomme, attenduMs: horodatages.t2VerrouAcquis - horodatages.t2Demarre };
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    t2Resultat = r2;

    expect(r1).toBe('T1_OK');
    expect(t2Resultat).not.toBeNull();
    // 2. Preuve d'ATTENTE : T2 n'a acquis le verrou qu'APRÈS le commit de T1
    expect(horodatages.t2VerrouAcquis).toBeGreaterThanOrEqual(horodatages.t1Commit);
    // 3. Recalcul : la consommation relue par T2 inclut le dossier de T1
    expect(t2Resultat!.consommeRelu).toBe(90000);
    // 4. Rejet : plafond 100 000, consommé 90 000, demande 30 000 > reliquat 10 000
    expect(t2Resultat!.rejetee).toBe(true);
    expect(t2Resultat!.attenduMs).toBeGreaterThanOrEqual(400); // a réellement attendu T1
    // Cohérence : T2 n'a RIEN écrit
    const dossiers = await admin.dossier.count({ where: { societeId: SOC } });
    expect(dossiers).toBe(1);
    expect(await consommer(admin)).toBe(90000);
  }, 30000);

  it('Une transaction annulée (rollback) ne laisse aucune trace', async () => {
    const avant = await consommer(admin);
    const roll = t1.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${BAREME} FOR UPDATE`;
      await tx.dossier.create({
        data: {
          numeroDossier: 'TEST-CONC-0003',
          dateReception: new Date(2026, 5, 12),
          societeId: SOC,
          beneficiaire: 'Bénéficiaire test',
          typeDossier: 'CONSULTATION',
          statut: 'VALIDE',
          montantReclame: 50000,
          montantValide: 50000,
          assureId: ASR,
        },
      });
      // Annulation explicite : Prisma rejoue un ROLLBACK sur throw
      throw new Error('ANNULATION_VOLONTAIRE');
    });
    await expect(roll).rejects.toThrow('ANNULATION_VOLONTAIRE');
    expect(await consommer(admin)).toBe(avant);
    const trouve = await admin.dossier.findUnique({ where: { numeroDossier: 'TEST-CONC-0003' } });
    expect(trouve).toBeNull();
  }, 30000);

  it('Validation acceptée dans le reliquat puis plafond exact → toute nouvelle opération rejetée', async () => {
    // T4 : demande 10 000, reliquat = 10 000 (90 000 consommés) → OK, recalcul
    const r4 = await t1.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${BAREME} FOR UPDATE`;
      const consomme = await consommer(tx as unknown as PrismaClient);
      const reliquat = 100000 - consomme;
      const demande = 10000;
      if (demande > reliquat) return { acceptee: false, consomme };
      await tx.dossier.create({
        data: {
          numeroDossier: 'TEST-CONC-0004',
          dateReception: new Date(2026, 5, 13),
          societeId: SOC,
          beneficiaire: 'Bénéficiaire test',
          typeDossier: 'CONSULTATION',
          statut: 'VALIDE',
          montantReclame: demande,
          montantValide: demande,
          assureId: ASR,
        },
      });
      return { acceptee: true, consomme };
    });
    expect(r4.acceptee).toBe(true);
    expect(r4.consomme).toBe(90000);

    // T5 : consommation = plafond exact → rejet transactionnel (même mécanique
    // que PLAFOND_ATTEINT_TRANSACTION dans la route)
    const p5 = t2.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${BAREME} FOR UPDATE`;
      const consomme = await consommer(tx as unknown as PrismaClient);
      if (consomme >= 100000) throw new Error('PLAFOND_ATTEINT_TRANSACTION: Plafond CONSULTATION atteint');
      return 'acceptee';
    });
    await expect(p5).rejects.toThrow('PLAFOND_ATTEINT_TRANSACTION');

    // Cohérence finale : 90 000 + 10 000 = plafond exact, rien de plus
    expect(await consommer(admin)).toBe(100000);
    expect(await admin.dossier.count({ where: { societeId: SOC } })).toBe(2);
  }, 30000);
});
