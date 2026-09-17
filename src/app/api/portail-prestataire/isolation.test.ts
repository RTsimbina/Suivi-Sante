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
  prestataireSocieteFindMany: vi.fn(),
  dossierCount: vi.fn(),
  dossierFindMany: vi.fn(),
  dossierGroupBy: vi.fn(),
  baremeFindMany: vi.fn(),
  assureFindMany: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({ getToken: jwtMocks.getToken }));

vi.mock('@/lib/db', () => ({
  db: {
    prestataire: {
      findUnique: dbMocks.prestataireFindUnique,
      findFirst: dbMocks.prestataireFindFirst,
    },
    prestataireSociete: { findMany: dbMocks.prestataireSocieteFindMany },
    dossier: {
      count: dbMocks.dossierCount,
      findMany: dbMocks.dossierFindMany,
      groupBy: dbMocks.dossierGroupBy,
    },
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

const LIGNE_FACTURE = (over: Record<string, unknown>) => ({
  id: 'd1', numeroDossier: 'DOS-2026-000101', dateReception: new Date('2026-03-10T09:00:00Z'),
  datePaiement: null, referencePaiement: null, statut: 'VALIDE',
  montantReclame: '100000', montantValide: null, montantPaye: null,
  typeDossier: 'CONSULTATION_SIMPLE',
  societe: { id: 'soc-A', nom: 'Société A' },
  ...over,
});

function requete(path: string): NextRequest {
  return new Request(`http://localhost${path}`) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  jwtMocks.getToken.mockResolvedValue(TOKEN_A);
  dbMocks.prestataireFindUnique.mockResolvedValue(FICHE_A);
  dbMocks.prestataireFindFirst.mockResolvedValue({ id: PREST_A });
  dbMocks.prestataireSocieteFindMany.mockResolvedValue(CONVENTIONS_A);
  dbMocks.dossierCount.mockResolvedValue(0);
  dbMocks.dossierFindMany.mockResolvedValue([]);
  dbMocks.dossierGroupBy.mockResolvedValue([]);
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
    // L'erreur ne révèle rien sur B
    expect(JSON.stringify(body)).not.toContain(PREST_B);
  });

  it('prestataireId identique au serveur (?prestataireId=A) → accepté', async () => {
    const res = await GET_PORTAIL(requete(`/api/portail-prestataire?prestataireId=${PREST_A}`));
    expect(res.status).toBe(200);
  });

  it('FAIL-CLOSED : compte PRESTATAIRE sans fiche rattachée → 403 actionnable', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uX', role: 'PRESTATAIRE', email: 'orphelin@x.mg' });
    dbMocks.prestataireFindFirst.mockResolvedValue(null);
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain('orphelin@x.mg');
  });

  it('auto-réparation : token sans prestataireId → re-résolution par e-mail', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg' });
    const res = await GET_PORTAIL(requete('/api/portail-prestataire'));
    expect(res.status).toBe(200);
    expect(dbMocks.prestataireFindFirst).toHaveBeenCalled();
  });

  it('id périmé (fiche supprimée) + liaison irretrouvable → 403 (jamais 200 vide)', async () => {
    jwtMocks.getToken.mockResolvedValue({ id: 'uA', role: 'PRESTATAIRE', email: 'a@presta.mg', prestataireId: 'prest-mort' });
    dbMocks.prestataireFindUnique.mockResolvedValue(null);
    dbMocks.prestataireFindFirst.mockResolvedValue(null);
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
  it('factures = dossiers de règlement prestataire DU prestataire connecté', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([]);
    await GET_FACTURES(requete('/api/portail-prestataire/factures'));
    const where = dbMocks.dossierFindMany.mock.calls[0][0].where;
    expect(where.prestataireId).toBe(PREST_A);
    expect(where.categorieDossier).toBe('REGLEMENT_PRESTATAIRE');
  });

  it('filtre statut dérivé : statutFacture=REGLEE ne renvoie que les réglées', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      LIGNE_FACTURE({ id: 'r1', statut: 'PAYE', montantReclame: '100000', montantPaye: '100000' }),
      LIGNE_FACTURE({ id: 'r2', statut: 'VALIDE', montantReclame: '200000', montantValide: '160000' }),
      LIGNE_FACTURE({ id: 'r3', statut: 'VALIDE', montantReclame: '300000', montantValide: '240000', montantPaye: '100000' }),
      LIGNE_FACTURE({ id: 'r4', statut: 'REJETE', montantReclame: '50000' }),
    ]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures?statutFacture=REGLEE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.factures[0].id).toBe('r1');
    expect(body.factures[0].statutFacture).toBe('REGLEE');
    expect(body.totaux.montantFacture).toBe(100000);
  });

  it('sans filtre : les 4 statuts dérivés sont corrects', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      LIGNE_FACTURE({ id: 'r1', statut: 'RECU' }),
      LIGNE_FACTURE({ id: 'r2', statut: 'EN_ANALYSE' }),
      LIGNE_FACTURE({ id: 'r3', statut: 'VALIDE', montantReclame: '300000', montantValide: '240000', montantPaye: '100000' }),
      LIGNE_FACTURE({ id: 'r4', statut: 'REJETE' }),
    ]);
    const res = await GET_FACTURES(requete('/api/portail-prestataire/factures'));
    const body = await res.json();
    expect(body.factures.map((f: { statutFacture: string }) => f.statutFacture))
      .toEqual(['SOUMISE', 'EN_TRAITEMENT', 'PARTIELLEMENT_REGLEE', 'REJETEE']);
  });

  it('?prestataireId=B → 403, aucune requête DB', async () => {
    const res = await GET_FACTURES(requete(`/api/portail-prestataire/factures?prestataireId=${PREST_B}`));
    expect(res.status).toBe(403);
    expect(dbMocks.dossierFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/portail-prestataire/baremes — isolation', () => {
  it('barèmes limités aux conventions du prestataire connecté', async () => {
    dbMocks.baremeFindMany.mockResolvedValue([
      { id: 'b1', societeId: 'soc-A', prestation: 'CONSULTATION', tauxCouverture: 80, plafond: '50000', description: null, active: true },
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
