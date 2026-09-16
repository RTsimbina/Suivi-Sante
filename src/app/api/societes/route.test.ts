/**
 * Tests de la route GET /api/societes — règle métier d'accès par rôle.
 *
 * Décision métier (Plan de correction — PRIORITÉ 3) :
 *   - PORTAIL_CLIENT      → 403 (volontairement absent d'API_PERMISSIONS :
 *                           ses données sociétés viennent de /api/portail-client)
 *   - CONTACT_ENTREPRISE  → where { id: SA société } (résolu serveur depuis
 *                           le JWT via les headers injectés par le proxy)
 *   - Rôles internes      → where {} (périmètre global)
 *   - Externe sans société → 403 fail-closed
 *
 * Le gate checkAuth est simulé (comme le ferait le proxy + authorizeRequest) ;
 * les headers x-user-* reproduisent ce que le middleware injecte depuis le
 * JWT signé — ils sont la SEULE source admise par data-isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const dbMocks = vi.hoisted(() => ({
  societeFindMany: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    societe: {
      findMany: dbMocks.societeFindMany,
    },
  },
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
  getUserInfoFromRequest: vi.fn().mockResolvedValue({ nom: 'Admin', id: 'u1' }),
}));

import { GET } from './route';

function requeteGet(headers: Record<string, string> = {}, query = ''): NextRequest {
  return new Request(`http://localhost/api/societes${query}`, {
    headers,
  }) as unknown as NextRequest;
}

const HEADERS_EXTERNE = {
  'x-user-id': 'u2',
  'x-user-role': 'CONTACT_ENTREPRISE',
  'x-user-societeid': 'soc-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.societeFindMany.mockResolvedValue([]);
});

describe('GET /api/societes — règle métier par rôle', () => {
  it('PORTAIL_CLIENT est refusé par le gate (absent d’API_PERMISSIONS) → 403 propagé', async () => {
    // Simulation fidèle : le proxy + authorizeRequest refusent ce rôle.
    authMocks.checkAuth.mockResolvedValue(
      Response.json({ erreur: "Accès refusé. Le rôle 'PORTAIL_CLIENT' n'est pas autorisé à accéder à cette ressource." }, { status: 403 })
    );

    const res = await GET(requeteGet({
      'x-user-id': 'u3',
      'x-user-role': 'PORTAIL_CLIENT',
      'x-user-societeid': 'soc-1',
    }));

    expect(res.status).toBe(403);
    // Aucune lecture DB : le refus précède l'accès aux données.
    expect(dbMocks.societeFindMany).not.toHaveBeenCalled();
  });

  it('CONTACT_ENTREPRISE → where { id: SA société } uniquement', async () => {
    const res = await GET(requeteGet(HEADERS_EXTERNE));

    expect(res.status).toBe(200);
    expect(dbMocks.societeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'soc-1' },
      })
    );
    const body = await res.json();
    expect(body.societes).toEqual([]);
  });

  it('CONTACT_ENTREPRISE passant ?societeId=SOCIETE_B → toujours SA société (jamais élargi)', async () => {
    await GET(requeteGet(HEADERS_EXTERNE, '?societeId=soc-B'));

    expect(dbMocks.societeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'soc-1' },
      })
    );
  });

  it('CONTACT_ENTREPRISE sans société rattachée → 403 fail-closed', async () => {
    const res = await GET(requeteGet({
      'x-user-id': 'u2',
      'x-user-role': 'CONTACT_ENTREPRISE',
      // pas de x-user-societeid
    }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.erreur).toContain("n'est rattaché à aucune société");
    expect(dbMocks.societeFindMany).not.toHaveBeenCalled();
  });

  it('Rôle interne (ADMINISTRATEUR) → where {} : périmètre global', async () => {
    const res = await GET(requeteGet({
      'x-user-id': 'u1',
      'x-user-role': 'ADMINISTRATEUR',
      // un header societeId résiduel est ignoré pour un rôle interne
      'x-user-societeid': 'soc-residuel',
    }));

    expect(res.status).toBe(200);
    expect(dbMocks.societeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it('Rôle interne SANTE (lecture seule) → where {} également', async () => {
    const res = await GET(requeteGet({
      'x-user-id': 'u4',
      'x-user-role': 'SANTE',
    }));

    expect(res.status).toBe(200);
    expect(dbMocks.societeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it('incident 2026-09 : colonne manquante (migration non appliquée) → 500 avec message ACTIONNABLE, pas un 500 générique', async () => {
    // Reproduction : Prisma sélectionne tous les champs scalaires du schéma,
    // donc la colonne emailContactPrincipal absente en base fait échouer
    // TOUT findMany sans select explicite. L'admin doit voir quoi faire.
    dbMocks.societeFindMany.mockRejectedValue(
      new Error('Invalid `prisma.societe.findMany()` invocation:\n\ncolumn Societe.emailContactPrincipal does not exist in the current database.')
    );

    const res = await GET(requeteGet({
      'x-user-id': 'u1',
      'x-user-role': 'ADMINISTRATEUR',
    }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.erreur).toContain('migration');
    expect(body.erreur).toContain('prisma migrate deploy');
  });

  it('erreur DB non liée à une migration → message générique conservé', async () => {
    dbMocks.societeFindMany.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    const res = await GET(requeteGet({
      'x-user-id': 'u1',
      'x-user-role': 'ADMINISTRATEUR',
    }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.erreur).toBe("Erreur lors de l'opération.");
  });
});
