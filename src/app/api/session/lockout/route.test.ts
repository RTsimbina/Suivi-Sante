/**
 * Tests P1 « Rate Limiting des routes publiques sensibles » —
 * /api/session/lockout (état de verrouillage du compte).
 *
 * Critères de la mission vérifiés ici :
 *   - sous la limite → 200, format inchangé (anti-énumération conservée) ;
 *   - dépassement de la limite PAR E-MAIL → 429 + Retry-After ;
 *   - dépassement de la limite PAR IP (e-mails différents) → 429 ;
 *   - la clé 429 est construite sur l'e-mail FOURNI : un compte existant et
 *     un compte inconnu produisent la même réponse (aucun oracle) ;
 *   - email invalide (Zod) → 200 inchangé, règle métier préservée.
 *
 * Backend MÉMOIRE du limiteur (compteurs globaux → IP unique par test).
 * La preuve multi-instances réelle (30 processus, Postgres embarqué) vit
 * dans scripts/test-atomic-lockout.mjs / test-rate-limit.mjs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  isLockedOut: vi.fn().mockResolvedValue({ locked: false, remainingMs: 0 }),
}));

vi.mock('@/lib/auth', () => ({ isLockedOut: authMocks.isLockedOut }));

const { POST } = await import('./route');

let compteur = 0;
const ipUnique = () => `10.99.${Math.floor(compteur / 250) % 250}.${compteur++ % 250}`;
const emailUnique = (base: string) => `${base}-${compteur++}@exemple.mg`;

function requetePost(email: string, ip: string): NextRequest {
  return new Request('http://localhost/api/session/lockout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  }) as unknown as NextRequest;
}

describe('session/lockout — rate limiting P1', () => {
  beforeEach(() => {
    // NB : `compteur` n'est PAS remis à zéro — les IP/e-mails doivent rester
    // uniques pour tout le fichier, car les compteurs mémoire du limiteur
    // persistent d'un test à l'autre (même processus).
    process.env.RATE_LIMIT_BACKEND = 'memory';
    process.env.LOCKOUT_CHECK_EMAIL_LIMIT = '2';
    process.env.LOCKOUT_CHECK_EMAIL_WINDOW = '60';
    process.env.LOCKOUT_CHECK_IP_LIMIT = '10';
    process.env.LOCKOUT_CHECK_IP_WINDOW = '60';
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z') });
    authMocks.isLockedOut.mockClear().mockResolvedValue({ locked: false, remainingMs: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.LOCKOUT_CHECK_EMAIL_LIMIT;
    delete process.env.LOCKOUT_CHECK_EMAIL_WINDOW;
    delete process.env.LOCKOUT_CHECK_IP_LIMIT;
    delete process.env.LOCKOUT_CHECK_IP_WINDOW;
  });

  it('sous la limite → 200, format de réponse inchangé', async () => {
    const res = await POST(requetePost(emailUnique('ok'), ipUnique()));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { locked: boolean; remainingMs: number };
    expect(corps).toEqual({ locked: false, remainingMs: 0 });
    expect(authMocks.isLockedOut).toHaveBeenCalledTimes(1);
  });

  it('dépassement par e-mail (compte inconnu) → 429', async () => {
    const ip = ipUnique();
    const email = emailUnique('rafales');
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip));
    const res = await POST(requetePost(email, ip)); // 3e — limite 2
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe('Trop de demandes. Réessayez plus tard.');
  });

  it('anti-oracle : 429 identique pour un compte réellement verrouillé', async () => {
    const ip = ipUnique();
    const email = emailUnique('verrouille');
    // Le compte est réellement verrouillé en base…
    authMocks.isLockedOut.mockResolvedValue({ locked: true, remainingMs: 120000 });
    await POST(requetePost(email, ip));
    authMocks.isLockedOut.mockResolvedValue({ locked: false, remainingMs: 0 });
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip)); // 3e — 429
    // …et un compte inconnu martelé autant produit le MÊME 429
    const ip2 = ipUnique();
    const emailInconnu = emailUnique('inconnu');
    await POST(requetePost(emailInconnu, ip2));
    await POST(requetePost(emailInconnu, ip2));
    const res = await POST(requetePost(emailInconnu, ip2));

    expect(res.status).toBe(429);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe('Trop de demandes. Réessayez plus tard.');
  });

  it('limite par IP : e-mails différents depuis la même IP finissent bloqués', async () => {
    const ip = ipUnique();
    for (let i = 0; i < 10; i++) {
      const res = await POST(requetePost(emailUnique('diff'), ip));
      expect(res.status).toBe(200);
    }
    const res = await POST(requetePost(emailUnique('diff'), ip)); // 11e — limite IP 10
    expect(res.status).toBe(429);
    // isLockedOut n'est pas consulté au-delà du blocage (pas d'oracle)
    expect(authMocks.isLockedOut).toHaveBeenCalledTimes(10);
  });

  it('déblocage automatique après expiration de la fenêtre (60 s)', async () => {
    const ip = ipUnique();
    const email = emailUnique('deblocage');
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip));
    expect((await POST(requetePost(email, ip))).status).toBe(429);

    vi.setSystemTime(new Date('2026-11-17T10:00:00Z').getTime() + 61_000);
    const res = await POST(requetePost(email, ip));
    expect(res.status).toBe(200);
  });

  it('email invalide (Zod) → 200 inchangé, sans consommer le compteur', async () => {
    const ip = ipUnique();
    const res = await POST(
      new Request('http://localhost/api/session/lockout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email: 'pas-un-email' }),
      }) as unknown as NextRequest,
    );
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { locked: boolean };
    expect(corps.locked).toBe(false);
    expect(authMocks.isLockedOut).not.toHaveBeenCalled();
  });
});
