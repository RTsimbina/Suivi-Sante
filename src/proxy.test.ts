/**
 * Tests du middleware (src/proxy.ts) — passe dédiée aux cron jobs Vercel.
 *
 * Avant correctif : /api/cron/* n'était ni public, ni dans API_PERMISSIONS,
 * ni dans le passe machine → l'appel de Vercel Cron (sans session NextAuth)
 * tombait dans le default-deny et était rejeté : le rapport mensuel ne
 * partait jamais en production.
 *
 * Contrat :
 *   - Bearer CRON_SECRET valide (temps constant) → franchit le gate ;
 *   - sans/mauvais Bearer → 401 immédiat (fail-closed, pas de session) ;
 *   - MAIL_API_KEY ne donne PAS accès aux crons (moindre privilège) ;
 *   - contournement en développement uniquement si NODE_ENV=development
 *     ET CRON_SECRET absent ;
 *   - le reste du trafic API garde son comportement (401 sans session).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import proxy from '@/proxy';
import { NextRequest } from 'next/server';

// process.env est typé readonly par les types Next → cast mutable pour les tests
const env = process.env as unknown as Record<string, string | undefined>;

const CRON_SECRET_TEST = 'secret-cron-de-test-0123456789abcdef';
const MAIL_API_KEY_LEURE = 'cle-mail-api-pas-cron-0123456789abcdef';

function requete(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

let savedCronSecret: string | undefined;
let savedNodeEnv: string | undefined;

beforeEach(() => {
  savedCronSecret = env.CRON_SECRET;
  savedNodeEnv = env.NODE_ENV;
  env.CRON_SECRET = CRON_SECRET_TEST;
  env.NEXTAUTH_SECRET = 'secret-nextauth-de-test';
});

afterEach(() => {
  if (savedCronSecret === undefined) delete env.CRON_SECRET;
  else env.CRON_SECRET = savedCronSecret;
  if (savedNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = savedNodeEnv;
});

describe('proxy — passe machine /api/cron/*', () => {
  it('laisse passer un Bearer CRON_SECRET valide (avec en-têtes de sécurité)', async () => {
    const res = await proxy(
      requete('/api/cron/rapport-mensuel', { authorization: `Bearer ${CRON_SECRET_TEST}` })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('renvoie 401 sans en-tête Authorization (fail-closed)', async () => {
    const res = await proxy(requete('/api/cron/rapport-mensuel'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.erreur).toBe('Non autorisé');
  });

  it('renvoie 401 avec un mauvais Bearer', async () => {
    const res = await proxy(
      requete('/api/cron/rapport-mensuel', { authorization: 'Bearer mauvais-secret' })
    );
    expect(res.status).toBe(401);
  });

  it("MAIL_API_KEY ne donne PAS accès aux crons (moindre privilège)", async () => {
    const res = await proxy(
      requete('/api/cron/rapport-mensuel', { authorization: `Bearer ${MAIL_API_KEY_LEURE}` })
    );
    expect(res.status).toBe(401);
  });

  it('tolère un appel sans secret en développement uniquement (NODE_ENV=development, CRON_SECRET absent)', async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = 'development';
    const res = await proxy(requete('/api/cron/rapport-mensuel'));
    expect(res.status).toBe(200);
  });

  it('restreint le passe dev dès que CRON_SECRET est défini (même en développement)', async () => {
    env.NODE_ENV = 'development';
    env.CRON_SECRET = CRON_SECRET_TEST; // défini → pas de contournement
    const res = await proxy(requete('/api/cron/rapport-mensuel'));
    expect(res.status).toBe(401);
  });

  it('protège aussi les futures sous-routes /api/cron/*', async () => {
    const res = await proxy(requete('/api/cron/autre-tache'));
    expect(res.status).toBe(401);
  });
});

describe('proxy — comportement inchangé hors crons', () => {
  it('exige toujours une session pour le reste de l\'API (401 sans token)', async () => {
    const res = await proxy(requete('/api/dossiers'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.erreur).toContain('Non authentifié');
  });

  it('le passe cron ne déborde pas sur /api/mail/* (session ou clé machine requise)', async () => {
    // Sans Bearer ni session → 401 (et non un passage libre)
    const res = await proxy(requete('/api/mail/send'));
    expect(res.status).toBe(401);
  });
});
