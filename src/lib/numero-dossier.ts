/**
 * Numérotation des dossiers — GÉNÉRÉE CÔTÉ SERVEUR.
 * ────────────────────────────────────────────────────────────
 * Correctif audit P2 : le numéro était composé côté client
 * (`DOS-<année>-<total+1>` en interrogeant le total de la liste), ce qui
 * produisait des doublons dès que deux utilisateurs créaient un dossier
 * simultanément (ou quand la liste était filtrée par le périmètre société).
 *
 * Désormais : le serveur calcule le prochain numéro DANS la transaction de
 * création, et la contrainte UNIQUE `Dossier.numeroDossier` (schéma Prisma)
 * sert d'arbitre absolu : en cas de collision (course résiduelle entre deux
 * transactions, dossier supprimé créant un trou, …), `avecRetryNumeroDossier`
 * régénère un numéro décalé (jusqu'à 5 essais).
 *
 * Format : DOS-<année de réception>-<séquence sur 6 chiffres>
 */

import type { Prisma } from '@prisma/client';

/** Préfixe annuel des numéros de dossier (ex: "DOS-2026-"). */
export function prefixeNumeroDossier(annee: number): string {
  return `DOS-${annee}-`;
}

/** Formate un numéro de dossier complet : DOS-<année>-<séquence 6 chiffres>. */
export function formaterNumeroDossier(annee: number, sequence: number): string {
  const seq = Math.max(1, Math.floor(sequence));
  return `${prefixeNumeroDossier(annee)}${String(seq).padStart(6, '0')}`;
}

/**
 * Génère le prochain numéro pour l'année donnée, depuis le compteur de
 * dossiers déjà porteurs du préfixe annuel. À appeler DANS la transaction
 * de création (`tx`) pour limiter la fenêtre de course.
 * @param decalage décalage ajouté après une collision (retry), 0 sinon.
 */
export async function genererNumeroDossier(
  tx: Pick<Prisma.TransactionClient, 'dossier'>,
  annee: number,
  decalage = 0
): Promise<string> {
  const prefixe = prefixeNumeroDossier(annee);
  const total = await tx.dossier.count({
    where: { numeroDossier: { startsWith: prefixe } },
  });
  return formaterNumeroDossier(annee, total + 1 + decalage);
}

/**
 * Détecte une violation d'unicité Prisma (P2002) portant précisément sur
 * `numeroDossier`. Duck-typing volontaire : évite d'instancier les classes
 * d'erreur Prisma (et reste robuste aux variations de `meta.target`).
 */
export function estConflitNumeroDossier(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const cible = e.meta?.target;
  if (Array.isArray(cible)) return (cible as unknown[]).includes('numeroDossier');
  if (typeof cible === 'string') return cible.includes('numeroDossier');
  return false;
}

/**
 * Exécute `tentative` (la transaction de création complète, qui régénère le
 * numéro à chaque appel avec le `decalage` fourni) et rejoue en cas de
 * collision d'unicité sur numeroDossier.
 *
 * @param tentative fonction recevant le décalage courant (0, 1, 2, …) et
 *        exécutant la transaction : `db.$transaction(async (tx) => { …
 *        genererNumeroDossier(tx, annee, decalage) … })`
 * @param maxEssais nombre maximum d'essais (défaut 5).
 * @throws la dernière erreur si les essais sont épuisés, ou immédiatement
 *         toute erreur qui n'est pas une collision de numéro.
 */
export async function avecRetryNumeroDossier<T>(
  tentative: (decalage: number) => Promise<T>,
  maxEssais = 5
): Promise<T> {
  for (let decalage = 0; ; decalage++) {
    try {
      return await tentative(decalage);
    } catch (error: unknown) {
      if (decalage < maxEssais - 1 && estConflitNumeroDossier(error)) {
        continue; // numéro pris entre-temps → régénérer avec le décalage
      }
      throw error;
    }
  }
}
