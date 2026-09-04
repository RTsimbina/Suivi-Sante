/**
 * API — POST /api/mail/process
 * ────────────────────────────
 * Processeur de la file d'attente du service de messagerie centralisé.
 *
 * Authentification (trois canaux) :
 *   - session NextAuth : ADMINISTRATEUR ou TECHNIQUE (API_PERMISSIONS)
 *   - machine          : Bearer MAIL_API_KEY
 *   - Vercel Cron      : Bearer CRON_SECRET (voir vercel.json)
 *
 * Actions (dans l'ordre) :
 *   1. récupérer les messages orphelins (EN_COURS > 15 min, instance crashée)
 *   2. traiter la file : réclame, livre via SMTP, programme les retries
 *   3. si `purge: true` : purge le journal (ENVOYE > 90 j, ECHEC > 180 j)
 *
 * Appelé par : le cron quotidien (file de secours), ou manuellement par un
 * administrateur. Chaque mise en file avec `traiter: true` déclenche déjà
 * une livraison immédiate pour les messages interactifs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { estAppelMachineAutorise } from '@/lib/mail/api-auth';
import { traiterFile, recupererOrphelins, purgerAnciens } from '@/lib/mail/queue';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ── Authentification : machine OU session privilégiée ─────────────────────
  const machine = await estAppelMachineAutorise(request);
  if (!machine) {
    const refus = await checkAuth(request);
    if (refus) return refus;
  }

  // ── Traitement ────────────────────────────────────────────────────────────
  let purge = false;
  try {
    const corps = (await request.json()) as { purge?: boolean } | null;
    purge = corps?.purge === true;
  } catch {
    // corps vide autorisé (cron)
  }

  const orphelins = await recupererOrphelins();
  const resultat = await traiterFile({ limite: 20 });
  const purgeResultat = purge ? await purgerAnciens() : null;

  console.log(
    `[MAIL PROCESS] orphelins=${orphelins} envoyes=${resultat.envoyes} ` +
    `retries=${resultat.retriesProgrammes} echecs=${resultat.echecsDefinitifs}`
  );

  return NextResponse.json({
    ok: true,
    orphelinsRecuperes: orphelins,
    envoyes: resultat.envoyes,
    retriesProgrammes: resultat.retriesProgrammes,
    echecsDefinitifs: resultat.echecsDefinitifs,
    ...(purgeResultat ? { purge: purgeResultat } : {}),
    erreurs: resultat.erreurs,
  });
}
