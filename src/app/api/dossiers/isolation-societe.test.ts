/**
 * Tests d'isolation inter-sociétés au niveau des ROUTES métier
 * (dossiers / assurés / contrats) pour le rôle externe CONTACT_ENTREPRISE.
 *
 * Rappels d'architecture (src/lib/data-isolation.ts) :
 *   - les headers x-user-* sont injectés par le proxy depuis le JWT signé ;
 *   - un rôle externe est FORCÉ à sa société : tout ?societeId client est
 *     écrasé (intersection, jamais d'élargissement) ;
 *   - un accès unitaire hors périmètre → 404 (sans révéler l'existence) ;
 *   - un compte externe sans société → 403 fail-closed.
 *
 * Ces tests reproduisent le jeu de données de test de production
 * (scripts/reset_seed.mjs) : SANLAM (soc-A) vs TELMA (soc-B) — un compte
 * CONTACT_ENTREPRISE de la Société A ne doit JAMAIS voir les données de la
 * Société B, même en manipulant identifiant, URL ou paramètre de requête.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks (hoistés) ─────────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const dbMocks = vi.hoisted(() => ({
  dossierFindMany: vi.fn().mockResolvedValue([]),
  dossierCount: vi.fn().mockResolvedValue(0),
  dossierFindUnique: vi.fn(),
  assureFindMany: vi.fn().mockResolvedValue([]),
  assureCount: vi.fn().mockResolvedValue(0),
  assureGroupBy: vi.fn().mockResolvedValue([]),
  contratFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    dossier: {
      findMany: dbMocks.dossierFindMany,
      count: dbMocks.dossierCount,
      findUnique: dbMocks.dossierFindUnique,
    },
    assure: {
      findMany: dbMocks.assureFindMany,
      count: dbMocks.assureCount,
      groupBy: dbMocks.assureGroupBy,
    },
    contrat: {
      findMany: dbMocks.contratFindMany,
    },
  },
}));

import { GET as getDossiers } from './route';
import { GET as getAssures } from '../assures/route';
import { GET as getContrats } from '../contrats/route';
import { GET as getDossierDetail } from './[id]/detail/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOC_A = 'cmu4y4295000442wt7hqtgtbg'; // SANLAM MADAGASCAR ASSURANCE (jeu de test prod)
const SOC_B = 'cmu4y42b1000t42wtea0ncwc6'; // TELMA MADAGASCAR (jeu de test prod)

function requete(path: string, headers: Record<string, string> = {}): NextRequest {
  const r = new Request(`http://localhost${path}`, { headers });
  Object.defineProperty(r, 'nextUrl', { value: new URL(`http://localhost${path}`) });
  return r as unknown as NextRequest;
}

const EXTERNE_SOC_A = {
  'x-user-id': 'u-contact-a',
  'x-user-role': 'CONTACT_ENTREPRISE',
  'x-user-societeid': SOC_A,
};

const INTERNE = {
  'x-user-id': 'u-admin',
  'x-user-role': 'ADMINISTRATEUR',
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.dossierFindMany.mockResolvedValue([]);
  dbMocks.dossierCount.mockResolvedValue(0);
  dbMocks.assureFindMany.mockResolvedValue([]);
  dbMocks.assureCount.mockResolvedValue(0);
  dbMocks.contratFindMany.mockResolvedValue([]);
});

// ─── Dossiers ────────────────────────────────────────────────────────────────

describe('Isolation — GET /api/dossiers', () => {
  it('CONTACT_ENTREPRISE (Société A) → where { societeId: SOC_A } uniquement', async () => {
    const res = await getDossiers(requete('/api/dossiers', EXTERNE_SOC_A));

    expect(res.status).toBe(200);
    expect(dbMocks.dossierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { societeId: SOC_A } })
    );
    expect(dbMocks.dossierCount).toHaveBeenCalledWith({ where: { societeId: SOC_A } });
  });

  it('?societeId=SOC_B manipulé par le client → JAMAIS élargi (écrasé par le périmètre)', async () => {
    await getDossiers(requete(`/api/dossiers?societeId=${SOC_B}`, EXTERNE_SOC_A));

    expect(dbMocks.dossierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { societeId: SOC_A } })
    );
  });

  it('compte externe sans société → 403 fail-closed, aucune lecture DB', async () => {
    const res = await getDossiers(requete('/api/dossiers', {
      'x-user-id': 'u-orphan',
      'x-user-role': 'CONTACT_ENTREPRISE',
      // pas de x-user-societeid
    }));

    expect(res.status).toBe(403);
    expect(dbMocks.dossierFindMany).not.toHaveBeenCalled();
  });

  it('rôle interne (ADMINISTRATEUR) → périmètre global (where sans societeId)', async () => {
    await getDossiers(requete('/api/dossiers', INTERNE));

    expect(dbMocks.dossierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});

// ─── Détail dossier (accès unitaire hors périmètre) ─────────────────────────

describe('Isolation — GET /api/dossiers/[id]/detail', () => {
  it('dossier de la Société B demandé par la Société A → 404 (existence non révélée)', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(null);
    const res = await getDossierDetail(
      requete(`/api/dossiers/dos-B-1`, EXTERNE_SOC_A),
      { params: Promise.resolve({ id: 'dos-B-1' }) }
    );

    expect(res.status).toBe(404);
    // La contrainte societeId est fusionnée dans le where : impossible de lire
    // un dossier d'une autre société même en connaissant son identifiant.
    expect(dbMocks.dossierFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dos-B-1', societeId: SOC_A } })
    );
  });

  it('dossier de SA société → 200', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue({
      id: 'dos-A-1',
      societeId: SOC_A,
      numeroDossier: 'DOS-2026-000101',
      statut: 'RECU',
      historique: '[]',
    });
    const res = await getDossierDetail(
      requete('/api/dossiers/dos-A-1', EXTERNE_SOC_A),
      { params: Promise.resolve({ id: 'dos-A-1' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('dos-A-1');
  });
});

// ─── Assurés ────────────────────────────────────────────────────────────────

describe('Isolation — GET /api/assures', () => {
  it('CONTACT_ENTREPRISE (Société A) → where fusionné avec { societeId: SOC_A }', async () => {
    const res = await getAssures(requete('/api/assures', EXTERNE_SOC_A));

    expect(res.status).toBe(200);
    expect(dbMocks.assureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societeId: SOC_A }),
      })
    );
  });

  it('?societeId=SOC_B manipulé → périmètre intact (SOC_A)', async () => {
    await getAssures(requete(`/api/assures?societeId=${SOC_B}`, EXTERNE_SOC_A));

    expect(dbMocks.assureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societeId: SOC_A }),
      })
    );
  });

  it('compte externe sans société → 403 fail-closed', async () => {
    const res = await getAssures(requete('/api/assures', {
      'x-user-id': 'u-orphan',
      'x-user-role': 'CONTACT_ENTREPRISE',
    }));

    expect(res.status).toBe(403);
    expect(dbMocks.assureFindMany).not.toHaveBeenCalled();
  });
});

// ─── Contrats ───────────────────────────────────────────────────────────────

describe('Isolation — GET /api/contrats', () => {
  it('CONTACT_ENTREPRISE (Société A) → where { societeId: SOC_A } uniquement', async () => {
    const res = await getContrats(requete('/api/contrats', EXTERNE_SOC_A));

    expect(res.status).toBe(200);
    expect(dbMocks.contratFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { societeId: SOC_A } })
    );
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('compte externe sans société → 403 fail-closed, aucune lecture DB', async () => {
    const res = await getContrats(requete('/api/contrats', {
      'x-user-id': 'u-orphan',
      'x-user-role': 'CONTACT_ENTREPRISE',
    }));

    expect(res.status).toBe(403);
    expect(dbMocks.contratFindMany).not.toHaveBeenCalled();
  });

  it('rôle interne → périmètre global (aucun filtre société)', async () => {
    await getContrats(requete('/api/contrats', INTERNE));

    expect(dbMocks.contratFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});
