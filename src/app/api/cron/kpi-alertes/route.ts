/**
 * Vercel Cron Job — Digest quotidien des alertes de performance KPI (R5).
 *
 * Appelé par Vercel Cron (vercel.json → /api/cron/kpi-alertes) chaque jour à
 * 04 h 00 UTC (= 07 h 00 Madagascar, UTC+3). Fréquence décision R5 :
 * QUOTIDIENNE — un seul message agrégé, envoyé uniquement si au moins une
 * alerte est active (anti-abus, cf. src/lib/kpi-alertes-email.ts).
 *
 * Sécurité : même défense en profondeur que /api/cron/rapport-mensuel —
 * Bearer CRON_SECRET vérifié en durée constante par le middleware ET ici.
 */

import { NextRequest, NextResponse } from 'next/server';
import { envoyerDigestAlertesKpi } from '@/lib/kpi-alertes-email';
import { smtpEstConfigureAsync } from '@/lib/email';
import { enTeteEgalSecret } from '@/lib/mail/api-auth';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // ── Vérification du secret Vercel Cron ──────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = await enTeteEgalSecret(authHeader, 'CRON_SECRET');

  // En développement, autoriser sans secret si CRON_SECRET n'est pas défini
  if (process.env.NODE_ENV === 'development' && !cronSecret) {
    console.log('[CRON] Mode développement — authentification ignorée');
  } else if (!bearerOk) {
    console.warn('[CRON] Accès non autorisé — secret invalide ou absent');
    return NextResponse.json({ erreur: 'Non autorisé' }, { status: 401 });
  }

  // ── Vérification SMTP ────────────────────────────────────────────────
  const smtpConfigure = await smtpEstConfigureAsync();
  if (!smtpConfigure) {
    console.warn('[CRON] SMTP non configuré — digest des alertes annulé');
    return NextResponse.json(
      { erreur: 'SMTP non configuré', message: 'Configurez SMTP depuis la page Configuration ou via les variables d\'environnement.' },
      { status: 503 }
    );
  }

  // ── Digest des alertes ───────────────────────────────────────────────
  try {
    const resultat = await envoyerDigestAlertesKpi();
    console.log(`[CRON] Alertes KPI : ${resultat.totalAlertes} alerte(s), envoi=${resultat.envoye}${resultat.motif ? ` (${resultat.motif})` : ''}`);
    return NextResponse.json({
      ok: true,
      envoye: resultat.envoye,
      motif: resultat.motif ?? null,
      totalAlertes: resultat.totalAlertes,
      destinataires: resultat.destinataires.length,
      erreur: resultat.erreur ?? null,
    });
  } catch (error) {
    console.error('[CRON] Erreur critique du digest des alertes KPI :', error);
    return NextResponse.json({ erreur: 'Erreur interne lors du digest des alertes KPI' }, { status: 500 });
  }
}
