/**
 * Tests de la route POST /api/technique/societes — spécifications Sociétés
 * clientes :
 *   - S1  : création simple → 201 + audit CREATION (logParametreChange) ;
 *   - S2  : doublon exact de nom → 409 ;
 *   - S3  : doublon insensible à la casse / accents / séparateurs → 409 ;
 *   - S10 : validation Zod — NIF invalide → 422, message par champ ;
 *   - SPEC-6 : e-mail de contact principal déjà lié à une autre société → 409.
 *
 * Le gate checkAuth est simulé ; la base est mockée (conventions des tests
 * de routes du dépôt — voir prestataires/route.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  societeFindMany: vi.fn().mockResolvedValue([]),
  societeCreate: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
  getUserInfoFromRequest: auditMocks.getUserInfoFromRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    societe: {
      findMany: dbMocks.societeFindMany,
      create: dbMocks.societeCreate,
    },
  },
}));

import { POST } from './route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requetePost(body: unknown): NextRequest {
  return new Request('http://localhost/api/technique/societes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const FICHE_COMPLETE = {
  nom: 'Ny Havana Services',
  telephone: '034 11 222 33',
  email: 'contact@nyhavana.mg',
  nif: '3000123456',
  contactPrincipal: 'Rabe Alice',
  emailContactPrincipal: 'alice@nyhavana.mg',
};

const SOCIETE_CREEE = {
  id: 'soc-nouveau',
  nom: 'Ny Havana Services',
  nomNormalise: 'ny havana services',
  actif: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.societeFindMany.mockResolvedValue([]);
  dbMocks.societeCreate.mockResolvedValue(SOCIETE_CREEE);
});

// ─── S1 : création simple ────────────────────────────────────────────────────

describe('S1 — POST création simple', () => {
  it('201 + fiche créée avec nom normalisé et actif par défaut', async () => {
    const res = await POST(requetePost(FICHE_COMPLETE));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.societe.id).toBe('soc-nouveau');

    // Le nom normalisé est enregistré avec la fiche (colonne Societe.nomNormalise)
    expect(dbMocks.societeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nom: 'Ny Havana Services',
          nomNormalise: 'ny havana services',
          actif: true,
        }),
      })
    );
  });

  it('S1b — audit CREATION écrit (SPEC-3 : toute création de référentiel est tracée)', async () => {
    await POST(requetePost({ nom: 'Ny Havana Services' }));

    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Societe',
        entiteId: 'soc-nouveau',
        champ: 'CREATION',
        ancienneValeur: null,
        nouvelleValeur: 'Ny Havana Services',
        modifiePar: 'Admin',
        modifieParId: 'u-admin',
        societeId: 'soc-nouveau',
      })
    );
  });
});

// ─── S2 / S3 : doublons de nom ───────────────────────────────────────────────

describe('S2/S3 — POST doublons de nom (SPEC-1)', () => {
  const EXISTANTE = {
    id: 'soc-1',
    nom: 'Techno-Madagascar SARL',
    nomNormalise: 'techno madagascar sarl',
    emailContactPrincipal: null,
  };

  beforeEach(() => {
    dbMocks.societeFindMany.mockResolvedValue([EXISTANTE]);
  });

  it('S2 — doublon exact → 409, fiche en conflit citée, aucune écriture', async () => {
    const res = await POST(requetePost({ nom: 'Techno-Madagascar SARL' }));
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.erreur).toContain('Techno-Madagascar SARL');
    expect(dbMocks.societeCreate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('S3 — doublon insensible à la casse et aux accents → 409', async () => {
    for (const variante of ['techno madagascar sarl', 'TECHNO-MADAGASCAR SARL', 'Techno Madagascar Sarl']) {
      const res = await POST(requetePost({ nom: variante }));
      expect(res.status).toBe(409);
    }
    expect(dbMocks.societeCreate).not.toHaveBeenCalled();
  });
});

// ─── SPEC-6 : garde d'ambiguïté de la liaison portail ────────────────────────

describe('SPEC-6 — POST e-mail de contact principal ambigu', () => {
  beforeEach(() => {
    dbMocks.societeFindMany.mockResolvedValue([
      {
        id: 'soc-1',
        nom: 'Techno-Madagascar',
        nomNormalise: 'techno madagascar',
        emailContactPrincipal: 'dg@techno.mg',
      },
    ]);
  });

  it('e-mail déjà rattaché à une autre société → 409 explicite (liaison portail)', async () => {
    const res = await POST(
      requetePost({ nom: 'Nouvelle Société', emailContactPrincipal: 'DG@TECHNO.MG' })
    );
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.erreur).toContain('Techno-Madagascar');
    expect(data.erreur).toContain("qu'une seule société");
    expect(dbMocks.societeCreate).not.toHaveBeenCalled();
  });
});

// ─── S10 : validation Zod ────────────────────────────────────────────────────

describe('S10 — POST validation Zod (SPEC-2 : primitives partagées)', () => {
  // Convention du dépôt (parse.ts) : données non conformes au schéma → 400
  // avec détail par champ (les 422 sont réservés aux règles métier).
  it('NIF invalide (trop court) → 400 avec message de champ', async () => {
    const res = await POST(requetePost({ nom: 'Société Valide', nif: '4001' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(JSON.stringify(data)).toContain('NIF');
    expect(dbMocks.societeCreate).not.toHaveBeenCalled();
  });

  it('e-mail invalide → 400', async () => {
    const res = await POST(requetePost({ nom: 'Société Valide', email: 'pas-un-email' }));
    expect(res.status).toBe(400);
    expect(dbMocks.societeCreate).not.toHaveBeenCalled();
  });

  it('téléphone invalide (moins de 7 chiffres) → 400', async () => {
    const res = await POST(requetePost({ nom: 'Société Valide', telephone: '034' }));
    expect(res.status).toBe(400);
  });

  it('nom vide → 400', async () => {
    const res = await POST(requetePost({ nom: '' }));
    expect(res.status).toBe(400);
  });

  it('NIF valide avec séparateurs accepté (convention primitives partagées)', async () => {
    const res = await POST(requetePost({ ...FICHE_COMPLETE, nif: '3000 123 456' }));
    expect(res.status).toBe(201);
    expect(dbMocks.societeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nif: '3000 123 456' }),
      })
    );
  });
});
