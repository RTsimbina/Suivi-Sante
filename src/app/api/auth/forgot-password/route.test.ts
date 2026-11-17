/**
 * Tests P1 « Rate Limiting des routes publiques sensibles » —
 * /api/auth/forgot-password.
 *
 * Critères de la mission vérifiés ici :
 *   - plusieurs demandes successives de récupération de mot de passe OK ;
 *   - dépassement de la limite autorisée → HTTP 429 + Retry-After ;
 *   - anti-énumération : 429 IDENTIQUE pour un compte existant ou inconnu ;
 *   - déblocage après expiration de la fenêtre de limitation ;
 *   - le service de messagerie n'est PLUS sollicité après blocage tôt
 *     (chaîne anti-abus existante préservée — jamais contournée) ;
 *   - compte désactivé → réponse générique inchangée (200).
 *
 * Le limiteur est testé sur son vrai code (route-rate-limit.ts + rate-limit.ts)
 * avec le backend MÉMOIRE (RATE_LIMIT_BACKEND=memory) : les compteurs sont
 * globaux au processus, chaque test utilise donc des IP / e-mails uniques.
 * La preuve MULTI-INSTANCES réelle (30 processus contre Postgres embarqué)
 * vit dans scripts/test-atomic-lockout.mjs (T6/T7) et test-rate-limit.mjs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const dbMocks = vi.hoisted(() => ({
  utilisateur: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const mailMocks = vi.hoisted(() => ({
  smtpEstConfigureAsync: vi.fn().mockResolvedValue(false),
  envoyerReinitialisationMdp: vi.fn().mockResolvedValue({ accepte: true }),
}));

vi.mock('@/lib/db', () => ({ db: dbMocks }));
vi.mock('@/lib/email', () => ({ smtpEstConfigureAsync: mailMocks.smtpEstConfigureAsync }));
vi.mock('@/lib/mail', () => ({ envoyerReinitialisationMdp: mailMocks.envoyerReinitialisationMdp }));

const { POST } = await import('./route');

// IP et e-mail uniques par test (les compteurs mémoire sont globaux)
let compteur = 0;
const ipUnique = () => `10.77.${Math.floor(compteur / 250) % 250}.${compteur++ % 250}`;
const emailUnique = (base: string) => `${base}-${compteur++}@exemple.mg`;

function requetePost(email: string, ip: string): NextRequest {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  }) as unknown as NextRequest;
}

const MESSAGE_GENERIQUE =
  'Si un compte existe avec cette adresse, un lien de réinitialisation sera envoyé par e-mail.';

describe('forgot-password — rate limiting P1', () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_BACKEND = 'memory';
    process.env.FORGOT_PASSWORD_EMAIL_LIMIT = '2';
    process.env.FORGOT_PASSWORD_EMAIL_WINDOW = '600';
    process.env.FORGOT_PASSWORD_IP_LIMIT = '10';
    process.env.FORGOT_PASSWORD_IP_WINDOW = '900';
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z') });
    dbMocks.utilisateur.findUnique.mockReset();
    dbMocks.utilisateur.findUnique.mockResolvedValue(null);
    mailMocks.envoyerReinitialisationMdp.mockClear();
    mailMocks.smtpEstConfigureAsync.mockClear().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.FORGOT_PASSWORD_EMAIL_LIMIT;
    delete process.env.FORGOT_PASSWORD_EMAIL_WINDOW;
    delete process.env.FORGOT_PASSWORD_IP_LIMIT;
    delete process.env.FORGOT_PASSWORD_IP_WINDOW;
  });

  it('plusieurs demandes successives sous la limite → 200 générique', async () => {
    const ip = ipUnique();
    const email = emailUnique('sous-limite');
    for (let i = 0; i < 2; i++) {
      const res = await POST(requetePost(email, ip));
      expect(res.status).toBe(200);
      const corps = (await res.json()) as { message: string };
      expect(corps.message).toBe(MESSAGE_GENERIQUE);
    }
  });

  it('dépassement de la limite par e-mail → 429 avec Retry-After', async () => {
    const ip = ipUnique();
    const email = emailUnique('rafales');
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip));
    const res = await POST(requetePost(email, ip)); // 3e demande — limite 2
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe('Trop de demandes. Réessayez plus tard.');
  });

  it('anti-énumération : 429 identique que le compte existe ou non', async () => {
    const ipExistant = ipUnique();
    const ipInconnu = ipUnique();
    // Compte EXISTANT — rafales jusqu'au blocage
    dbMocks.utilisateur.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'existe@exemple.mg', actif: true, nom: 'X',
    });
    await POST(requetePost('existe@exemple.mg', ipExistant));
    await POST(requetePost('existe@exemple.mg', ipExistant));
    const resExistant = await POST(requetePost('existe@exemple.mg', ipExistant));
    // Compte INCONNU — rafales jusqu'au blocage
    await POST(requetePost('inconnu@exemple.mg', ipInconnu));
    await POST(requetePost('inconnu@exemple.mg', ipInconnu));
    const resInconnu = await POST(requetePost('inconnu@exemple.mg', ipInconnu));

    expect(resExistant.status).toBe(429);
    expect(resInconnu.status).toBe(429);
    const corpsE = (await resExistant.json()) as { message: string };
    const corpsI = (await resInconnu.json()) as { message: string };
    expect(corpsE.message).toBe(corpsI.message);
    expect(resExistant.headers.get('retry-after'))
      .toBe(resInconnu.headers.get('retry-after'));
  });

  it('limite par IP : des e-mails différents depuis la même IP finissent bloqués', async () => {
    const ip = ipUnique();
    for (let i = 0; i < 10; i++) {
      const res = await POST(requetePost(emailUnique('diff'), ip));
      expect(res.status).toBe(200);
    }
    const res = await POST(requetePost(emailUnique('diff'), ip)); // 11e — limite IP 10
    expect(res.status).toBe(429);
  });

  it('déblocage automatique après expiration de la fenêtre', async () => {
    const ip = ipUnique();
    const email = emailUnique('deblocage');
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip));
    expect((await POST(requetePost(email, ip))).status).toBe(429);

    // La fenêtre email est de 600 s : avancer le temps la réinitialise
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z').getTime() + 601_000);
    const res = await POST(requetePost(email, ip));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe(MESSAGE_GENERIQUE);
  });

  it('après blocage : le service de messagerie n\'est plus sollicité du tout', async () => {
    const ip = ipUnique();
    const email = emailUnique('protege');
    await POST(requetePost(email, ip));
    await POST(requetePost(email, ip));
    mailMocks.envoyerReinitialisationMdp.mockClear();
    mailMocks.smtpEstConfigureAsync.mockClear();
    dbMocks.utilisateur.findUnique.mockClear();

    await POST(requetePost(email, ip)); // 429
    // Blocage TÔT : ni SMTP consulté, ni envoi, ni requête utilisateur
    expect(mailMocks.smtpEstConfigureAsync).not.toHaveBeenCalled();
    expect(mailMocks.envoyerReinitialisationMdp).not.toHaveBeenCalled();
    expect(dbMocks.utilisateur.findUnique).not.toHaveBeenCalled();
  });

  it('compte désactivé → réponse générique 200 inchangée (règle métier préservée)', async () => {
    const ip = ipUnique();
    dbMocks.utilisateur.findUnique.mockResolvedValueOnce({
      id: 'u2', email: 'off@exemple.mg', actif: false, nom: 'Y',
    });
    const res = await POST(requetePost('off@exemple.mg', ip));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { message: string };
    expect(corps.message).toBe(MESSAGE_GENERIQUE);
  });

  it('durée de validité du jeton inchangée : 30 minutes', async () => {
    // Le route module déclare RESET_TOKEN_EXPIRY = '30m' — vérifié par
    // inspection du fichier (régression : ne jamais réduire ni allonger).
    const source = (await import('node:fs')).readFileSync(
      new URL('./route.ts', import.meta.url), 'utf8',
    );
    expect(source).toContain("RESET_TOKEN_EXPIRY = '30m'");
  });
});
