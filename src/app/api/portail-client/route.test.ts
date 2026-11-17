/**
 * Tests de la route GET /api/portail-client — liaison assuré↔compte.
 * Correctif « Aucun assuré lié à votre compte » :
 *   1. Le JWT fige assureId/societeId pour 8 h — si la liaison (e-mail assuré
 *      ↔ compte) a été créée/corrigée APRÈS la connexion, la route doit
 *      re-résoudre DEPUIS LA BASE à partir de l'e-mail authentifié du token.
 *   2. Si l'id du token pointe vers un assuré supprimé/recréé, re-résolution
 *      par e-mail au lieu d'un 404 définitif.
 *   3. Sans liaison possible, 403 actionnable mentionnant l'e-mail recherché.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const jwtMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  utilisateurFindUnique: vi.fn(),
  assureFindUnique: vi.fn(),
  assureFindFirst: vi.fn(),
  assureFindMany: vi.fn(),
  contratFindMany: vi.fn(),
  dossierFindMany: vi.fn(),
  dossierCount: vi.fn(),
  dossierAggregate: vi.fn(),
  dossierGroupBy: vi.fn(),
  baremeFindMany: vi.fn(),
  societeFindUnique: vi.fn(),
  societeFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: jwtMocks.getToken,
}));

vi.mock('@/lib/db', () => ({
  db: {
    // P1 Révocation : la route relit l'état du compte (existant + actif + version)
    utilisateur: { findUnique: dbMocks.utilisateurFindUnique },
    assure: {
      findUnique: dbMocks.assureFindUnique,
      findFirst: dbMocks.assureFindFirst,
      findMany: dbMocks.assureFindMany,
    },
    contrat: { findMany: dbMocks.contratFindMany },
    dossier: {
      findMany: dbMocks.dossierFindMany,
      // P2-02 : KPIs calculés sur l'ENSEMBLE filtré (hors page)
      count: dbMocks.dossierCount,
      aggregate: dbMocks.dossierAggregate,
      groupBy: dbMocks.dossierGroupBy,
    },
    bareme: { findMany: dbMocks.baremeFindMany },
    societe: { findUnique: dbMocks.societeFindUnique, findFirst: dbMocks.societeFindFirst },
    entrepriseContact: { findFirst: dbMocks.contactFindFirst },
  },
}));

import { GET } from './route';

function requeteGet(): NextRequest {
  return new Request('http://localhost/api/portail-client') as unknown as NextRequest;
}

const ASSURE_COMPLET = {
  id: 'assure-1',
  societeId: 'soc-1',
  nom: 'RAKOTO',
  prenom: 'Jean',
  nSS: '123456789012',
  matricule: 'M001',
  typeBeneficiaire: 'ASSURE',
  dateNaissance: null,
  sexe: 'M',
  dateEffet: null,
  bareme: 0.8,
  telephone: null,
  email: 'client@exemple.com',
  adresse: null,
  actif: true,
  codeFamille: null,
  societe: { id: 'soc-1', nom: 'Société A', adresse: null, telephone: null, email: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Valeurs par défaut : collections vides (ayants droit, contrats, dossiers, barèmes)
  dbMocks.societeFindFirst.mockResolvedValue(null); // aucune liaison par e-mail société
  dbMocks.assureFindMany.mockResolvedValue([]);
  dbMocks.contratFindMany.mockResolvedValue([]);
  dbMocks.dossierFindMany.mockResolvedValue([]);
  // P2-02 : KPIs sur l'ensemble filtré (agrégations vides = aucun dossier)
  dbMocks.dossierCount.mockResolvedValue(0);
  dbMocks.dossierAggregate.mockResolvedValue({ _sum: { montantReclame: null, montantPaye: null } });
  dbMocks.dossierGroupBy.mockResolvedValue([]);
  dbMocks.baremeFindMany.mockResolvedValue([]);
  // P1 Révocation : compte actif, version de session courante (= celle des jetons)
  dbMocks.utilisateurFindUnique.mockResolvedValue({ actif: true, sessionVersion: 1 });
});

describe('GET /api/portail-client — authentification et rôles', () => {
  it('401 sans token', async () => {
    jwtMocks.getToken.mockResolvedValue(null);
    const res = await GET(requeteGet());
    expect(res.status).toBe(401);
  });

  it('403 pour un rôle interne', async () => {
    jwtMocks.getToken.mockResolvedValue({ sessionVersion: 1, id: 'u1', role: 'ACCUEIL', email: 'a@b.c' });
    const res = await GET(requeteGet());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toBe('Accès refusé.');
  });
});

describe('GET /api/portail-client — mode PORTAIL_CLIENT', () => {
  it('auto-répare un token sans assureId via re-résolution par e-mail (liaison créée après connexion)', async () => {
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u1', role: 'PORTAIL_CLIENT', email: 'client@exemple.com', // pas d'assureId
    });
    dbMocks.assureFindFirst.mockResolvedValue({ id: 'assure-1', societeId: 'soc-1' });
    dbMocks.assureFindUnique.mockResolvedValue(ASSURE_COMPLET);

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('PORTAIL_CLIENT');
    expect(body.assure.nom).toBe('RAKOTO');
    // La re-résolution a bien utilisé l'e-mail du token (jamais d'entrée client)
    expect(dbMocks.assureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'client@exemple.com', mode: 'insensitive' } },
      })
    );
  });

  it('répare un assureId périmé (assuré supprimé puis recréé) au lieu de renvoyer 404', async () => {
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u1', role: 'PORTAIL_CLIENT', email: 'client@exemple.com', assureId: 'ancien-id',
    });
    // 1er findUnique (ancien-id) → introuvable ; 2e (nouveau-id) → trouvé
    dbMocks.assureFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ASSURE_COMPLET);
    dbMocks.assureFindFirst.mockResolvedValue({ id: 'nouveau-id', societeId: 'soc-1' });

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assure.id).toBe('assure-1');
    // Deux chargements : l'ancien id puis le nouveau
    expect(dbMocks.assureFindUnique).toHaveBeenCalledTimes(2);
  });

  it('403 actionnable avec e-mail recherché quand aucun assuré ne porte cet e-mail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u1', role: 'PORTAIL_CLIENT', email: 'sans.liaison@exemple.com',
    });
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const res = await GET(requeteGet());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain('Aucun assuré lié à votre compte');
    expect(body.erreur).toContain('sans.liaison@exemple.com');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('403 sans e-mail dans le token : message générique sans parenthèses vides', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    jwtMocks.getToken.mockResolvedValue({ sessionVersion: 1, id: 'u1', role: 'PORTAIL_CLIENT' });
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const res = await GET(requeteGet());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain('Aucun assuré lié à votre compte.');
    expect(body.erreur).not.toContain('e-mail recherché');
    errorSpy.mockRestore();
  });
});

describe('GET /api/portail-client — mode CONTACT_ENTREPRISE', () => {
  it('auto-répare un token sans societeId via le contact d\'entreprise', async () => {    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u2', role: 'CONTACT_ENTREPRISE', email: 'contact@entreprise.mg', // pas de societeId
    });
    dbMocks.contactFindFirst.mockResolvedValue({ societeId: 'soc-1' });
    dbMocks.societeFindUnique.mockResolvedValue({ id: 'soc-1', nom: 'Société A' });

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('CONTACT_ENTREPRISE');
    expect(body.societe.nom).toBe('Société A');
    expect(dbMocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'contact@entreprise.mg', mode: 'insensitive' } },
      })
    );
  });

  it('403 actionnable quand aucun contact d\'entreprise ne porte cet e-mail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u2', role: 'CONTACT_ENTREPRISE', email: 'orphelin@entreprise.mg',
    });
    dbMocks.contactFindFirst.mockResolvedValue(null);

    const res = await GET(requeteGet());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain('Aucune société liée à votre compte');
    expect(body.erreur).toContain('orphelin@entreprise.mg');
    errorSpy.mockRestore();
  });
});

// ─── P2-03 : confidentialité du NSS (masquage backend, jamais visuel) ────────

const AYANT_DROIT = {
  id: 'assure-2',
  nom: 'RABE',
  prenom: 'Marie',
  nSS: '987654321098',
  matricule: 'M002',
  typeBeneficiaire: 'CONJOINT',
  dateNaissance: null,
  sexe: 'F',
  dateEffet: null,
  bareme: 0.8,
  telephone: '03411111111',
  email: 'rabe@exemple.mg',
  adresse: 'Antananarivo',
  actif: true,
  codeFamille: 'FAM-1',
  _count: { dossiers: 2 },
};

describe('GET /api/portail-client — P2-03 confidentialité du NSS', () => {
  it('PORTAIL_CLIENT : NSS masqué pour l\'assuré, famille projetée SANS NSS ni coordonnées', async () => {
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u1', role: 'PORTAIL_CLIENT', email: 'client@exemple.com', assureId: 'assure-1',
    });
    dbMocks.assureFindUnique.mockResolvedValue(ASSURE_COMPLET);
    dbMocks.assureFindMany.mockResolvedValue([AYANT_DROIT]);

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    // Seuls les 4 derniers caractères restent lisibles
    expect(body.assure.nSS).toBe('••••••••9012');
    expect(body.assure.nSS).not.toContain('123456');
    // La famille ne contient plus NI NSS NI coordonnées sensibles
    expect(body.famille).toHaveLength(1);
    for (const champ of ['nSS', 'email', 'telephone', 'adresse', 'matricule']) {
      expect(body.famille[0]).not.toHaveProperty(champ);
    }
    // Les champs affichés restent présents (fonctionnalités préservées)
    expect(body.famille[0].nom).toBe('RABE');
    expect(body.famille[0].typeBeneficiaire).toBe('CONJOINT');
    expect(body.famille[0]._count.dossiers).toBe(2);
  });

  it('CONTACT_ENTREPRISE : NSS masqué pour tous les assurés de la société', async () => {
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u2', role: 'CONTACT_ENTREPRISE', email: 'contact@entreprise.mg', societeId: 'soc-1',
    });
    dbMocks.societeFindUnique.mockResolvedValue({
      id: 'soc-1', nom: 'Société A', adresse: null, telephone: null, email: null,
    });
    dbMocks.assureFindMany.mockResolvedValue([
      { ...ASSURE_COMPLET, _count: { dossiers: 1 } },
      { ...AYANT_DROIT, societeId: 'soc-1', _count: { dossiers: 0 } },
    ]);

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assures).toHaveLength(2);
    for (const a of body.assures) {
      expect(a.nSS).toMatch(/^•+.{4}$/);
      expect(a.nSS).not.toContain('123456');
      expect(a.nSS).not.toContain('987654');
    }
    // Les autres champs métier restent présents
    expect(body.assures[0].nom).toBe('RAKOTO');
    expect(body.assures[0].matricule).toBe('M001');
  });

  it('ADMINISTRATEUR : le masquage du portail n\'est pas contournable (mode test sans données)', async () => {
    jwtMocks.getToken.mockResolvedValue({
      sessionVersion: 1,
      id: 'u3', role: 'ADMINISTRATEUR', email: 'admin@exemple.mg',
    });

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('ADMINISTRATEUR');
    expect(body).not.toHaveProperty('assure');
    expect(body).not.toHaveProperty('assures');
    expect(body).not.toHaveProperty('dossiers');
  });
});
