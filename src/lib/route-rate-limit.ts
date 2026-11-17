/**
 * route-rate-limit.ts — Limitation de débit des routes publiques sensibles.
 *
 * CONTEXTE (P1 du registre de sécurité, mission « Rate Limiting »)
 * ─────────────────────────────────────────────────────────────────
 * Les routes publiques /api/auth/forgot-password, /api/auth/reset-password
 * et /api/session/lockout n'avaient AUCUNE limite propre : un attaquant
 * pouvait les marteler sans plafond (spam de liens de réinitialisation
 * transitant par le service de messagerie, brute-force de jetons, oracle
 * de verrouillage). Le login NextAuth, lui, est déjà protégé par la
 * politique à 3 niveaux (src/lib/login-policy.ts) et le verrouillage
 * atomique par compte (src/lib/account-lockout.ts).
 *
 * STOCKAGE PARTAGÉ (exigence Vercel)
 * ──────────────────────────────────
 * Les compteurs vivent dans src/lib/rate-limit.ts : Redis (Upstash, Lua
 * atomique) → PostgreSQL/Neon (INSERT … ON CONFLICT atomique) → mémoire.
 * TOUTES les instances Vercel partagent le même compteur : répartir les
 * requêtes sur plusieurs lambdas ne contourne plus la limite, et les
 * compteurs survivent aux redémarrages.
 *
 * POLITIQUE APPLIQUÉE ICI
 * ───────────────────────────────────────────────────────────────────────
 *   1. Lecture SANS incrément (getRateLimitStatus) de chaque niveau : si
 *      une fenêtre est déjà dépassée, la demande est refusée TÔT — sans
 *      consommer de tentative, sans requête en base, sans toucher au
 *      service de messagerie.
 *   2. Sinon incrément ATOMIQUE des niveaux (par IP et, si fourni, par
 *      adresse e-mail déclarée) ; dépassement → HTTP 429 + Retry-After.
 *   3. ANTI-ÉNUMÉRATION : la réponse 429 est construite sur les clés
 *      FOURNIES par le client (IP, e-mail tapé) — jamais sur l'existence
 *      réelle du compte, et son message est UNIQUE pour toutes les routes
 *      concernées. Un compte existant et un compte inconnu produisent
 *      exactement la même réponse.
 *   4. ÉVITER LES BLOCAGES ABUSIFS : les limites par défaut sont très
 *      au-dessus de l'usage légitime (ex. 10 demandes de lien en 15 min
 *      par IP), configurables par variables d'environnement ; échec
 *      OUVERT si le backend de comptage est indisponible (disponibilité
 *      des légitimes — le verrouillage par compte PostgreSQL reste actif
 *      côté login) ; la fenêtre FIXE se réinitialise d'elle-même : aucun
 *      déblocage manuel n'est jamais nécessaire.
 */

import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  getRateLimitStatus,
  getClientIp,
  intFromEnv,
} from './rate-limit';

/** Message 429 UNIQUE (aucun détail — aucune énumération, aucune fuite). */
export const MESSAGE_429 = 'Trop de demandes. Réessayez plus tard.';

/** Un niveau de limitation : limite par fenêtre, configurables par env. */
export interface NiveauLimite {
  /** Nom de la variable d'environnement de la LIMITE (ex. FORGOT_PASSWORD_IP_LIMIT). */
  envLimite: string;
  /** Limite par défaut si la variable n'est pas définie. */
  limiteDefaut: number;
  /** Nom de la variable d'environnement de la FENÊTRE en secondes. */
  envFenetre: string;
  /** Fenêtre par défaut en secondes. */
  fenetreDefaut: number;
  /** Valeur d'identité (e-mail fourni) pour les niveaux « par compte ». */
  valeur?: string;
}

export interface OptionsLimiteRoute {
  /** Préfixe logique des clés, ex. 'forgot' → forgot:ip:1.2.3.4 */
  prefixe: string;
  /** Niveau par adresse IP (toutes les routes sensibles en ont un). */
  ip?: NiveauLimite;
  /** Niveau par e-mail fourni (forgot-password, session/lockout). */
  identite?: NiveauLimite;
}

/** Construit la réponse 429 (Retry-After = secondes restantes de la fenêtre). */function reponse429(resetSeconds: number): NextResponse {
  const attente = Math.max(1, Math.min(3600, resetSeconds || 60));
  return NextResponse.json({ message: MESSAGE_429 }, {
    status: 429,
    headers: { 'Retry-After': String(attente) },
  });
}

/**
 * Applique la politique de limitation d'une route publique sensible.
 *
 * Retourne { ok: true } si la demande peut être traitée, ou { ok: false,
 * reponse } — la NextResponse 429 prête à renvoyer (la route n'a plus
 * qu'à la retourner telle quelle).
 */
export async function limiterRouteSensible(
  headers: unknown,
  options: OptionsLimiteRoute,
): Promise<{ ok: true } | { ok: false; reponse: NextResponse }> {
  const ip = getClientIp(headers) || 'unknown';

  const niveaux: { cle: string; niveau: NiveauLimite }[] = [];
  if (options.ip) {
    niveaux.push({
      cle: `${options.prefixe}:ip:${ip}`,
      niveau: options.ip,
    });
  }
  if (options.identite?.valeur) {
    const email = options.identite.valeur.trim().toLowerCase().slice(0, 254);
    niveaux.push({
      cle: `${options.prefixe}:email:${email}`,
      niveau: options.identite,
    });
  }

  // 1. Bloquer TÔT si une fenêtre est déjà dépassée (lecture sans
  //    incrément : aucune tentative consommée, aucun effet de bord).
  for (const { cle, niveau } of niveaux) {
    const limite = intFromEnv(niveau.envLimite, niveau.limiteDefaut);
    const etat = await getRateLimitStatus(cle);
    if (etat.count > limite) {
      return { ok: false, reponse: reponse429(etat.resetSeconds) };
    }
  }

  // 2. Incrémenter les compteurs (atomique, partagé entre instances) et
  //    refuser si l'un des niveaux vient de dépasser sa limite.
  let resetSeconds = 0;
  for (const { cle, niveau } of niveaux) {
    const limite = intFromEnv(niveau.envLimite, niveau.limiteDefaut);
    const fenetre = intFromEnv(niveau.envFenetre, niveau.fenetreDefaut);
    const resultat = await checkRateLimit({ key: cle, limit: limite, windowSeconds: fenetre });
    if (!resultat.allowed) {
      return { ok: false, reponse: reponse429(resultat.resetSeconds) };
    }
    if (resultat.resetSeconds > resetSeconds) resetSeconds = resultat.resetSeconds;
  }

  return { ok: true };
}
