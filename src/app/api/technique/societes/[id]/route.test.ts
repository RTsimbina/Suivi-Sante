/**
 * Tests des routes PUT / DELETE /api/technique/societes/[id] — spécifications
 * Sociétés clientes :
 *   - S4  : modification avec collision de nom normalisé → 409 ; sans
 *     collision → champs mis à jour ;
 *   - S5  : audit par champ — changement de emailContactPrincipal (liaison
 *     portail) audité avec ancienne/nouvelle valeur ;
 *   - S6  : suppression sans dépendance → 200, transaction ordonnée,
 *     audit SUPPRESSION écrit AVANT la suppression ;
 *   - S7  : suppression avec dossiers → 409 motivé, aucune écriture ;
 *   - S8  : suppression avec assurés (sans dossiers) → 409 motivé (jamais de
 *     500 FK brut) ;
 *   - S9  : suppression avec appels de fonds sur contrats → 409 motivé,
 *     contrats NON supprimés ;
 *   - S11 : bascule actif → inactif auditable via PUT.
 *
 * Le gate checkAuth est simulé ; la base est mockée.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
  getUserInfoFromRequest: vi
    .fn()
    .mockResolvedValue({ nom: 'Admin', id: 'u-admin', role: 'ADMINISTRATEUR' }),
}));

const dbMocks = vi.hoisted(() => ({
  societeFindUnique: vi.fn(),
  societeFindMany: vi.fn().mockResolvedValue([]),
  societeUpdate: vi.fn(),
  societeDelete: vi.fn(),
  baremeDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  contratDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  appelDeFondsCount: vi.fn().mockResolvedValue(0),
  modeCalculCount: vi.fn().mockResolvedValue(0),
  transaction: null as unknown as Mock,
}));

/** Client tx transmis à la callback de $transaction */
function makeTxClient() {
  return {
    bareme: { deleteMany: dbMocks.baremeDeleteMany },
    contrat: { deleteMany: dbMocks.contratDeleteMany },
    societe: {
      update: dbMocks.societeUpdate,
      delete: dbMocks.societeDelete,
    },
  };
}

dbMocks.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTxClient()));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
  getUserInfoFromRequest: auditMocks.getUserInfoFromRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => dbMocks.transaction(cb),
    societe: {
      findUnique: dbMocks.societeFindUnique,
      findMany: dbMocks.societeFindMany,
      update: dbMocks.societeUpdate,
      delete: dbMocks.societeDelete,
    },
    bareme: { deleteMany: dbMocks.baremeDeleteMany },
    contrat: { deleteMany: dbMocks.contratDeleteMany },
    appelDeFonds: { count: dbMocks.appelDeFondsCount },
    modeCalculAppelFonds: { count: dbMocks.modeCalculCount },
  },
}));

import { PUT, DELETE } from './route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PARAMS = { params: Promise.resolve({ id: 'soc-1' }) };

function requetePut(body: unknown): NextRequest {
  return new Request('http://localhost/api/technique/societes/soc-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requeteDelete(): NextRequest {
  return new Request('http://localhost/api/technique/societes/soc-1', {
    method: 'DELETE',
  }) as unknown as NextRequest;
}

const SOCIETE_EXISTANTE = {
  id: 'soc-1',
  nom: 'Techno-Madagascar',
  nomNormalise: 'techno madagascar',
  adresse: 'Anosy',
  telephone: '034 11 111 11',
  email: 'contact@techno.mg',
  nif: '4001234567',
  contactPrincipal: 'Rakoto Jean',
  emailContactPrincipal: 'dg@techno.mg',
  actif: true,
  baremes: [
    { id: 'bar-1', prestation: 'CONSULTATION', tauxCouverture: 80, plafond: 100000, description: null, active: true },
  ],
  _count: { dossiers: 0, contrats: 0, assures: 0 },
};

const SOCIETE_MISE_A_JOUR = {
  ...SOCIETE_EXISTANTE,
  baremes: SOCIETE_EXISTANTE.baremes,
  _count: SOCIETE_EXISTANTE._count,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.societeFindUnique.mockResolvedValue(SOCIETE_EXISTANTE);
  dbMocks.societeFindMany.mockResolvedValue([]);
  dbMocks.societeUpdate.mockResolvedValue(SOCIETE_MISE_A_JOUR);
  dbMocks.societeDelete.mockResolvedValue(SOCIETE_EXISTANTE);
  dbMocks.appelDeFondsCount.mockResolvedValue(0);
  dbMocks.modeCalculCount.mockResolvedValue(0);
});

// ─── S4 : modification et collision de nom ──────────────────────────────────

describe('S4 — PUT collision de nom (SPEC-1)', () => {
  it('collision avec une autre société → 409, aucune écriture', async () => {
    dbMocks.societeFindMany.mockResolvedValue([
      { id: 'soc-2', nom: 'Ny Havana Services', nomNormalise: 'ny havana services', emailContactPrincipal: null },
    ]);

    const res = await PUT(requetePut({ nom: 'ny havana services' }), PARAMS);
    expect(res.status).toBe(409);
    expect(dbMocks.societeUpdate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('même nom inchangé (pas de collision avec soi-même) → 200', async () => {
    dbMocks.societeFindMany.mockResolvedValue([
      {
        id: 'soc-1',
        nom: 'Techno-Madagascar',
        nomNormalise: 'techno madagascar',
        emailContactPrincipal: 'dg@techno.mg',
      },
    ]);

    const res = await PUT(requetePut({ nom: 'Techno-Madagascar' }), PARAMS);
    expect(res.status).toBe(200);
    expect(dbMocks.societeUpdate).toHaveBeenCalled();
  });

  it('champs sans collision → mis à jour (nom normalisé recalculé)', async () => {
    const res = await PUT(requetePut({ adresse: 'Isotry, Antananarivo' }), PARAMS);
    expect(res.status).toBe(200);
    expect(dbMocks.societeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'soc-1' },
        data: expect.objectContaining({ adresse: 'Isotry, Antananarivo' }),
      })
    );
  });

  it('SPEC-6 — e-mail de liaison déjà pris par une autre société → 409 même sans changement de nom', async () => {
    dbMocks.societeFindMany.mockResolvedValue([
      { id: 'soc-2', nom: 'Ny Havana', nomNormalise: 'ny havana', emailContactPrincipal: 'contact@nyhavana.mg' },
    ]);

    const res = await PUT(requetePut({ emailContactPrincipal: 'CONTACT@NYHAVANA.MG' }), PARAMS);
    expect(res.status).toBe(409);
    expect(dbMocks.societeUpdate).not.toHaveBeenCalled();
  });
});

// ─── S5 : audit par champ ────────────────────────────────────────────────────

describe('S5 — PUT audit par champ (SPEC-3)', () => {
  it('changement de la liaison portail audité avec ancienne / nouvelle valeur', async () => {
    await PUT(requetePut({ emailContactPrincipal: 'nouveau@techno.mg' }), PARAMS);

    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Societe',
        entiteId: 'soc-1',
        champ: 'emailContactPrincipal',
        ancienneValeur: 'dg@techno.mg',
        nouvelleValeur: 'nouveau@techno.mg',
        modifiePar: 'Admin',
        modifieParId: 'u-admin',
      })
    );
  });

  it('champ inchangé non audité ; champ modifié audité une fois', async () => {
    await PUT(requetePut({ nom: 'Techno-Madagascar', contactPrincipal: 'Rakoto Jeanne' }), PARAMS);

    const appels = auditMocks.logParametreChange.mock.calls.map((c) => c[0]);
    // le nom identique ne produit AUCUNE ligne d'audit
    expect(appels.filter((a: { champ: string }) => a.champ === 'nom')).toHaveLength(0);
    // le contact modifié en produit une seule
    expect(appels.filter((a: { champ: string }) => a.champ === 'contactPrincipal')).toHaveLength(1);
  });

  it('S11 — bascule actif → inactif audité et persistée', async () => {
    const res = await PUT(requetePut({ actif: false }), PARAMS);
    expect(res.status).toBe(200);

    expect(dbMocks.societeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actif: false }),
      })
    );
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        champ: 'actif',
        ancienneValeur: true,
        nouvelleValeur: false,
      })
    );
  });

  it('société introuvable → 404, aucun audit', async () => {
    dbMocks.societeFindUnique.mockResolvedValue(null);
    const res = await PUT(requetePut({ nom: 'X' }), PARAMS);
    expect(res.status).toBe(404);
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });
});

// ─── S6–S9 : suppression protégée ────────────────────────────────────────────

describe('S6 — DELETE sans dépendance', () => {
  it('200 + transaction ordonnée (barèmes → contrats → société) + audit SUPPRESSION', async () => {
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(200);

    // Suppression ordonnée dans la transaction
    expect(dbMocks.baremeDeleteMany).toHaveBeenCalledWith({ where: { societeId: 'soc-1' } });
    expect(dbMocks.contratDeleteMany).toHaveBeenCalledWith({ where: { societeId: 'soc-1' } });
    expect(dbMocks.societeDelete).toHaveBeenCalledWith({ where: { id: 'soc-1' } });

    // SPEC-3 : audit écrit AVANT la suppression (l'entrée survit à la fiche)
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Societe',
        entiteId: 'soc-1',
        champ: 'SUPPRESSION',
        ancienneValeur: expect.stringContaining('Techno-Madagascar'),
        nouvelleValeur: null,
      })
    );
    const ordreAudit = auditMocks.logParametreChange.mock.invocationCallOrder[0];
    const ordreSuppression = dbMocks.societeDelete.mock.invocationCallOrder[0];
    expect(ordreAudit).toBeLessThan(ordreSuppression);
  });
});

describe('S7 — DELETE avec dossiers → 409 motivé', () => {
  beforeEach(() => {
    dbMocks.societeFindUnique.mockResolvedValue({
      ...SOCIETE_EXISTANTE,
      _count: { dossiers: 8, contrats: 1, assures: 0 },
    });
  });

  it('409 avec le nombre de dossiers, aucune suppression ni audit de suppression', async () => {
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.erreur).toContain('8 dossier(s)');
    expect(data.blocages).toEqual([expect.objectContaining({ libelle: 'dossiers' })]);

    expect(dbMocks.societeDelete).not.toHaveBeenCalled();
    expect(dbMocks.contratDeleteMany).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });
});

describe('S8 — DELETE avec assurés (sans dossiers) → 409 motivé, jamais 500 FK', () => {
  beforeEach(() => {
    dbMocks.societeFindUnique.mockResolvedValue({
      ...SOCIETE_EXISTANTE,
      _count: { dossiers: 0, contrats: 1, assures: 42 },
    });
  });

  it('409 avec le nombre d\'assurés, société intacte', async () => {
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.erreur).toContain('42 assuré(s)');
    expect(data.blocages.map((b: { libelle: string }) => b.libelle)).toEqual(['assurés']);
    expect(dbMocks.societeDelete).not.toHaveBeenCalled();
  });
});

describe('S9 — DELETE avec appels de fonds sur contrats → 409, contrats préservés', () => {
  beforeEach(() => {
    dbMocks.societeFindUnique.mockResolvedValue({
      ...SOCIETE_EXISTANTE,
      _count: { dossiers: 0, contrats: 2, assures: 0 },
    });
    dbMocks.appelDeFondsCount.mockResolvedValue(5);
  });

  it('409 explicitant les appels de fonds, contrats NON supprimés', async () => {
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.erreur).toContain('5 appel(s) de fonds');
    expect(data.blocages.map((b: { libelle: string }) => b.libelle)).toEqual(['appels de fonds']);

    // Aucune écriture : ni contrats (données comptables), ni société
    expect(dbMocks.contratDeleteMany).not.toHaveBeenCalled();
    expect(dbMocks.baremeDeleteMany).not.toHaveBeenCalled();
    expect(dbMocks.societeDelete).not.toHaveBeenCalled();
  });

  it('blocages cumulés (dossiers + assurés + appels) listés ensemble', async () => {
    dbMocks.societeFindUnique.mockResolvedValue({
      ...SOCIETE_EXISTANTE,
      _count: { dossiers: 3, contrats: 2, assures: 7 },
    });
    dbMocks.modeCalculCount.mockResolvedValue(1);

    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.blocages.map((b: { libelle: string }) => b.libelle)).toEqual([
      'dossiers',
      'assurés',
      'appels de fonds',
      'paramétrage des appels de fonds',
    ]);
  });
});

describe('DELETE — société introuvable', () => {
  it('404', async () => {
    dbMocks.societeFindUnique.mockResolvedValue(null);
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(404);
  });
});
