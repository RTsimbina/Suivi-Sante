/**
 * Cron local (node-cron) — Digest quotidien des alertes de performance KPI
 *
 * ⚠️  Réservé au DÉVELOPPEMENT LOCAL uniquement (même convention que le cron
 *     mensuel) : sur Vercel (production), le digest est géré par Vercel Cron :
 *       vercel.json → /api/cron/kpi-alertes
 *
 * Fréquence (décision R5) : QUOTIDIENNE — 04 h 00 UTC = 07 h 00 Madagascar.
 * Aucun courriel n'est envoyé s'il n'y a aucune alerte active ; coupe-circuit
 * KPI_ALERTES_EMAIL=off.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { envoyerDigestAlertesKpi } from '@/lib/kpi-alertes-email';
import { smtpEstConfigureAsync } from '@/lib/email';

let cronInstance: ScheduledTask | null = null;

export async function demarrerCronAlertesKpi() {
  if (process.env.NODE_ENV === 'development' && process.env.CRON_ENABLED !== 'true') {
    console.log('[CRON] Alertes KPI désactivées en développement (CRON_ENABLED non défini)');
    return;
  }

  const configure = await smtpEstConfigureAsync();
  if (!configure) {
    console.warn('[CRON] SMTP non configuré — cron alertes KPI désactivé');
    return;
  }

  // "0 4 * * *" = tous les jours à 04h00 UTC = 07h00 Madagascar (UTC+3)
  cronInstance = cron.schedule('0 4 * * *', async () => {
    console.log(`[CRON] Début du digest des alertes KPI — ${new Date().toISOString()}`);
    try {
      const r = await envoyerDigestAlertesKpi();
      console.log(`[CRON] Alertes KPI : ${r.totalAlertes} alerte(s), envoi=${r.envoye}${r.motif ? ` (${r.motif})` : ''}${r.erreur ? ` — erreur : ${r.erreur}` : ''}`);
    } catch (error) {
      console.error('[CRON] Erreur critique du digest des alertes KPI :', error);
    }
  });

  console.log('[CRON] Tâche quotidienne activée : alertes KPI chaque jour à 07h00 Madagascar');
}

// Purge code mort : pas d'arrêt explicite — le cron vit pour toute la durée
// du process dev ; sur Vercel c'est Vercel Cron (cf. cron-email-mensuel.ts).
export function arreterCronAlertesKpiPourTest() {
  cronInstance?.stop();
  cronInstance = null;
}
