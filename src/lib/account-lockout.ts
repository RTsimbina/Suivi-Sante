/**
 * account-lockout.ts — Verrouillage de compte par échecs de connexion (Postgres).
 *
 * PROBLÈME RÉSOLU (correction n°3 « compteur d'échecs atomique »)
 * ───────────────────────────────────────────────────────────────
 * L'ancienne version lisait le compteur, l'incrémentait EN JAVASCRIPT puis
 * réécrivait la valeur calculée :
 *
 *     Instance A : SELECT failedAttempts → 4
 *     Instance B : SELECT failedAttempts → 4
 *     Instance A : UPDATE SET failedAttempts = 5
 *     Instance B : UPDATE SET failedAttempts = 5   ← incrément PERDU
 *
 * En serverless (Vercel), les instances sont nombreuses et simultanées : un
 * attaquant distribuait ses requêtes et l'incrément perdu lui redonnait
 * autant de tentatives supplémentaires. Désormais, l'incrément est effectué
 * PAR LA BASE dans un SEUL UPDATE atomique :
 *
 *     UPDATE "Utilisateur" SET
 *       "failedAttempts" = CASE ... "failedAttempts" + 1 ... END,
 *       "lockoutUntil"   = CASE ... now() + durée ... END
 *     WHERE "email" = $1
 *     RETURNING "failedAttempts", "lockoutUntil"
 *
 * Postgres verrouille la ligne pendant l'UPDATE : les UPDATE concurrents sur
 * le même compte sont sérialisés, chaque instruction relit la ligne à jour
 * avant d'écrire — AUCUN incrément ne peut être perdu, quel que soit le
 * nombre d'instances simultanées (prouvé par scripts/test-atomic-lockout.mjs :
 * 30 instances parallèles → compteur exactement à 30).
 *
 * La même instruction gère :
 *   - l'incrément normal            : "failedAttempts" + 1 (jamais une valeur
 *                                     calculée côté application) ;
 *   - le verrou expiré              : le compteur repart à 1 ET le verrou est
 *                                     nettoyé dans la même transaction ;
 *   - le déclenchement du verrou    : au seuil MAX_ATTEMPTS, lockoutUntil =
 *                                     now() + LOCKOUT_DURATION (même instruction,
 *                                     donc impossible de « sauter » le verrou) ;
 *   - le compte déjà verrouillé     : valeurs inchangées, verrou conservé.
 *
 * RÉSILIENCE (inchangée) : $queryRaw / $executeRaw sans dépendre du schéma
 * Prisma — si les colonnes failedAttempts / lockoutUntil n'existent pas encore
 * (migration non appliquée), le verrouillage est simplement désactivé au lieu
 * de casser tout le login.
 */

import { db } from './db';
import { intFromEnv } from './rate-limit';

/** Seuil d'échecs déclenchant le verrouillage (configurable : LOCKOUT_MAX_ATTEMPTS). */
export const MAX_ATTEMPTS = intFromEnv('LOCKOUT_MAX_ATTEMPTS', 5);
/** Durée du verrouillage en secondes (configurable : LOCKOUT_DURATION_SECONDS). */
export const LOCKOUT_DURATION_SECONDS = intFromEnv('LOCKOUT_DURATION_SECONDS', 15 * 60);

interface LockRow {
  failedattempts: number;
  lockoutuntil: Date | null;
}

export interface LockStatus {
  locked: boolean;
  remainingMs: number;
}

/**
 * Indique si le compte est actuellement verrouillé.
 *
 * Le nettoyage d'un verrou EXPIRÉ est conditionnel (WHERE "lockoutUntil" <=
 * now()) : si une instance concurrente vient de traiter un échec sur ce compte
 * (compteur incrémenté, verrou NULL ou futur), la condition est fausse et la
 * réinitialisation n'écrase RIEN — les deux ordres d'exécution aboutissent au
 * même compteur exact.
 */
export async function isLockedOut(email: string): Promise<LockStatus> {
  try {
    const rows: LockRow[] = await db.$queryRaw`
      SELECT "failedAttempts" AS "failedattempts",
             "lockoutUntil"   AS "lockoutuntil"
      FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.lockoutuntil) {
      return { locked: false, remainingMs: 0 };
    }
    const now = Date.now();
    if (now < row.lockoutuntil.getTime()) {
      return { locked: true, remainingMs: row.lockoutuntil.getTime() - now };
    }
    // Verrou expiré → nettoyage ATOMIQUE conditionnel (jamais au détriment
    // d'un incrément concurrent, voir doc au-dessus).
    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = 0, "lockoutUntil" = NULL
      WHERE "email" = ${email}
        AND "lockoutUntil" IS NOT NULL AND "lockoutUntil" <= now()
    `;
    return { locked: false, remainingMs: 0 };
  } catch {
    // Colonnes manquantes (migration non appliquée) → pas de lockout
    return { locked: false, remainingMs: 0 };
  }
}

/**
 * Enregistre UN échec d'authentification pour le compte — ATOMIQUE.
 *
 * Un seul UPDATE : l'incrément est calculé PAR POSTGRES (la ligne est
 * verrouillée pendant l'opération, les instructions concurrentes sont
 * sérialisées et relisent la ligne à jour). RETURNING renvoie l'état APRÈS
 * écriture : verrou actif (nouveau ou déjà posé) ou pas.
 *
 * Retour : { locked: true } si le verrou vient d'être déclenché (seuil
 * atteint) ou si le compte était déjà verrouillé ; sinon { locked: false }.
 */
export async function recordFailedAttempt(email: string): Promise<LockStatus> {
  try {
    const rows: LockRow[] = await db.$queryRaw`
      UPDATE "Utilisateur"
      SET
        "failedAttempts" =
          CASE
            -- déjà verrouillé : pas d'incrément, compteur inchangé
            WHEN "lockoutUntil" IS NOT NULL AND "lockoutUntil" > now()
              THEN "failedAttempts"
            -- verrou expiré : la fenêtre repart à zéro (compteur = 1er échec)
            WHEN "lockoutUntil" IS NOT NULL AND "lockoutUntil" <= now()
              THEN 1
            -- cas normal : incrément PAR LA BASE (jamais une valeur JS)
            ELSE "failedAttempts" + 1
          END,
        "lockoutUntil" =
          CASE
            -- déjà verrouillé : verrou conservé tel quel
            WHEN "lockoutUntil" IS NOT NULL AND "lockoutUntil" > now()
              THEN "lockoutUntil"
            -- seuil atteint (sur la valeur RECALCULÉE atomiquement) : verrou
            WHEN (
              CASE
                WHEN "lockoutUntil" IS NOT NULL AND "lockoutUntil" > now()
                  THEN "failedAttempts"
                WHEN "lockoutUntil" IS NOT NULL AND "lockoutUntil" <= now()
                  THEN 1
                ELSE "failedAttempts" + 1
              END
            ) >= ${MAX_ATTEMPTS}
              THEN now() + make_interval(secs => ${LOCKOUT_DURATION_SECONDS}::double precision)
            -- sous le seuil : pas de verrou (un éventuel verrou expiré est nettoyé)
            ELSE NULL
          END
      WHERE "email" = ${email}
      RETURNING
        "failedAttempts" AS "failedattempts",
        "lockoutUntil"   AS "lockoutuntil"
    `;
    const row = rows[0];
    if (!row) {
      // Utilisateur inconnu : rien à verrouiller (comme avant).
      return { locked: false, remainingMs: 0 };
    }
    if (row.lockoutuntil && Date.now() < row.lockoutuntil.getTime()) {
      return { locked: true, remainingMs: row.lockoutuntil.getTime() - Date.now() };
    }
    return { locked: false, remainingMs: 0 };
  } catch (error) {
    // Colonnes manquantes ou base injoignable → lockout désactivé, le login
    // continue de fonctionner (le rate limiting distribué reste actif).
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[account-lockout] Verrouillage indisponible (échec ouvert): ${message}`);
    return { locked: false, remainingMs: 0 };
  }
}

/**
 * Réinitialise le compteur d'échecs et le verrou (connexion réussie).
 * Écriture inconditionnelle idempotente : aucun risque de perte d'incrément
 * (elle ne fait qu'annuler).
 */
export async function resetAttempts(email: string) {
  try {
    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = 0, "lockoutUntil" = NULL
      WHERE "email" = ${email}
    `;
  } catch {
    // Silencieux
  }
}
