/**
 * Cron Job — Envoi automatique du rapport mensuel par email
 * S'exécute le 1er de chaque mois à 07h00 (heure de Madagascar, UTC+3)
 *
 * Configuration requise dans .env :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   EMAIL_RAPPORT_DESTINATAIRE (optionnel : email par défaut pour les rapports)
 *
 * Activation :
 *   - En production : ce fichier est importé dans instrumentation.ts
 *   - En développement : le cron ne s'active que si CRON_ENABLED=true
 */

import cron, { type ScheduledTask } from 'node-cron';
import { envoyerRapportMensuel } from '@/lib/email-mensuel';

let cronInstance: ScheduledTask | null = null;

export function demarrerCronMensuel() {
  // Ne pas démarrer en dev sauf si explicitement activé
  if (process.env.NODE_ENV === 'development' && process.env.CRON_ENABLED !== 'true') {
    console.log('[CRON] Désactivé en développement (CRON_ENABLED non défini)');
    return;
  }

  // Vérifier que SMTP est configuré
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[CRON] SMTP non configuré — cron emails mensuels désactivé');
    console.warn('[CRON] Configurez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS dans .env');
    return;
  }

  // "0 4 1 * *" = tous les 1er du mois à 04h00 UTC = 07h00 Madagascar (UTC+3)
  cronInstance = cron.schedule('0 4 1 * *', async () => {
    console.log(`[CRON] Début de l'envoi du rapport mensuel — ${new Date().toISOString()}`);

    try {
      const result = await envoyerRapportMensuel();

      console.log(`[CRON] Rapport mensuel terminé :`);
      console.log(`  - ${result.envoyes} société(s) traitée(s)`);
      if (result.erreurs.length > 0) {
        console.log(`  - ${result.erreurs.length} erreur(s)`);
        for (const e of result.erreurs) {
          console.log(`    × ${e.societe}: ${e.erreur}`);
        }
      }
    } catch (error) {
      console.error('[CRON] Erreur critique:', error);
    }
  });

  console.log('[CRON] Tâche mensuelle activée : envoi rapport le 1er de chaque mois à 07h00 Madagascar');
}

export function arreterCronMensuel() {
  if (cronInstance) {
    cronInstance.stop();
    cronInstance = null;
    console.log('[CRON] Tâche mensuelle arrêtée');
  }
}