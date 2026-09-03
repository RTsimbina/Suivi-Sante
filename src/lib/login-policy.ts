/**
 * login-policy.ts — Politique de limitation de débit de l'authentification.
 *
 * PROBLÈME RÉSOLU (correction n°2 « clé de limitation Email → IP »)
 * ─────────────────────────────────────────────────────────────────
 * Le mécanisme d'origine était PRÉSENTÉ comme une limitation par IP alors
 * que la clé du rate limiter utilisait l'e-mail (l'e-mail servait de proxy
 * d'IP) : la clé ne correspondait donc à aucune politique de sécurité
 * explicite. Ce module formalise la politique et garantit que CHAQUE clé
 * correspond EXACTEMENT à ce qu'elle protège :
 *
 *   NIVEAU 1 — PAR COMPTE          login:email:<email>
 *     Protège un compte particulier : ne compte que les ÉCHECS, toutes IP
 *     confondues. Un compte attaqué depuis plusieurs IP est bloqué pour
 *     toutes les sources (le verrouillage PostgreSQL par compte dans
 *     auth.ts reste la deuxième barrière). Réinitialisé après un succès.
 *
 *   NIVEAU 2 — PAR IP              login:ip:<ip>
 *     Limite une source réseau : compte TOUTES les tentatives (succès
 *     inclus) sur tous les comptes confondus. Plusieurs comptes ciblés
 *     depuis une même IP épuisent le budget de cette IP.
 *
 *   NIVEAU 3 — COMBINÉE            login:<ip>:<email>
 *     Le couple (source réseau, compte cible) — recommandation pour
 *     l'authentification : ne compte que les ÉCHECS du couple. Verrouille
 *     précisément la combinaison attaquant/compte SANS pénaliser ni les
 *     autres comptes de la même IP (NAT d'entreprise, bureau partagé), ni
 *     les autres IP du même compte (utilisateur mobile). Réinitialisé
 *     après un succès.
 *
 *   GARDE-FOU — GLOBAL             login:global
 *     Toutes les tentatives de connexion de l'application confondues.
 *     DÉSACTIVÉ par défaut (LOGIN_GLOBAL_LIMIT=0) car un blocage global
 *     est lui-même un vecteur de déni de service : à n'activer que comme
 *     soupape de sécurité contre une tempête de connexions.
 *
 * Les compteurs des trois niveaux sont indépendants et utilisent des
 * seuils distincts (voir constantes ci-dessous, toutes configurables par
 * variable d'environnement). Le stockage est distribué (Redis/Postgres,
 * voir rate-limit.ts) : atomique (INCR + EXPIRE), partagé par toutes les
 * instances, survivant aux redémarrages.
 *
 * Incrémentations :
 *   - Niveau 2 et garde-fou : à CHAQUE tentative (volume) ;
 *   - Niveaux 1 et 3 : uniquement sur ÉCHEC (un utilisateur légitime qui
 *     se connecte correctement ne consomme jamais son budget d'échecs).
 */

import {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  intFromEnv,
} from './rate-limit';

// ─── Seuils par niveau (configurables, valeurs par défaut) ───────────────────

/** Niveau 1 — échecs par compte : 5 / 15 minutes (cohérent avec le lockout DB). */
export const LOGIN_EMAIL_LIMIT = intFromEnv('LOGIN_EMAIL_LIMIT', 5);
export const LOGIN_EMAIL_WINDOW_SECONDS = intFromEnv('LOGIN_EMAIL_WINDOW_SECONDS', 15 * 60);

/** Niveau 2 — toutes tentatives par IP, tous comptes confondus : 30 / 15 minutes. */
export const LOGIN_IP_LIMIT = intFromEnv('LOGIN_IP_LIMIT', 30);
export const LOGIN_IP_WINDOW_SECONDS = intFromEnv('LOGIN_IP_WINDOW_SECONDS', 15 * 60);

/** Niveau 3 — échecs par couple IP+compte : 5 / 15 minutes. */
export const LOGIN_PAIR_LIMIT = intFromEnv('LOGIN_PAIR_LIMIT', 5);
export const LOGIN_PAIR_WINDOW_SECONDS = intFromEnv('LOGIN_PAIR_WINDOW_SECONDS', 15 * 60);

/**
 * Garde-fou global — toutes tentatives confondues : DÉSACTIVÉ par défaut
 * (0). intFromEnv retombe sur la valeur par défaut (0) pour toute valeur
 * non positive, donc LOGIN_GLOBAL_LIMIT="0" ou vide désactivent le niveau.
 */
export const LOGIN_GLOBAL_LIMIT = intFromEnv('LOGIN_GLOBAL_LIMIT', 0);
export const LOGIN_GLOBAL_WINDOW_SECONDS = intFromEnv('LOGIN_GLOBAL_WINDOW_SECONDS', 15 * 60);

// ─── Construction des clés (source de vérité unique de la politique) ─────────

/** Normalise un e-mail pour la clé : trim + minuscules (Carnet@X.com ≡ carnet@x.com). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Niveau 2 : clé de la source réseau. */
export function loginIpKey(ip: string): string {
  return `login:ip:${ip}`;
}

/** Niveau 1 : clé du compte (e-mail normalisé). */
export function loginEmailKey(email: string): string {
  return `login:email:${normalizeEmail(email)}`;
}

/**
 * Niveau 3 : clé du COUPLE (source réseau, compte cible) — format
 * recommandé pour l'authentification : login:<IP>:<email>.
 */
export function loginPairKey(ip: string, email: string): string {
  return `login:${ip}:${normalizeEmail(email)}`;
}

/** Garde-fou : clé globale (toutes tentatives de l'application). */
export const LOGIN_GLOBAL_KEY = 'login:global';

// ─── Évaluation d'une tentative (avant vérification des identifiants) ────────

export type LoginBlockReason = 'global' | 'ip' | 'email' | 'pair';

export interface LoginEvaluation {
  /** true si la tentative peut proceeder à la vérification des identifiants. */
  allowed: boolean;
  /** Niveau ayant bloqué, si allowed === false. */
  reason?: LoginBlockReason;
  /** Compteur du niveau bloqueur au moment du refus (diagnostic/logs). */
  count?: number;
  /** Secondes avant réinitialisation de la fenêtre du niveau bloqueur. */
  resetSeconds?: number;
}

/**
 * Vérifie la politique complète pour une tentative de connexion
 * (ip + e-mail), dans l'ordre : garde-fou global → IP → compte → couple.
 *
 * Effets de bord ATTENDUS (compteurs de volume) : incrémente le garde-fou
 * global (s'il est activé) et le compteur par IP à chaque appel. Les
 * compteurs par compte et par couple ne sont PAS incrémentés ici : ils le
 * sont uniquement sur échec, par recordFailedLogin().
 */
export async function evaluateLoginAttempt(ip: string, email: string): Promise<LoginEvaluation> {
  // Garde-fou global (désactivé si LOGIN_GLOBAL_LIMIT <= 0) — toutes tentatives.
  if (LOGIN_GLOBAL_LIMIT > 0) {
    const global = await checkRateLimit({
      key: LOGIN_GLOBAL_KEY,
      limit: LOGIN_GLOBAL_LIMIT,
      windowSeconds: LOGIN_GLOBAL_WINDOW_SECONDS,
    });
    if (!global.allowed) {
      return { allowed: false, reason: 'global', count: global.count, resetSeconds: global.resetSeconds };
    }
  }

  // Niveau 2 (par IP) — toutes tentatives, tous comptes confondus.
  const ipCheck = await checkRateLimit({
    key: loginIpKey(ip),
    limit: LOGIN_IP_LIMIT,
    windowSeconds: LOGIN_IP_WINDOW_SECONDS,
  });
  if (!ipCheck.allowed) {
    return { allowed: false, reason: 'ip', count: ipCheck.count, resetSeconds: ipCheck.resetSeconds };
  }

  // Niveau 1 (par compte) — LECTURE SEULE ici (l'incrément n'a lieu que sur
  // échec) pour ne pas consommer le budget d'échecs des connexions légitimes.
  const emailStatus = await getRateLimitStatus(loginEmailKey(email));
  if (emailStatus.count >= LOGIN_EMAIL_LIMIT) {
    return { allowed: false, reason: 'email', count: emailStatus.count, resetSeconds: emailStatus.resetSeconds };
  }

  // Niveau 3 (couple IP+compte) — LECTURE SEULE, même raisonnement.
  const pairStatus = await getRateLimitStatus(loginPairKey(ip, email));
  if (pairStatus.count >= LOGIN_PAIR_LIMIT) {
    return { allowed: false, reason: 'pair', count: pairStatus.count, resetSeconds: pairStatus.resetSeconds };
  }

  return { allowed: true };
}

// ─── Enregistrement d'un échec ────────────────────────────────────────────────

/**
 * Incrémente les compteurs d'ÉCHEC du compte (niveau 1) et du couple
 * IP+compte (niveau 3), en parallèle (2 allers-retours simultanés vers le
 * stockage partagé). Appelé UNIQUEMENT sur échec d'authentification :
 * utilisateur inexistant, compte désactivé ou mot de passe invalide.
 */
export async function recordFailedLogin(ip: string, email: string): Promise<void> {
  const [emailResult, pairResult] = await Promise.all([
    checkRateLimit({
      key: loginEmailKey(email),
      limit: LOGIN_EMAIL_LIMIT,
      windowSeconds: LOGIN_EMAIL_WINDOW_SECONDS,
    }),
    checkRateLimit({
      key: loginPairKey(ip, email),
      limit: LOGIN_PAIR_LIMIT,
      windowSeconds: LOGIN_PAIR_WINDOW_SECONDS,
    }),
  ]);
  if (!emailResult.allowed) {
    console.warn(
      `[AUTH] Budget d'échecs épuisé pour le compte ${normalizeEmail(email)} ` +
        `(${emailResult.count}/${LOGIN_EMAIL_LIMIT}, reset dans ${emailResult.resetSeconds}s)`,
    );
  }
  if (!pairResult.allowed) {
    console.warn(
      `[AUTH] Budget d'échecs épuisé pour le couple ${ip}→${normalizeEmail(email)} ` +
        `(${pairResult.count}/${LOGIN_PAIR_LIMIT}, reset dans ${pairResult.resetSeconds}s)`,
    );
  }
}

// ─── Réinitialisation après connexion réussie ────────────────────────────────

/**
 * Remet à zéro les compteurs d'échec du compte (niveau 1) et du couple
 * (niveau 3) après une connexion réussie. Le compteur par IP (niveau 2,
 * volume toutes tentatives) est volontairement CONSERVÉ : il mesure le
 * trafic de la source sur la fenêtre courante et s'expire de lui-même.
 */
export async function resetLoginCounters(ip: string, email: string): Promise<void> {
  await Promise.all([
    resetRateLimit(loginEmailKey(email)),
    resetRateLimit(loginPairKey(ip, email)),
  ]);
}
