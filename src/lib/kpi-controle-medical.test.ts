/**
 * Tests — R3 : assignation native du contrôle médical.
 * Synchronisation de l'étape KPI ouverte (complétion / réaffectation /
 * désaffectation) et portage de l'assignation à l'ouverture de la période.
 * Client Prisma simulé en mémoire (les règles métier sont des transactions
 * simples — pas besoin d'un vrai PostgreSQL pour ces invariants).
 */

import { describe, it, expect } from 'vitest';
import { synchroniserEtapeControleMedical, ouvrirEtapeControleMedical } from './kpi-etapes';

type Etape = {
  id: string;
  dossierId: string;
  service: string;
  type: string;
  gestionnaireId: string | null;
  userId: string | null;
  dateAffectation: Date;
  dateDebut: Date | null;
  dateFin: Date | null;
  motifReaffectation: string | null;
  statutAvant: string | null;
};

function etapeOuverteCM(partiel: Partial<Etape> = {}): Etape {
  return {
    id: 'e1', dossierId: 'd1', service: 'CONTROLE_MEDICAL', type: 'TRAVAIL',
    gestionnaireId: null, userId: 'user1',
    dateAffectation: new Date('2026-11-20T08:00:00Z'),
    dateDebut: new Date('2026-11-20T08:05:00Z'),
    dateFin: null, motifReaffectation: null, statutAvant: null,
    ...partiel,
  };
}

/** Transaction Prisma simulée : étapes CM en mémoire + dossier avec assignation. */
function fabriquerTx(etalesInitiales: Etape[], gestionnaireControleMedicalId: string | null) {
  const etapes = [...etalesInitiales];
  const appels = { updates: 0, creations: 0 };
  const tx = {
    etapeTraitement: {
      findFirst: async ({ where }: { where: { dossierId: string; service: string; dateFin: null | { not: null } } }) =>
        etapes.find((e) => e.dossierId === where.dossierId
          && e.service === where.service
          && e.dateFin === null) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Etape> }) => {
        const e = etapes.find((x) => x.id === where.id);
        if (!e) throw new Error('introuvable');
        Object.assign(e, data);
        appels.updates++;
        return e;
      },
      create: async ({ data }: { data: Partial<Etape> }) => {
        const creee: Etape = {
          id: `e${etapes.length + 1}`, dossierId: 'd1', service: 'CONTROLE_MEDICAL',
          type: 'TRAVAIL', gestionnaireId: null, userId: null,
          dateAffectation: new Date(), dateDebut: null, dateFin: null,
          motifReaffectation: null, statutAvant: null,
          ...data,
        } as Etape;
        etapes.push(creee);
        appels.creations++;
        return creee;
      },
    },
    dossier: {
      findUnique: async () => ({ gestionnaireControleMedicalId }),
    },
  };
  return { tx: tx as never, etapes, appels };
}

describe('R3 — synchroniserEtapeControleMedical (assignation native)', () => {
  it('complétion NULL → G : la période ouverte est complétée sans fermeture', async () => {
    const { tx, etapes, appels } = fabriquerTx([etapeOuverteCM()], 'g1');
    await synchroniserEtapeControleMedical(tx, 'd1', 'g1');
    expect(appels.creations).toBe(0);
    expect(etapes[0].gestionnaireId).toBe('g1');
    expect(etapes[0].dateFin).toBeNull();
  });

  it('réaffectation G1 → G2 : la période du titulaire est fermée, une nouvelle est ouverte', async () => {
    const { tx, etapes, appels } = fabriquerTx([etapeOuverteCM({ gestionnaireId: 'g1' })], 'g2');
    await synchroniserEtapeControleMedical(tx, 'd1', 'g2');
    expect(appels.updates).toBe(1);
    expect(appels.creations).toBe(1);
    expect(etapes[0].dateFin).not.toBeNull();
    expect(etapes[0].motifReaffectation).toMatch(/Réaffectation/);
    expect(etapes[0].dateDebut).not.toBeNull(); // pas de trou : début posé à la fermeture
    expect(etapes[1].gestionnaireId).toBe('g2');
    expect(etapes[1].dateFin).toBeNull();
    expect(etapes[1].userId).toBe('user1'); // la responsabilité compte suit
  });

  it('désaffectation G → NULL : fermeture puis réouverture sans gestionnaire (invariant)', async () => {
    const { tx, etapes } = fabriquerTx([etapeOuverteCM({ gestionnaireId: 'g1' })], null);
    await synchroniserEtapeControleMedical(tx, 'd1', null);
    expect(etapes).toHaveLength(2);
    expect(etapes[0].dateFin).not.toBeNull();
    expect(etapes[0].motifReaffectation).toMatch(/Désaffectation/);
    expect(etapes[1].gestionnaireId).toBeNull();
    expect(etapes[1].dateFin).toBeNull();
  });

  it('idempotent : même gestionnaire → aucun effet', async () => {
    const { tx, appels } = fabriquerTx([etapeOuverteCM({ gestionnaireId: 'g1' })], 'g1');
    await synchroniserEtapeControleMedical(tx, 'd1', 'g1');
    expect(appels.updates).toBe(0);
    expect(appels.creations).toBe(0);
  });

  it("pas d'étape ouverte → aucun effet (l'assignation sera portée à l'ouverture)", async () => {
    const { tx, etapes, appels } = fabriquerTx([], 'g1');
    await synchroniserEtapeControleMedical(tx, 'd1', 'g1');
    expect(appels.creations).toBe(0);
    expect(etapes).toHaveLength(0);
  });
});

describe("R3 — ouvrirEtapeControleMedical (portage de l'assignation)", () => {
  it("la période ouverte porte l'assignation native du dossier", async () => {
    const { tx, etapes } = fabriquerTx([], 'g7');
    const creee = await ouvrirEtapeControleMedical(tx as never, 'd1', 'user1');
    expect(creee.gestionnaireId).toBe('g7');
    expect(creee.service).toBe('CONTROLE_MEDICAL');
    expect(creee.dateDebut).not.toBeNull(); // début = ouverture (mesure directe)
    expect(etapes).toHaveLength(1);
  });

  it("sans assignation native, la période s'ouvre sans gestionnaire (flux manuel conservé)", async () => {
    const { tx } = fabriquerTx([], null);
    const creee = await ouvrirEtapeControleMedical(tx as never, 'd1', 'user1');
    expect(creee.gestionnaireId).toBeNull();
  });

  it('refuse une seconde ouverture (DEJA_OUVERTE)', async () => {
    const { tx } = fabriquerTx([etapeOuverteCM()], 'g7');
    await expect(ouvrirEtapeControleMedical(tx as never, 'd1', 'user1'))
      .rejects.toThrow(/DEJA_OUVERTE/);
  });
});
