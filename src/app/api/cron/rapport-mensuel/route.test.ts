/**
 * Tests de la route cron /api/cron/rapport-mensuel (défense en profondeur).
 * Le middleware valide déjà le Bearer CRON_SECRET ; la route re-vérifie
 * en durée constante (src/lib/mail/api-auth.ts) afin qu'aucun contournement
 * du middleware ne puisse déclencher l'envoi du rapport mensuel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// process.env est typé readonly par les types Next → cast mutable pour les tests
const env = process.env as unknown as Record<string, string | undefined>;

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  envoyerRapportMensuel: vi.fn(),
  smtpEstConfigureAsync: vi.fn(),
}));

vi.mock('@/lib/email-mensuel', () => ({
  envoyerRapportMensuel: mocks.envoyerRapportMensuel,
}));

vi.mock('@/lib/email', () => ({
  smtpEstConfigureAsync: mocks.smtpEstConfigureAsync,
}));

import { GET } from './route';

const CRON_SECRET_TEST = 'secret-cron-route-test-0123456789abcdef';

function requete(headers: Record<string, string> = {}): NextRequest {
  return new Request('http://localhost/api/cron/rapport-mensuel', {
    headers,
  }) as unknown as NextRequest;
}

let savedCronSecret: string | undefined;
let savedNodeEnv: string | undefined;

beforeEach(() => {
  savedCronSecret = env.CRON_SECRET;
  savedNodeEnv = env.NODE_ENV;
  env.CRON_SECRET = CRON_SECRET_TEST;
  vi.clearAllMocks();
});

afterEach(() => {
  if (savedCronSecret === undefined) delete env.CRON_SECRET;
  else env.CRON_SECRET = savedCronSecret;
  if (savedNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = savedNodeEnv;
});

describe('GET /api/cron/rapport-mensuel — authentification', () => {
  it('renvoie 401 sans Bearer (fail-closed)', async () => {
    const res = await GET(requete());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.erreur).toBe('Non autorisé');
    expect(mocks.envoyerRapportMensuel).not.toHaveBeenCalled();
  });

  it('renvoie 401 avec un Bearer incorrect', async () => {
    const res = await GET(requete({ authorization: 'Bearer mauvais-secret' }));
    expect(res.status).toBe(401);
    expect(mocks.envoyerRapportMensuel).not.toHaveBeenCalled();
  });

  it('accepte le bon Bearer CRON_SECRET et déclenche l\'envoi', async () => {
    mocks.smtpEstConfigureAsync.mockResolvedValue(true);
    mocks.envoyerRapportMensuel.mockResolvedValue({
      envoyes: 2,
      erreurs: [],
      details: [
        { societe: 'SOCIETE_A', destinataires: ['a@x.mg'], expediteur: 'noreply@x.mg' },
        { societe: 'SOCIETE_B', destinataires: ['b@x.mg'], expediteur: 'noreply@x.mg' },
      ],
    });

    const res = await GET(
      requete({ authorization: `Bearer ${CRON_SECRET_TEST}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.envoyes).toBe(2);
    expect(body.erreurs).toBe(0);
    expect(mocks.envoyerRapportMensuel).toHaveBeenCalledTimes(1);
  });

  it('renvoie 503 si SMTP n\'est pas configuré (même avec un Bearer valide)', async () => {
    mocks.smtpEstConfigureAsync.mockResolvedValue(false);
    const res = await GET(requete({ authorization: `Bearer ${CRON_SECRET_TEST}` }));
    expect(res.status).toBe(503);
    expect(mocks.envoyerRapportMensuel).not.toHaveBeenCalled();
  });

  it('renvoie 500 si l\'envoi échoue (avec un Bearer valide)', async () => {
    mocks.smtpEstConfigureAsync.mockResolvedValue(true);
    mocks.envoyerRapportMensuel.mockRejectedValue(new Error('SMTP down'));
    const res = await GET(requete({ authorization: `Bearer ${CRON_SECRET_TEST}` }));
    expect(res.status).toBe(500);
  });

  it('mode développement sans CRON_SECRET : authentification ignorée', async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = 'development';
    mocks.smtpEstConfigureAsync.mockResolvedValue(true);
    mocks.envoyerRapportMensuel.mockResolvedValue({ envoyes: 0, erreurs: [], details: [] });

    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(mocks.envoyerRapportMensuel).toHaveBeenCalledTimes(1);
  });
});
