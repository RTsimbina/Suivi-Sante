/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTS DE SÉCURITÉ OBLIGATOIRES — Portail Prestataire
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Objectif : démontrer que « Prestataire A ne peut JAMAIS accéder aux données
 * du Prestataire B », même en manipulant manuellement les identifiants et
 * paramètres, et que les accès directs aux API (sans passer par l'interface)
 * sont refusés par le RBAC centralisé.
 *
 * Trois couches vérifiées :
 *   1. IDENTITÉ SERVEUR — les 5 routes du portail résolvent le prestataire
 *      depuis le JWT (liaison par e-mail) ; un ?prestataireId=B fourni par le
 *      navigateur est REJETÉ (403) et jamais servi. Toutes les requêtes DB
 *      sont contraintes par le prestataireId serveur.
 *   2. RBAC CENTRAL (API_PERMISSIONS, default-deny) — un token PRESTATAIRE
 *      est refusé sur /api/prestataires/[id], /api/baremes, /api/dossiers,
 *      /api/sante/actes-assure, /api/portail-client et sur toute route non
 *      déclarée (/api/factures n'existe pas) ; il est admis uniquement sur
 *      /api/portail-prestataire*.
 *   3. FAIL-CLOSED — un compte PRESTATAIRE sans liaison (aucune fiche
 *      Prestataire portant son e-mail) est refusé (403 actionnable), jamais
 *      servi avec des données vides silencieuses.
 *
 * Exécution « sans interface graphique » : les handlers sont appelés
 * directement avec des Request construits à la main (comme un attaquant qui
 * forgerait ses appels API) — le JWT est simulé au niveau getToken.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks hoistés ──────────────────────────────────────────────────────────

const jwtMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

const dbMocks = vi.hoisted(() => ({
  prestataireFindUnique: vi.fn(),
  prestataireFindFirst: vi.fn(),
  prestataireFindMany: vi.fn(),
  prestataireSocieteFindMany: vi.fn(),
  dossierCount: vi.fn(),
  dossierFindMany: vi.fn(),
  dossierGroupBy: vi.fn(),
  dossierQueryRaw: vi.fn(),
  baremeFindMany: vi.fn(),
  assureFindMany: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({ getToken: jwtMocks.getToken }));

vi.mock('@/lib/db', () => ({
  db: {
    prestataire: {
      findUnique: dbMocks.prestataireFindUnique,
      findFirst: dbMocks.prestataireFindFirst,
      findMany: dbMocks.prestataireFindMany,
    },
    prestataireSociete: { findMany: dbMocks.prestataireSocieteFindMany },
    dossier: {
      count: dbMocks.dossierCount,
      findMany: dbMocks.dossierFindMany,
      groupBy: dbMocks.dossierGroupBy,
    },
    $queryRaw: dbMocks.dossierQueryRaw,
    bareme: { findMany: dbMocks.baremeFindMany },
    assure: { findMany: dbMocks.assureFindMany },
  },
}));

// ─── Handlers sous test ─────────────────────────────────────────────────────

import { GET as GET_PORTAIL } from './route';
import { GET as GET_BAREMES } from './baremes/route';
import { GET as GET_ACTES } from './actes/route';
import { GET as GET_FACTURES } from './factures/route';
import { GET as GET_ASSURES } from './assures/route';
import { GET as GET_PORTAIL_CLIENT } from '@/app/api/portail-client/route';
import { authorizeRequest } from '@/lib/authorize';

// ─── Jeu de test : Prestataire A (connecté) vs Prestataire B (cible) ────────

const PREST_A = 'prest-A';
const PREST_B = 'prest-B'; // identité d'AUTRUI (manipulée par A)

const TOKEN_A = { id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg', prestataireId: PREST_A };

const FICHE_A = {
  id: PREST_A, nom: 'Clinique A', type: 'CLINIQUE', telephone: null, email: 'a@presta.mg',
  adresse: null, nif: null, stat: null, statutJuridique: null, statut: 'CONVENTIONNE', actif: true,
};

const CONVENTIONS_A = [{
  id: 'lienA1', prestataireId: PREST_A, societeId: 'soc-A', actif: true,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  societe: { id: 'soc-A', nom: 'Société A' },
}];

function requete(path: string): NextRequest {
  return new Request(`http://localhost${path}`) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  jwtMocks.getToken.mockResolvedValue(TOKEN_A);
  dbMocks.prestataireFindUnique.mockResolvedValue(FICHE_A);
  dbMocks.prestataireFindFirst.mockResolvedValue({ id: PREST_A });
  dbMocks.prestataireFindMany.mockResolvedValue([{ id: PREST_A, createdAt: new Date('2020-01-01') }]);
  dbMocks.prestataireSocieteFindMany.mockResolvedValue(CONVENTIONS_A);
  dbMocks.dossierCount.mockResolvedValue(0);
  dbMocks.dossierFindMany.mockResolvedValue([]);
  dbMocks.dossierGroupBy.mockResolvedValue([]);
  dbMocks.dossierQueryRaw.mockResolvedValue([{
    facturesemises: 0, facturesreglees: 0, facturesrejetees: 0,
    montantfacture: 0, montantregule: 0, montantrestant: 0,
  }]);
  dbMocks.baremeFindMany.mockResolvedValue([]);
  dbMocks.assureFindMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. IDENTITÉ SERVEUR — la route principale
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portail-prestataire — identité serveur et isolation', () => {
  it('401 sans token (accès direct sans session)', async () => {
    jwtMocks.getToken.mockResolvedValue(null);
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(401);
  });

  it('403 pour un rôle interne (défense en profondeur)', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'u1', role: 'ACCUEIL', email: 'x@y.z' });
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(403);
  });

  it('ADMINISTRATEUR → mode démonstration (aucune donnée prestataire)', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uAdm', role: 'ADMINISTRATEUR', email: 'adm@x.mg' });
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('ADMINISTRATEUR');
    expect(body.prestataire).toBeUndefined();
    expect(body.kpis).toBeUndefined();
  });

  it('PRESTATAIRE A → toutes les lectures DB contraintes par prestataireId = A', async () => {
    dbMocks.dossierCount.mockResolvedValue(3);
    dbMocks.dossierFindMany.mockResolvedValue([]);
    dbMocks.dossierGroupBy.mockResolvedValue([{ societeId: 'soc-A', _count: { _all: 3 } }]);

    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('PRESTATAIRE');
    expect(body.prestataire.id).toBe(PREST_A);

    // count / findMany / groupBy : where contraint côté serveur
    expect(dbMocks.dossierCount).toHaveBeenCalled();
    for (const call of dbMocks.dossierCount.mock.calls) {
      expect(call[0].where.prestataireId).toBe(PREST_A);
    }
    for (const call of dbMocks.dossierFindMany.mock.calls) {
      expect(call[0].where.prestataireId).toBe(PREST_A);
    }
    for (const call of dbMocks.dossierGroupBy.mock.calls) {
      expect(call[0].where.prestataireId).toBe(PREST_A);
    }
    // $queryRaw (KPI factures) : le SQL contient la contrainte de périmètre
    // avec le prestataireId du serveur en paramètre lié (jamais interpolé)
    expect(dbMocks.dossierQueryRaw).toHaveBeenCalled();
    for (const call of dbMocks.dossierQueryRaw.mock.calls) {
      const sql = call[0] as { strings: string[]; values: unknown[] };
      expect(sql.strings.join('?')).toContain('"prestataireId" =');
      expect(sql.values).toContain(PREST_A);
      expect(sql.values).not.toContain(PREST_B);
    }
    expect(body.kpis.actesRealises).toBe(3);
  });

  it('Prestataire A manipule ?prestataireId=B → 403 et AUCUNE requête DB', async () => {
    const res = await GET_PORTAIL(requete(`/api/portail-prestataire?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toMatch(/refus/i);
    // Aucune fuite : pas de lecture sur B ni sur A
    expect(dbMocks.prestataireFindUnique).not.toHaveBeenCalled();
    expect(dbMocks.dossierFindMany).not.toHaveBeenCalled();
    expect(dbMocks.dossierCount).not.toHaveBeenCalled();
    expect(dbMocks.dossierQueryRaw).not.toHaveBeenCalled();
    // L'erreur ne révèle rien sur B
    expect(JSON.stringify(body)).not.toContain(PREST_B);
  });

  it('prestataireId identique au serveur (?prestataireId=A) → accepté', async () => {
    const res = await GET_PORTAIL(requete(`/api/portail-prestataire?prestataireId=${PREST_A}`));
    expect(res.status).toBe(200);
  });

  it('FAIL-CLOSED : compte PRESTATAIRE sans fiche rattachée → 403 actionnable', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uX', role: 'PRESTATAIRE', email: 'orphelin@x.mg' });
    dbMocks.prestataireFindMany.mockResolvedValue([]); // aucune fiche ne porte cet e-mail
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain('orphelin@x.mg');
  });

  it('auto-réparation : token sans prestataireId → re-résolution par e-mail', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg' });
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(200);
    expect(dbMocks.prestataireFindMany).toHaveBeenCalled(); // résolution contrôlée par e-mail
  });

  it('id périmé (fiche supprimée) + liaison irretrouvable → 403 (jamais 200 vide)', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg', prestataireId: 'prest-mort' });
    dbMocks.prestataireFindUnique.mockResolvedValue(null);
    dbMocks.prestataireFindMany.mockResolvedValue([]); // re-résolution impossible
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ROUTES DÉRIVÉES — actes, factures, barèmes, assurés
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portail-prestataire/actes — isolation', () => {
  it('A ne voit que SES actes (where.prestataireId = A, jamais B)', async () => {
    dbMocks.dossierCount.mockResolvedValue(1);
    dbMocks.dossierFindMany.mockResolvedValue([]);
    const res = await GET_ACTES(requete('/api/portail-prestataire/actes'));
    expect(res.status).toBe(200);
    const where = dbMocks.dossierFindMany.mock.calls[0][0].where;
    expect(where.prestataireId).toBe(PREST_A);
    expect(where.prestataireId).not.toBe(PREST_B);
  });

  it('filtre societeId du navigateur : intersection (n\u2019élargit jamais le périmètre)', async () => {
    await GET_ACTES(requete('/api/portail-prestataire/actes?societeId=soc-X'));
    const where = dbMocks.dossierFindMany.mock.calls[0][0].where;
    expect(where.prestataireId).toBe(PREST_A); // périmètre inchangé
    expect(where.societeId).toBe('soc-X');      // simple restriction
  });

  it('pagination serveur (skip/take bornés)', async () => {
    await GET_ACTES(requete('/api/portail-prestataire/actes?page=3&limit=999'));
    const q = dbMocks.dossierFindMany.mock.calls[0][0];
    expect(q.skip).toBe(100); // (3-1) × limite bornée à 50
    expect(q.take).toBe(50);  // borne max
  });

  it('?prestataireId=B → 403, aucune requête DB', async () => {
    const res = await GET_ACTES(requete(`/api/portail-prestataire/actes?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
    expect(dbMocks.dossierFindMany).not.toHaveBeenCalled();
    expect(dbMocks.dossierCount).not.toHaveBeenCalled();
  });

  it('ADMINISTRATEUR → 403 (pas de données de prestataire)', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uAdm', role: 'ADMINISTRATEUR', email: 'adm@x.mg' });
    const res = await GET_ACTES(requete('/api/portail-prestataire/actes'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/portail-prestataire/factures — isolation', () => {
  // Ligne renvoyée par la requête SQL de page (statut dérivé EN BASE).
  const LIGNE_SQL = (over: Record<string, unknown> = {}) => ({
    id: 'r1', numeroDossier: 'DOS-2026-000101',
    dateReception: new Date('2026-03-10T09:00:00Z'), datePaiement: null,
    referencePaiement: null, statut: 'VALIDE',
    montantReclame: '100000', montantValide: null, montantPaye: null,
    typeDossier: 'CONSULTATION_SIMPLE', statutFacture: 'VALIDEE', solde: '100000',
    societeId: 'soc-A', societeNom: 'Société A', total: 1,
    ...over,
  });

  const TOTAUX_SQL = (over: Record<string, unknown> = {}) => [
    { totalFacture: '100000', totalRegle: '0', totalSolde: '100000', ...over },
  ];

  /** Simule les DEUX requêtes SQL (page avec COUNT(*) OVER, totaux avec SUM). */
  const simulerSql = (lignes: Record<string, unknown>[], totaux = TOTAUX_SQL()) => {
    dbMocks.dossierQueryRaw.mockImplementation(async (sql: { strings: string[] }) => {
      const texte = sql.strings.join('?');
      return texte.includes('SUM(') ? totaux : lignes;
    });
  };

  it('factures = dossiers de règlement prestataire DU prestataire connecté (SQL paramétré)', async () => {
    simulerSql([LIGNE_SQL()]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures'));
    expect(res.status).toBe(200);
    expect(dbMocks.dossierQueryRaw).toHaveBeenCalled();
    for (const call of dbMocks.dossierQueryRaw.mock.calls) {
      const sql = call[0] as { strings: string[]; values: unknown[] };
      const texte = sql.strings.join('?');
      expect(texte).toContain('"prestataireId" =');
      expect(texte).toContain("'REGLEMENT_PRESTATAIRE'");
      expect(sql.values).toContain(PREST_A);
      expect(sql.values).not.toContain(PREST_B);
    }
  });

  it('filtre statut dérivé appliqué EN BASE (paramètre lié, liste blanche)', async () => {
    simulerSql([LIGNE_SQL({ statutFacture: 'REGLEE', statut: 'PAYE', montantPaye: '100000', solde: '0' })]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures?statutFacture=REGLEE'));
    expect(res.status).toBe(200);
    for (const call of dbMocks.dossierQueryRaw.mock.calls) {
      const sql = call[0] as { strings: string[]; values: unknown[] };
      expect(sql.strings.join('?')).toContain('WHERE "statutFacture" =');
      expect(sql.values).toContain('REGLEE');
    }
    const body = await res.json();
    expect(body.factures[0].statutFacture).toBe('REGLEE');
    expect(body.factures[0].statutFactureLabel).toBe('Réglée');
    expect(body.totaux.montantFacture).toBe(100000);
  });

  it('statut dérivé invalide → filtre ignoré (jamais interpolé brut)', async () => {
    simulerSql([LIGNE_SQL()]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures?statutFacture=PIRATE'));
    expect(res.status).toBe(200);
    for (const call of dbMocks.dossierQueryRaw.mock.calls) {
      expect(sqlTexte(call)).not.toContain('WHERE "statutFacture"');
    }
  });

  it('pagination EN BASE (OFFSET/LIMIT bornés) + total exact de l ensemble filtré', async () => {
    simulerSql([LIGNE_SQL({ total: 201 })]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures?page=3&limit=999'));
    expect(res.status).toBe(200);
    const sql = sqlTexte(dbMocks.dossierQueryRaw.mock.calls[0]);
    expect(sql).toContain('OFFSET');
    expect(sql).toContain('LIMIT');
    const valeurs = (dbMocks.dossierQueryRaw.mock.calls[0][0] as { values: unknown[] }).values;
    expect(valeurs).toContain(200); // (3-1) × limite bornée à 100
    expect(valeurs).toContain(100); // borne max (LIMITES_PAGE.max)
    const body = await res.json();
    expect(body.pagination.total).toBe(201);
    expect(body.pagination.totalPages).toBe(Math.ceil(201 / 100));
  });

  it('la dérivation SQL conserve la précédence de deriveStatutFacture (tripwire)', async () => {
    simulerSql([]);
    await GET_FACTURES(requete('/api/portail-prestataire/factures'));
    const sql = sqlTexte(dbMocks.dossierQueryRaw.mock.calls[0]);
    // REJETEE préempte tout, puis PARTIELLEMENT_REGLEE, puis REGLEE
    const posRejetee = sql.indexOf("THEN 'REJETEE'");
    const posPartielle = sql.indexOf("THEN 'PARTIELLEMENT_REGLEE'");
    const posReglee = sql.indexOf("THEN 'REGLEE'");
    expect(posRejetee).toBeGreaterThan(-1);
    expect(posPartielle).toBeGreaterThan(posRejetee);
    expect(posReglee).toBeGreaterThan(posPartielle);
    // dû = COALESCE(validé, réclamé, 0) — même définition que montantDu()
    expect(sql).toContain('COALESCE(d."montantValide", d."montantReclame", 0)');
  });

  it('?prestataireId=B → 403, aucune requête DB', async () => {
    const res = await GET_FACTURES(requete(`/api/portail-prestataire/factures?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
    expect(dbMocks.dossierQueryRaw).not.toHaveBeenCalled();
  });
});

/** Concatène le SQL d'un appel $queryRaw (strings + placeholders unifiés). */
function sqlTexte(call: unknown[]): string {
  return (call[0] as { strings: string[] }).strings.join('?');
}

// ─── Garde d'ambiguïté de la liaison e-mail (miroir SPEC-6 sociétés) ────────

describe('Garde d ambiguïté de la liaison e-mail PRESTATAIRE', () => {
  it('portail : token sans prestataireId + e-mail partagé par 2 fiches → 403 fail-closed', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'groupe@presta.mg' });
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: PREST_A, createdAt: new Date('2020-01-01') },
      { id: PREST_B, createdAt: new Date('2021-01-01') },
    ]);
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toMatch(/ambigu/i);
    // Aucune donnée servie tant que la liaison est ambiguë
    expect(dbMocks.dossierFindMany).not.toHaveBeenCalled();
    expect(dbMocks.dossierQueryRaw).not.toHaveBeenCalled();
    // Ne révèle aucune identité de fiche
    expect(JSON.stringify(body)).not.toContain(PREST_A);
    expect(JSON.stringify(body)).not.toContain(PREST_B);
  });

  it('portail : e-mail unique → auto-réparation par e-mail conservée', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg' });
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: PREST_A, createdAt: new Date('2020-01-01') }]);
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(200);
    expect(dbMocks.prestataireFindUnique).toHaveBeenCalled(); // ancrage sur la fiche résolue
  });
});

describe('GET /api/portail-prestataire/baremes — isolation', () => {
  it('barèmes limités aux conventions du prestataire connecté', async () => {
    dbMocks.baremeFindMany.mockResolvedValue([
      {
        id: 'b1', societeId: 'soc-A', prestation: 'CONSULTATION',
        tauxCouverture: 80, plafond: '50000', description: null, active: true,
        // P1 : validité datée + versionnement (v1 en cours)
        valideDu: new Date('2020-01-01T00:00:00Z'),
        valideAu: null,
        version: 1,
        supprime: false,
      },
    ]);
    const res = await GET_BAREMES(requete('/api/portail-prestataire/baremes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.societes).toHaveLength(1);
    expect(body.societes[0].societeId).toBe('soc-A');
    expect(body.societes[0].baremes).toHaveLength(8); // 8 prestations parentes
    const consultation = body.societes[0].baremes.find(
      (b: { prestation: string }) => b.prestation === 'CONSULTATION'
    );
    expect(consultation.configure).toBe(true);
    expect(consultation.actif).toBe(true);
    // Les barèmes lus ne concernent QUE les sociétés de A
    expect(dbMocks.baremeFindMany.mock.calls[0][0].where.societeId).toEqual({ in: ['soc-A'] });
  });

  it('?prestataireId=B → 403, aucune requête DB', async () => {
    const res = await GET_BAREMES(requete(`/api/portail-prestataire/baremes?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
    expect(dbMocks.prestataireSocieteFindMany).not.toHaveBeenCalled();
    expect(dbMocks.baremeFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/portail-prestataire/assures — données minimales et intersection', () => {
  it('scope=clients : assurés des sociétés clientes actives uniquement, NSS masqué', async () => {
    dbMocks.assureFindMany.mockResolvedValue([{
      id: 'a1', nom: 'RAKOTO', prenom: 'Jean', nSS: '123456789012',
      typeBeneficiaire: 'ASSURE', actif: true, societeId: 'soc-A',
      societe: { id: 'soc-A', nom: 'Société A' },
    }]);
    const res = await GET_ASSURES(requete('/api/portail-prestataire/assures?scope=clients'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assures[0].nSSMasque).toBe('123••••••12');
    expect(JSON.stringify(body)).not.toContain('123456789012'); // NSS brut jamais exposé
    // Conventions actives uniquement + intersection
    expect(dbMocks.prestataireSocieteFindMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ prestataireId: PREST_A, actif: true })
    );
  });

  it('societeId étranger (soc-B) → liste vide SANS requête assuré (jamais les assurés d\u2019autrui)', async () => {
    const res = await GET_ASSURES(requete('/api/portail-prestataire/assures?scope=clients&societeId=soc-B'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assures).toEqual([]);
    expect(dbMocks.assureFindMany).not.toHaveBeenCalled();
  });

  it('scope=mes-actes : assurés distincts de SES actes', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      { assureId: 'a1', beneficiaire: 'Jean RAKOTO' },
    ]);
    const res = await GET_ASSURES(requete('/api/portail-prestataire/assures?scope=mes-actes'));
    const body = await res.json();
    expect(body.assures[0].assureId).toBe('a1');
    const where = dbMocks.dossierFindMany.mock.calls[0][0].where;
    expect(where.prestataireId).toBe(PREST_A);
  });

  it('?prestataireId=B → 403', async () => {
    const res = await GET_ASSURES(requete(`/api/portail-prestataire/assures?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RBAC CENTRAL — accès directs aux API sans interface graphique
// ═══════════════════════════════════════════════════════════════════════════

describe('RBAC central (API_PERMISSIONS) — token PRESTATAIRE vs routes existantes', () => {
  const attenduAutorise = async (path: string, method = 'GET', role = 'PRESTATAIRE') => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role, email: 'a@presta.mg', prestataireId: PREST_A });
    const req = new Request(`http://localhost${path}`, { method }) as unknown as NextRequest;
    Object.defineProperty(req, 'nextUrl', { value: new URL(`http://localhost${path}`) });
    const result = await authorizeRequest(req);
    return result.authorized;
  };

  it('GET /api/prestataires/B_ID (fiche interne) → REFUSÉ', async () => {
    expect(await attenduAutorise(`/api/prestataires/${PREST_B}`)).toBe(false);
  });

  it('GET /api/factures?prestataireId=B_ID (route inexistante) → REFUSÉ (default-deny)', async () => {
    expect(await attenduAutorise(`/api/factures?prestataireId=${PREST_B}`)).toBe(false);
  });

  it('GET /api/baremes?prestataireId=B_ID → REFUSÉ', async () => {
    expect(await attenduAutorise(`/api/baremes?prestataireId=${PREST_B}`)).toBe(false);
  });

  it('GET /api/actes?prestataireId=B_ID (route inexistante) → REFUSÉ (default-deny)', async () => {
    expect(await attenduAutorise(`/api/actes?prestataireId=${PREST_B}`)).toBe(false);
  });

  it('GET /api/sante/actes-assure?prestataireId=B_ID → REFUSÉ', async () => {
    expect(await attenduAutorise(`/api/sante/actes-assure?prestataireId=${PREST_B}`)).toBe(false);
  });

  it('GET /api/dossiers?prestataireId=B_ID → REFUSÉ', async () => {
    expect(await attenduAutorise(`/api/dossiers?prestataireId=${PREST_B}`)).toBe(false);
  });

  it('GET /api/portail-client (portail assuré/entreprise) → REFUSÉ', async () => {
    expect(await attenduAutorise('/api/portail-client')).toBe(false);
  });

  it('GET /api/portail-prestataire* → AUTORISÉ (5 routes du portail)', async () => {
    expect(await attenduAutorise('/api/portail-prestataire')).toBe(true);
    expect(await attenduAutorise('/api/portail-prestataire/baremes')).toBe(true);
    expect(await attenduAutorise('/api/portail-prestataire/actes')).toBe(true);
    expect(await attenduAutorise('/api/portail-prestataire/factures')).toBe(true);
    expect(await attenduAutorise('/api/portail-prestataire/assures')).toBe(true);
  });

  it('CONTACT_ENTREPRISE / TECHNIQUE → REFUSÉS sur le portail prestataire', async () => {
    expect(await attenduAutorise('/api/portail-prestataire', 'GET', 'CONTACT_ENTREPRISE')).toBe(false);
    expect(await attenduAutorise('/api/portail-prestataire/actes', 'GET', 'TECHNIQUE')).toBe(false);
  });
});

describe('Accès direct à /api/portail-client avec un token PRESTATAIRE', () => {
  it('403 — le portail client ignore le rôle PRESTATAIRE', async () => {
    jwtMocks.getToken.mockResolvedValue(TOKEN_A);
    const res = await GET_PORTAIL_CLIENT(requete('/api/portail-client'));
    expect(res.status).toBe(403);
  });
});
