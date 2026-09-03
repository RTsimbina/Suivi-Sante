/**
 * rate-limit.ts — Limiteur de débit à fenêtre fixe avec stockage partagé Redis.
 *
 * PROBLÈME RÉSOLU
 * ───────────────
 * Les anciens compteurs anti brute-force étaient stockés dans des `Map`
 * locales au processus (src/lib/auth.ts, src/lib/webhook-verify.ts).
 * En environnement serverless (Vercel), chaque instance lambda possède sa
 * propre mémoire : les attaquants pouvaient contourner les limites en
 * répartissant leurs tentatives sur plusieurs instances, et chaque
 * redémarrage d'instance réinitialisait les compteurs.
 *
 * SOLUTION
 * ────────
 * Compteurs centralisés dans Redis via l'API REST d'Upstash (fonctionne en
 * serverless car purement HTTP, sans connexion TCP persistante) :
 *
 *   - Opération ATOMIQUE : script Lua EVAL unique qui fait INCR + EXPIRE
 *     (l'expiration n'est posée qu'au premier incrément de la fenêtre) —
 *     impossible qu'une instance voie un état incohérent.
 *   - Clés utilisées dans l'application :
 *       login:ip:<adresse-ip>        → tentatives de connexion par IP
 *       login:email:<email>          → tentatives échouées par compte
 *       webhook:ip:<adresse-ip>      → requêtes webhook entrantes par IP
 *   - Un préfixe global optionnel (RATE_LIMIT_KEY_PREFIX) permet de partager
 *     le même Redis entre plusieurs applications sans collision de clés.
 *
 * DÉGRADATION GRACIEUSE
 * ─────────────────────
 *   - Redis non configuré (pas d'UPSTASH_REDIS_REST_URL/TOKEN) → bascule
 *     automatique sur un compteur mémoire local (comportement historique,
 *     adapté au développement mono-instance).
 *   - Redis injoignable en pleine production → échec OUVERT (la requête
 *     passe) + log d'erreur : la disponibilité du login prime, et le
 *     verrouillage par compte en PostgreSQL (auth.ts) reste actif.
 */

import { Redis } from "@upstash/redis";

// ─── Types publics ────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Clé logique du compteur, ex. "login:ip:192.168.1.10" ou "login:email:user@example.com" */
  key: string;
  /** Nombre maximum d'opérations autorisées par fenêtre */
  limit: number;
  /** Durée de la fenêtre glissante-fixe, en secondes */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** true si l'opération est autorisée (compteur ≤ limite) */
  allowed: boolean;
  /** Nombre d'opérations comptées dans la fenêtre courante (après incrément) */
  count: number;
  /** Limite configurée */
  limit: number;
  /** Nombre d'opérations restantes avant blocage */
  remaining: number;
  /** Secondes restantes avant réinitialisation de la fenêtre */
  resetSeconds: number;
  /** Backend effectivement utilisé (utile pour le diagnostic / les tests) */
  backend: "redis" | "memory";
  /** Message d'erreur présent si Redis a échoué (échec ouvert) */
  redisError?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Lit un entier positif depuis l'environnement, avec valeur par défaut.
 * Exporté pour que les appelants (auth.ts, webhooks) rendent leurs limites
 * configurables sans dupliquer la logique de parsing.
 */
export function intFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/** Préfixe global optionnel des clés (multi-applications sur un même Redis). */
const KEY_PREFIX = process.env.RATE_LIMIT_KEY_PREFIX?.trim() ?? "";

function prefixed(key: string): string {
  return KEY_PREFIX ? `${KEY_PREFIX}:${key}` : key;
}

// ─── Client Redis (initialisation paresseuse) ────────────────────────────────

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

/** true si un stockage Redis partagé est configuré. */
export function isRedisRateLimitEnabled(): boolean {
  return getRedisClient() !== null;
}

// ─── Opération atomique : INCR + EXPIRE (premier incrément uniquement) ───────

/**
 * Script Lua exécuté côté Redis en un seul appel (ATOME) :
 *   1. INCR de la clé,
 *   2. pose de l'EXPIRE seulement si la clé vient d'être créée (current == 1),
 *      afin que la fenêtre reste fixe et ne soit pas prolongée à chaque hit,
 *   3. renvoie [compteur, TTL] en un seul aller-retour.
 */
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('TTL', KEYS[1])}
`.trim();

// ─── Fallback mémoire (développement mono-instance) ──────────────────────────

const memoryStore = new Map<string, { count: number; resetAt: number }>();
let memoryOps = 0;

/** Purge paresseuse des entrées expirées (évite la fuite mémoire de l'ancien code). */
function sweepMemoryStore(now: number): void {
  for (const [k, entry] of memoryStore) {
    if (now >= entry.resetAt) memoryStore.delete(k);
  }
}

function memoryLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  redisError?: string,
): RateLimitResult {
  const fullKey = prefixed(key);
  const now = Date.now();
  // Nettoyage périodique : 1 fois toutes les 500 opérations, ou si la table grossit trop.
  memoryOps++;
  if (memoryOps % 500 === 0 || memoryStore.size > 10_000) {
    sweepMemoryStore(now);
  }

  const entry = memoryStore.get(fullKey);
  let count: number;
  let resetAt: number;
  if (!entry || now >= entry.resetAt) {
    count = 1;
    resetAt = now + windowSeconds * 1000;
    memoryStore.set(fullKey, { count, resetAt });
  } else {
    entry.count += 1;
    count = entry.count;
    resetAt = entry.resetAt;
  }

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetSeconds: Math.max(0, Math.ceil((resetAt - now) / 1000)),
    backend: "memory",
    ...(redisError ? { redisError } : {}),
  };
}

function memoryStatus(key: string): { count: number; resetSeconds: number } {
  const entry = memoryStore.get(prefixed(key));
  const now = Date.now();
  if (!entry || now >= entry.resetAt) return { count: 0, resetSeconds: 0 };
  return {
    count: entry.count,
    resetSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Incrémente le compteur partagé de façon ATOMIQUE (EVAL Lua : INCR + EXPIRE)
 * et indique si l'opération est autorisée.
 *
 * Toutes les instances de l'application partageant le même Redis voient
 * exactement le même compteur, et celui-ci survit aux redémarrages d'instances.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const client = getRedisClient();

  if (client) {
    try {
      const fullKey = prefixed(key);
      const res = (await client.eval(
        RATE_LIMIT_LUA,
        [fullKey],
        [String(windowSeconds)],
      )) as unknown;
      const pair = Array.isArray(res) ? res : [res, -1];
      const count = Number(pair[0] ?? 0);
      const ttl = Number(pair[1] ?? -1);
      return {
        allowed: count <= limit,
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: ttl >= 0 ? ttl : windowSeconds,
        backend: "redis",
      };
    } catch (error) {
      // Échec ouvert : on journalise et on repasse en mémoire locale le temps
      // de l'incident Redis (le lockout par compte en PostgreSQL reste actif).
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Redis indisponible, bascule mémoire locale: ${message}`);
      return memoryLimit(key, limit, windowSeconds, message);
    }
  }

  // Redis non configuré (développement / mono-instance) : compteur mémoire.
  return memoryLimit(key, limit, windowSeconds);
}

/**
 * Lecture SANS incrément de l'état d'un compteur (pour bloquer tôt sans
 * consommer de tentatives). Retourne count = 0 si la clé n'existe pas ou
 * si Redis est indisponible (échec ouvert).
 */
export async function getRateLimitStatus(
  key: string,
): Promise<{ count: number; resetSeconds: number; backend: "redis" | "memory" }> {
  const client = getRedisClient();
  if (client) {
    try {
      const fullKey = prefixed(key);
      const [value, ttl] = (await Promise.all([
        client.get(fullKey),
        client.ttl(fullKey),
      ])) as [string | number | null, number];
      const count = value === null ? 0 : Number(value) || 0;
      return {
        count,
        resetSeconds: typeof ttl === "number" && ttl >= 0 ? ttl : 0,
        backend: "redis",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Redis indisponible (status), échec ouvert: ${message}`);
      return { ...memoryStatus(key), backend: "memory" };
    }
  }
  return { ...memoryStatus(key), backend: "memory" };
}

/**
 * Remet à zéro le compteur partagé (appelé après une connexion réussie pour
 * ne pas pénaliser les utilisateurs légitimes). Sans effet si Redis échoue.
 */
export async function resetRateLimit(key: string): Promise<void> {
  const client = getRedisClient();
  const fullKey = prefixed(key);
  if (client) {
    try {
      await client.del(fullKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Impossible de réinitialiser ${key}: ${message}`);
    }
  }
  memoryStore.delete(fullKey);
}

// ─── Extraction de l'adresse IP cliente ───────────────────────────────────────

/**
 * Extrait l'adresse IP cliente depuis les en-têtes HTTP, quel que soit le
 * format (Headers fetch ou Record NextAuth). Derrière un proxy/CDN (Vercel),
 * x-forwarded-for contient la chaîne "client, proxy1, proxy2" : on prend le
 * premier maillon.
 */
export function getClientIp(headers: unknown): string {
  const get = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const value = record[name] ?? record[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };
  const xff = get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return get("x-real-ip") || "unknown";
}
