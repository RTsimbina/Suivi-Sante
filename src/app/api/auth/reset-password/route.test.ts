/**
 * Tests P1 « Rate Limiting des routes publiques sensibles » —
 * /api/auth/reset-password.
 *
 * Critères de la mission vérifiés ici :
 *   - réinitialisation avec un jeton EXPIRÉ → 400 + message d'expiration
 *     (la durée de validité de 30 minutes est conservée — voir forgot
 *     route.test.ts et la constante RESET_TOKEN_EXPIRY) ;
 *   - réinitialisation avec un jeton INVALIDE (signature, purpose) → 400
 *     avec le même message générique (aucun détail) ;
 *   - dépassement de la limite par IP → HTTP 429 + Retry-After, même avec
 *     un jeton VALIDE (blocage tôt, avant la vérification HMAC) ;
 *   - compte désactivé → 400 « Compte introuvable ou désactivé » ;
 *   - réinitialisation réussie → 200, mot de passe mis à jour (bcrypt 12).
 *
 * Vrai jwt (jsonwebtoken réel) avec un secret de test : le comportement
 * d'expiration est ainsi testé de bout en bout. Backend MÉMOIRE du
 * limiteur (compteurs globaux → IP unique par test).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const dbMocks = vi.hoisted(() => ({
  utilisateur: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/db', () => ({ db: dbMocks }));

const { POST } = await import('./route');

const SECRET = 'secret-de-test-32-caracteres-mini-ok';
const IP_BASE = () => `10.88.${Math.floor(TestCtx.n / 250) % 250}.${TestCtx.n++ % 250}`;
const TestCtx = { n: 0 };

function requetePost(token: string, ip: string, motDePasse = 'NouveauMot1'): NextRequest {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ token, newPassword: motDePasse }),
  }) as unknown as NextRequest;
}

describe('reset-password — jetons et rate limiting P1', () => {
  beforeEach(() => {
    // NB : TestCtx.n n'est PAS remis à zéro — les IP doivent rester uniques
    // pour tout le fichier (les compteurs mémoire du limiteur persistent
    // d'un test à l'autre dans le même processus).
    process.env.NEXTAUTH_SECRET = SECRET;
    process.env.RATE_LIMIT_BACKEND = 'memory';
    process.env.RESET_PASSWORD_IP_LIMIT = '10';
    process.env.RESET_PASSWORD_IP_WINDOW = '900';
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z') });
    dbMocks.utilisateur.findUnique.mockReset().mockResolvedValue(null);
    dbMocks.utilisateur.update.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.RESET_PASSWORD_IP_LIMIT;
    delete process.env.RESET_PASSWORD_IP_WINDOW;
  });

  it('jeton EXPIRÉ → 400 « a expiré » (durée 30 min conservée)', async () => {
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'password_reset' },
      SECRET,
      { expiresIn: '-60s' }, // déjà expiré au moment de la vérification
    );
    const res = await POST(requetePost(token, IP_BASE()));
    expect(res.status).toBe(400);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toContain('expiré');
    expect(dbMocks.utilisateur.update).not.toHaveBeenCalled();
  });

  it('jeton INVALIDE (signature falsifiée) → 400 message générique', async () => {
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'password_reset' },
      'autre-secret-falsifie',
      { expiresIn: '30m' },
    );
    const res = await POST(requetePost(token, IP_BASE()));
    expect(res.status).toBe(400);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe('Lien de réinitialisation invalide.');
    expect(dbMocks.utilisateur.update).not.toHaveBeenCalled();
  });

  it('jeton de mauvais purpose (hors password_reset) → 400 message identique', async () => {
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'autre' },
      SECRET,
      { expiresIn: '30m' },
    );
    const res = await POST(requetePost(token, IP_BASE()));
    expect(res.status).toBe(400);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe('Lien de réinitialisation invalide.');
  });

  it('jeton VALIDE + compte actif → 200, mot de passe mis à jour (bcrypt 12)', async () => {
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'password_reset' },
      SECRET,
      { expiresIn: '30m' },
    );
    dbMocks.utilisateur.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'u@exemple.mg', actif: true,
    });
    const res = await POST(requetePost(token, IP_BASE()));
    expect(res.status).toBe(200);
    expect(dbMocks.utilisateur.update).toHaveBeenCalledTimes(1);
    const args = dbMocks.utilisateur.update.mock.calls[0][0] as {
      data: { password: string };
    };
    // bcrypt : hash ≠ mot de passe, préfixe de version 2
    expect(args.data.password).toMatch(/^\$2[aby]\$/);
    expect(args.data.password).not.toContain('NouveauMot1');
  });

  it('compte désactivé → 400 « Compte introuvable ou désactivé »', async () => {
    const token = jwt.sign(
      { email: 'off@exemple.mg', userId: 'u2', purpose: 'password_reset' },
      SECRET,
      { expiresIn: '30m' },
    );
    dbMocks.utilisateur.findUnique.mockResolvedValueOnce({
      id: 'u2', email: 'off@exemple.mg', actif: false,
    });
    const res = await POST(requetePost(token, IP_BASE()));
    expect(res.status).toBe(400);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toContain('désactivé');
    expect(dbMocks.utilisateur.update).not.toHaveBeenCalled();
  });

  it('dépassement de la limite IP → 429 MÊME avec un jeton valide', async () => {
    process.env.RESET_PASSWORD_IP_LIMIT = '2';
    const ip = IP_BASE();
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'password_reset' },
      SECRET,
      { expiresIn: '30m' },
    );
    dbMocks.utilisateur.findUnique.mockResolvedValue({
      id: 'u1', email: 'u@exemple.mg', actif: true,
    });
    expect((await POST(requetePost(token, ip))).status).toBe(200);
    expect((await POST(requetePost(token, ip))).status).toBe(200);
    const res = await POST(requetePost(token, ip)); // 3e — limite 2
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    // La mise à jour n'est pas tentée au-delà de la limite
    expect(dbMocks.utilisateur.update).toHaveBeenCalledTimes(2);
  });

  it('déblocage automatique après expiration de la fenêtre', async () => {
    process.env.RESET_PASSWORD_IP_LIMIT = '2';
    const ip = IP_BASE();
    const token = jwt.sign(
      { email: 'u@exemple.mg', userId: 'u1', purpose: 'password_reset' },
      SECRET,
      { expiresIn: '30m' },
    );
    dbMocks.utilisateur.findUnique.mockResolvedValue({
      id: 'u1', email: 'u@exemple.mg', actif: true,
    });
    await POST(requetePost(token, ip));
    await POST(requetePost(token, ip));
    expect((await POST(requetePost(token, ip))).status).toBe(429);

    vi.setSystemTime(new Date('2026-11-17T10:00:00Z').getTime() + 901_000);
    const res = await POST(requetePost(token, ip));
    expect(res.status).toBe(200);
  });
});
