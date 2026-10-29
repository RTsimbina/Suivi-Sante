/**
 * setup-token.ts — Vérification du jeton d'installation (/api/setup).
 * ─────────────────────────────────────────────────────────────────────
 * Correctif P0 « Sécuriser le jeton d'installation » (audit) :
 *
 *   AVANT : GET /api/setup?token=<jeton> — le jeton transitait dans
 *   l'URL (logs serveur, proxys, historique, télémétrie) et la
 *   comparaison `timingSafeEqual(Buffer.from(token), Buffer.from(env))`
 *   levaient une RangeError non gérée dès que les longueurs différaient :
 *   le statut 500 (erreur) contre 403 (refus) fuyait la LONGUEUR du jeton
 *   attendu et alimentait un oracle de recherche.
 *
 *   APRÈS : POST /api/setup avec `Authorization: Bearer <SETUP_TOKEN>`.
 *   Cette fonction renvoie un verdict structuré SANS exception possible :
 *     - 503 : SETUP_TOKEN absent ou vide côté serveur (config manquante)
 *             — vérifié AVANT toute comparaison ;
 *     - 403 : message GÉNÉRIQUE UNIQUE pour en-tête absent, schéma
 *             invalide, jeton vide ou jeton incorrect (aucun oracle) ;
 *     - 200 : jeton valide (buffers de même longueur comparés par
 *             crypto.timingSafeEqual).
 *
 * Aucune valeur de jeton (reçu ou attendu) n'apparaît jamais dans les
 * messages d'erreur ni dans les motifs de journalisation.
 */

import { timingSafeEqual } from 'crypto';

/** Schéma d'autorisation attendu (RFC 6750). */
const SCHEMA_BEARER = 'Bearer ';

export interface ResultatVerificationJeton {
  /** true uniquement si le jeton est valide et l'installation autorisée. */
  ok: boolean;
  /** Statut HTTP à renvoyer : 200, 403 ou 503. */
  statut: 200 | 403 | 503;
  /** Message d'erreur générique (jamais de contenu de jeton) — si refus. */
  erreur?: string;
  /** Catégorie interne de refus pour la journalisation (sans secret) : */
  motif?: 'CONFIG_MANQUANTE' | 'ENTETE_ABSENT' | 'SCHEMA_INVALIDE' | 'JETON_VIDE' | 'JETON_INVALIDE';
}

/** Message 403 unique — aucune distinction exploitable entre les motifs. */
const REFUS_GENERIQUE = 'Token de setup invalide';

/**
 * Vérifie l'en-tête `Authorization: Bearer <jeton>` contre le jeton serveur.
 *
 * Contrat anti-exception : quelle que soit l'entrée (null, vide, longueur
 * quelconque, encodage quelconque), la fonction RENVOIE toujours un
 * résultat — elle ne lève jamais, y compris sur des longueurs différentes.
 */
export function verifierJetonSetup(
  enteteAutorisation: string | null | undefined,
  jetonServeur: string | undefined,
): ResultatVerificationJeton {
  // 1) Configuration serveur d'abord : sans jeton attendu, AUCUNE
  //    comparaison n'a de sens (et un SETUP_TOKEN="" ne doit JAMAIS
  //    matcher une entrée vide — l'installation reste désactivée).
  if (!jetonServeur) {
    return {
      ok: false,
      statut: 503,
      erreur: 'SETUP_TOKEN non configuré côté serveur — installation désactivée.',
      motif: 'CONFIG_MANQUANTE',
    };
  }

  // 2) En-tête présent + schéma Bearer exact.
  if (!enteteAutorisation) {
    return { ok: false, statut: 403, erreur: REFUS_GENERIQUE, motif: 'ENTETE_ABSENT' };
  }
  if (!enteteAutorisation.startsWith(SCHEMA_BEARER)) {
    return { ok: false, statut: 403, erreur: REFUS_GENERIQUE, motif: 'SCHEMA_INVALIDE' };
  }
  const jetonRecu = enteteAutorisation.slice(SCHEMA_BEARER.length).trim();
  if (!jetonRecu) {
    return { ok: false, statut: 403, erreur: REFUS_GENERIQUE, motif: 'JETON_VIDE' };
  }

  // 3) Conversion en buffers + contrôle d'ÉGALITÉ DE LONGUEUR avant
  //    timingSafeEqual : crypto.timingSafeEqual lève RangeError sur des
  //    longueurs différentes — le contrôle préalable est obligatoire
  //    (correctif du défaut d'audit) et son échec renvoie le même 403
  //    générique que le jeton incorrect (aucune fuite de longueur).
  const bufferRecu = Buffer.from(jetonRecu, 'utf8');
  const bufferAttendu = Buffer.from(jetonServeur, 'utf8');
  if (bufferRecu.length !== bufferAttendu.length) {
    return { ok: false, statut: 403, erreur: REFUS_GENERIQUE, motif: 'JETON_INVALIDE' };
  }
  if (!timingSafeEqual(bufferRecu, bufferAttendu)) {
    return { ok: false, statut: 403, erreur: REFUS_GENERIQUE, motif: 'JETON_INVALIDE' };
  }
  return { ok: true, statut: 200 };
}

/**
 * Clé de limitation de débit pour /api/setup (fenêtre par adresse IP).
 * Construite ici pour rester testable et cohérente avec les conventions
 * de src/lib/rate-limit.ts (préfixe applicatif ajouté par ce module).
 */
export function cleRateLimitSetup(ip: string): string {
  return `setup:ip:${ip}`;
}
