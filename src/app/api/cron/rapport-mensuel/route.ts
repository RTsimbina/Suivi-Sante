/**
 * Vercel Cron Job — Envoi automatique du rapport mensuel
 *
 * Cette route est appelée par Vercel Cron (configuré dans vercel.json)
 * le 1er de chaque mois à 04h00 UTC (= 07h00 Madagascar, UTC+3).
 *
 * Sécurité : Vercel injecte automatiquement le header
 *   Authorization: Bearer <CRON_SECRET>
 *   On vérifie que ce secret correspond à la variable d'environnement CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { envoyerRapportMensuel } from '@/lib/email-mensuel';
import { smtpEstConfigureAsync } from '@/lib/email';

export const maxDuration = 300; // 5 min max pour l'envoi à toutes les sociétés

export async function GET(request: NextRequest) {
  // ── Vérification du secret Vercel Cron ──────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // En développement, autoriser sans secret si CRON_SECRET n'est pas défini
  if (process.env.NODE_ENV === 'development' && !cronSecret) {
    console.log('[CRON] Mode développement — authentification ignorée');
  } else if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CRON] Accès non autorisé — secret invalide ou absent');
    return NextResponse.json(
      { erreur: 'Non autorisé' },
      { status: 401 }
    );
  }

  // ── Vérification SMTP ────────────────────────────────────────────────
  const smtpConfigure = await smtpEstConfigureAsync();
  if (!smtpConfigure) {
    console.warn('[CRON] SMTP non configuré — envoi annulé');
    return NextResponse.json(
      { erreur: 'SMTP non configuré', message: 'Configurez SMTP depuis la page Configuration ou via les variables d\'environnement.' },
      { status: 503 }
    );
  }

  // ── Envoi du rapport mensuel ─────────────────────────────────────────
  try {
    console.log(`[CRON] Début de l'envoi du rapport mensuel — ${new Date().toISOString()}`);

    const result = await envoyerRapportMensuel();

    console.log(`[CRON] Rapport mensuel terminé : ${result.envoyes} société(s) traitée(s)`);
    if (result.erreurs.length > 0) {
      console.warn(`[CRON] ${result.erreurs.length} erreur(s) :`);
      for (const e of result.erreurs) {
        console.warn(`  × ${e.societe}: ${e.erreur}`);
      }
    }

    return NextResponse.json({
      ok: true,
      envoyes: result.envoyes,
      erreurs: result.erreurs.length,
      details: result.details.map(d => ({
        societe: d.societe,
        destinataires: d.destinataires,
        expediteur: d.expediteur,
      })),
    });
  } catch (error) {
    console.error('[CRON] Erreur critique lors de l\'envoi du rapport mensuel:', error);
    return NextResponse.json(
      { erreur: 'Erreur interne lors de l\'envoi du rapport mensuel' },
      { status: 500 }
    );
  }
}
