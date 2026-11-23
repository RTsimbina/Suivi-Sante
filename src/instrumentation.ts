/**
 * Instrumentation Next.js
 *
 * ⚠️  Sur Vercel (serverless), les fonctions sont éphémères :
 *     un timer node-cron ne survivrait pas entre les invocations.
 *     Le rapport mensuel est désormais géré par Vercel Cron Jobs
 *     (voir vercel.json → /api/cron/rapport-mensuel).
 *
 *     Le node-cron n'est conservé qu'en développement local (CRON_ENABLED=true)
 *     pour faciliter les tests sans devoir configurer Vercel Cron.
 */

export async function register() {
  // En développement uniquement : démarrer les crons en mémoire si explicitement activés
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'development') {
    const { demarrerCronMensuel } = await import('./lib/cron-email-mensuel');
    demarrerCronMensuel();
    // R5 — digest quotidien des alertes KPI (même convention : dev local ;
    // la production passe par Vercel Cron → /api/cron/kpi-alertes).
    const { demarrerCronAlertesKpi } = await import('./lib/cron-kpi-alertes');
    demarrerCronAlertesKpi();
  }
}