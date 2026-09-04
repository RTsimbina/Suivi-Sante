/**
 * Service de messagerie centralisé — Module RATE LIMITING
 * ─────────────────────────────────────────────────────────
 * Plafonne le VOLUME d'envoi pour empêcher :
 *   - le mail-bombing d'une même boîte (plafond par destinataire normalisé)
 *   - le détournement global d'un compte ou d'une clé API (plafond global)
 *
 * Le comptage s'appuie sur la table CourrielSortant (INDEX destinatairePrincipal+createdAt) :
 * autoritaire et partagé entre toutes les instances serverless (contrairement à
 * une mémoire de processus). Fenêtre glissante d'une heure par défaut.
 *
 * Variables d'environnement :
 *   MAIL_MAX_PER_RECIPIENT_HOUR  (défaut 10)   plafond/heure par destinataire normalisé
 *   MAIL_MAX_GLOBAL_HOUR         (défaut 300)  plafond/heure toute plateforme confondue
 */

import { db } from '../db';
import { normaliserDestinataire } from './validate';

const FENETRE_MS = 60 * 60 * 1000; // 1 heure glissante

const envPositif = (nom: string, defaut: number): number => {
  const v = Number(process.env[nom]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : defaut;
};

export function plafondParDestinataire(): number {
  return envPositif('MAIL_MAX_PER_RECIPIENT_HOUR', 10);
}
export function plafondGlobal(): number {
  return envPositif('MAIL_MAX_GLOBAL_HOUR', 300);
}

export interface ResultatRateLimit {
  autorise: boolean;
  motif?: string;
  /** Attendre (secondes) avant de pouvoir réessayer — pour la réponse 429 */
  reessayerDans?: number;
}

async function compterEnvoyesDepuis(depuis: Date, where?: Record<string, unknown>): Promise<number> {
  const clause = { statut: { notIn: ['ECHEC'] }, createdAt: { gte: depuis }, ...where };
  return db.courrielSortant.count({ where: clause });
}

/**
 * Vérifie les plafonds pour une demande d'envoi.
 * À appeler AVANT l'insertion en file. Les messages en cours d'envoi ou déjà
 * envoyés comptent (statut != ECHEC) pour qu'un spammeur ne puisse pas vider
 * sa file en la relançant.
 */
export async function verifierQuotas(destinataires: string[]): Promise<ResultatRateLimit> {
  const depuis = new Date(Date.now() - FENETRE_MS);

  // 1. Plafond global (protège la plateforme et la réputation du domaine)
  const totalHeure = await compterEnvoyesDepuis(depuis);
  if (totalHeure >= plafondGlobal()) {
    return {
      autorise: false,
      motif: `Volume global d'e-mails atteint (${totalHeure}/${plafondGlobal()} par heure). Réessayez plus tard.`,
      reessayerDans: 900,
    };
  }

  // 2. Plafond par destinataire (normalisé : anti "+tag" / points Gmail)
  for (const adresse of destinataires) {
    const cle = normaliserDestinataire(adresse);
    const envoisDest = await compterEnvoyesDepuis(depuis, { destinatairePrincipal: cle });
    if (envoisDest >= plafondParDestinataire()) {
      return {
        autorise: false,
        motif: `Plafond d'envoi atteint pour « ${cle} » (${envoisDest}/${plafondParDestinataire()} par heure).`,
        reessayerDans: 600,
      };
    }
  }

  return { autorise: true };
}
