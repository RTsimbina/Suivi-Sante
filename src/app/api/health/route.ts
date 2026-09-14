/**
 * API — GET /api/health
 * ─────────────────────
 * Sondage de disponibilité, PUBLIC (exempté d'authentification via
 * proxy.ts → PUBLIC_API_PREFIXES, voir '/api/health').
 *
 * Vérifie deux niveaux :
 *   1. l'application répond (le simple fait de recevoir une réponse) ;
 *   2. la base de données est joignable (ping `SELECT 1`).
 *
 * Codes de retour :
 *   200 → application OK, base OK
 *   503 → application répond mais base injoignable (inutilisable)
 *
 * Sécurité : la route est publique, elle ne révèle donc AUCUNE information
 * sensible — pas de version d'application, pas de stack, pas de message
 * d'erreur brut (un simple 'erreur' suffit au diagnostic « base KO »).
 *
 * Appelé par : le workflow GitHub Actions `healthcheck.yml` (toutes les
 * 30 min, ouvre/ferme une issue [Incident] en cas d'échec), toute sonde
 * externe (UptimeRobot…), ou un navigateur.
 *
 * Coût : 1 connexion + SELECT 1 par sondage (48/jour à 30 min) — négligeable
 * même sur Neon (serveurless, scale-to-zero : le ping réveille l'instance,
 * ce qui est voulu : l'app est inutilisable si la base est froide).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Jamais de mise en cache : un sondage doit refléter l'état instantané
// (sinon une réponse 200 mise en cache masquerait une panne réelle).
export const dynamic = 'force-dynamic';

const entetes = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  const debut = Date.now();

  let baseOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    // Détail volontairement avalé : endpoint public, rien ne doit fuir.
    baseOk = false;
  }

  const latenceMs = Date.now() - debut;

  if (!baseOk) {
    return NextResponse.json(
      { status: 'erreur', db: 'erreur' },
      { status: 503, headers: entetes }
    );
  }

  return NextResponse.json(
    { status: 'ok', db: 'ok', latenceMs },
    { headers: entetes }
  );
}
