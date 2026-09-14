/**
 * Tests de la route publique GET /api/health.
 * Contrat attendu par le workflow GitHub Actions healthcheck.yml :
 *   - 200 + { status: 'ok', db: 'ok' }  → workflow vert, issues fermées ;
 *   - 503 + { status: 'erreur' }        → workflow rouge, issue [Incident].
 * Sécurité : aucun détail d'erreur ne doit fuir (endpoint public).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// process.env est typé readonly par les types Next → cast mutable pour les tests
const env = process.env as unknown as Record<string, string | undefined>;

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from './route';

beforeEach(() => {
  env.NODE_ENV = 'test';
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('renvoie 200 avec status ok quand la base répond', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(typeof body.latenceMs).toBe('number');
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('renvoie 503 quand la base est injoignable', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('erreur');
    expect(body.db).toBe('erreur');
  });

  it("n'expose aucun détail d'erreur (endpoint public)", async () => {
    const messageSecret = 'postgresql://admin:motdepasse-secret@db.internal/neon';
    mocks.queryRaw.mockRejectedValue(new Error(messageSecret));

    const res = await GET();
    const texte = JSON.stringify(await res.json());

    expect(texte).not.toContain('motdepasse');
    expect(texte).not.toContain('db.internal');
  });

  it('interdit la mise en cache (no-store)', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
