/**
 * rate-limit.ts — Limiteur de débit à fenêtre fixe avec stockage partagé.
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
 * STOCKAGES PARTAGÉS SUPPORTÉS (sélection automatique ou RATE_LIMIT_BACKEND)
 * ──────────────────────────────────────────────────────────────────────────
 *   1. Redis (Upstash REST) — si UPSTASH_REDIS_REST_URL/TOKEN sont définis.
 *      Opération ATOMIQUE : script Lua EVAL unique INCR + EXPIRE (l'expiration
 *      n'est posée qu'au premier incrément de la fenêtre). Latence minimale.
 *   2. PostgreSQL (Neon, Vercel Postgres, Supabase…) — si DATABASE_URL est
 *      défini (c'est le cas en production : ZÉRO infrastructure additionnelle).
 *      Opération ATOMIQUE : un seul INSERT … ON CONFLICT ("key") DO UPDATE
 *      réinitialise le compteur si la fenêtre a expiré, sinon il incrémente —
 *      les upserts concurrents sur la même clé sont sérialisés par le verrou
 *      de ligne Postgres (aucun incrément perdu). La table est créée
 *      automatiquement au premier appel (et déclarée dans schema.prisma).
 *   3. Mémoire locale — dernier recours (développement mono-instance).
 *
 *   Ordre "auto" : Redis → Postgres → mémoire. Forçable via
 *   RATE_LIMIT_BACKEND=redis|postgres|memory.
 *
 * Clés utilisées dans l'application :
 *       login:ip:<adresse-ip>        → tentatives de connexion par IP
 *       login:email:<email>          → tentatives échouées par compte
 *       webhook:ip:<adresse-ip>      → requêtes webhook entrantes par IP
 *   Un préfixe global optionnel (RATE_LIMIT_KEY_PREFIX) permet de partager
 *   le même backend entre plusieurs applications sans collision de clés.
 *
 * DÉGRADATION GRACIEUSE
 * ─────────────────────
 *   - Backend injoignable en pleine production (Redis OU Postgres) → échec
 *     OUVERT (la requête passe) + log d'erreur + compteur mémoire local le
 *     temps de l'incident : la disponibilité du login prime, et le
 *     verrouillage par compte en PostgreSQL (auth.ts) reste actif.
 */

import { Redis } from "@upstash/redis";
import { db } from "./db";

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
  backend: RateLimitBackend;
  /** Message d'erreur présent si Redis a échoué (échec ouvert) */
  redisError?: string;
  /** Message d'erreur présent si Postgres a échoué (échec ouvert) */
  dbError?: string;
}

export type RateLimitBackend = "redis" | "postgres" | "memory";

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

// ─── Backend PostgreSQL / Neon (stockage partagé sans infrastructure en plus) ─

interface PgCounterRow {
  count: number;
  resetSeconds: number;
}

let pgTableReady = false;
let pgOps = 0;

/**
 * Crée la table des compteurs au premier appel de chaque processus (idempotent).
 * La table est aussi déclarée dans schema.prisma : `prisma db push` la crée au
 * déploiement ; cette création dynamique garantit que le limiteur fonctionne
 * même si la migration n'a pas encore été appliquée (même philosophie que le
 * verrouillage par compte dans auth.ts).
 */
async function ensurePgTable(): Promise<void> {
  if (pgTableReady) return;
  try {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
        "key" TEXT PRIMARY KEY,
        "count" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMPTZ(3) NOT NULL
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "RateLimitCounter_expiresAt_idx"
      ON "RateLimitCounter"("expiresAt")
    `;
    pgTableReady = true;
  } catch (error) {
    // Course possible entre instances sur CREATE TABLE IF NOT EXISTS (une seule
    // gagne l'insertion dans pg_class) : si la table existe désormais, tout va bien.
    const probe = await db
      .$queryRaw`SELECT 1 FROM "RateLimitCounter" LIMIT 1`
      .catch(() => null);
    if (probe !== null) {
      pgTableReady = true;
      return;
    }
    throw error;
  }
}

/** Purge périodique des fenêtres expirées (la table reste minuscule). */
async function pgCleanup(): Promise<void> {
  pgOps++;
  if (pgOps % 200 !== 0) return;
  await db
    .$executeRaw`DELETE FROM "RateLimitCounter" WHERE "expiresAt" <= now()`
    .catch(() => {});
}

/**
 * INCR + EXPIRE Postgres, ATOMIQUE : un seul INSERT … ON CONFLICT DO UPDATE.
 * - clé absente (ou fenêtre expirée) → compteur repart à 1, expiration posée ;
 * - clé vivante → incrément simple, expiration inchangée (fenêtre FIXE, comme
 *   le script Lua Redis) ;
 * - les accès concurrents sur la même clé sont sérialisés par le verrou de
 *   ligne : le compteur est exact, même avec plusieurs instances simultanées.
 * RETURNING renvoie le compteur et les secondes restantes en un seul aller-retour.
 */
async function pgLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  await ensurePgTable();
  const rows = await db.$queryRaw<PgCounterRow[]>`
    INSERT INTO "RateLimitCounter" ("key", "count", "expiresAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitCounter"."expiresAt" <= now()
                 THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitCounter"."expiresAt" <= now()
                    THEN now() + make_interval(secs => ${windowSeconds}::double precision)
                    ELSE "RateLimitCounter"."expiresAt" END
    RETURNING
      "count",
      CEILING(EXTRACT(EPOCH FROM ("expiresAt" - now())))::int AS "resetSeconds"
  `;
  await pgCleanup();
  const row = rows[0];
  const count = Number(row?.count ?? 1);
  // ⚠️ La colonne TIMESTAMPTZ(3) arrondit expiresAt à la milliseconde : cet
  // arrondi peut dépasser la fenêtre de ~1 ms et CEILING renvoyer alors
  // windowSeconds + 1. On borne resetSeconds par la fenêtre configurée
  // (contrat de l'API : la fenêtre ne peut pas durer plus longtemps qu'elle).
  const resetSeconds = Math.min(
    windowSeconds,
    Math.max(0, Number(row?.resetSeconds ?? windowSeconds)),
  );
  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetSeconds,
    backend: "postgres",
  };
}

/** Lecture SANS incrément de l'état d'un compteur (Postgres). */
async function pgStatus(key: string): Promise<{ count: number; resetSeconds: number }> {
  await ensurePgTable();
  const rows = await db.$queryRaw<PgCounterRow[]>`
    SELECT "count",
           CEILING(EXTRACT(EPOCH FROM ("expiresAt" - now())))::int AS "resetSeconds"
    FROM "RateLimitCounter"
    WHERE "key" = ${key} AND "expiresAt" > now()
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? { count: Number(row.count), resetSeconds: Math.max(0, Number(row.resetSeconds)) }
    : { count: 0, resetSeconds: 0 };
}

// ─── Sélection du backend ────────────────────────────────────────────────────

/**
 * Backend de stockage effectif :
 *   - RATE_LIMIT_BACKEND forcé (redis | postgres | memory) si défini ;
 *   - sinon "auto" : Redis si configuré, sinon Postgres si DATABASE_URL,
 *     sinon mémoire (développement sans base).
 */
function resolveBackend(): RateLimitBackend {
  const configured = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();
  if (configured === "redis" || configured === "postgres" || configured === "memory") {
    return configured;
  }
  if (getRedisClient() !== null) return "redis";
  if (process.env.DATABASE_URL?.trim()) return "postgres";
  return "memory";
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
  errorMeta?: { redisError?: string; dbError?: string },
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
    ...(errorMeta?.redisError ? { redisError: errorMeta.redisError } : {}),
    ...(errorMeta?.dbError ? { dbError: errorMeta.dbError } : {}),
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
 * Incrémente le compteur partagé de façon ATOMIQUE et indique si l'opération
 * est autorisée.
 *
 * Toutes les instances de l'application partageant le même backend (Redis ou
 * Postgres/Neon) voient exactement le même compteur, et celui-ci survit aux
 * redémarrages d'instances.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const backend = resolveBackend();

  if (backend === "redis") {
    try {
      const fullKey = prefixed(key);
      const client = getRedisClient()!;
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
      return memoryLimit(key, limit, windowSeconds, { redisError: message });
    }
  }

  if (backend === "postgres") {
    try {
      return await pgLimit(key, limit, windowSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Postgres indisponible, bascule mémoire locale: ${message}`);
      return memoryLimit(key, limit, windowSeconds, { dbError: message });
    }
  }

  // Pas de stockage partagé configuré (développement) : compteur mémoire.
  return memoryLimit(key, limit, windowSeconds);
}

/**
 * Lecture SANS incrément de l'état d'un compteur (pour bloquer tôt sans
 * consommer de tentatives). Retourne count = 0 si la clé n'existe pas ou
 * si Redis est indisponible (échec ouvert).
 */
export async function getRateLimitStatus(
  key: string,
): Promise<{ count: number; resetSeconds: number; backend: RateLimitBackend }> {
  const backend = resolveBackend();

  if (backend === "redis") {
    try {
      const client = getRedisClient()!;
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

  if (backend === "postgres") {
    try {
      return { ...(await pgStatus(key)), backend: "postgres" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Postgres indisponible (status), échec ouvert: ${message}`);
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
  const fullKey = prefixed(key);
  const backend = resolveBackend();

  if (backend === "redis") {
    try {
      await getRedisClient()!.del(fullKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[rate-limit] Impossible de réinitialiser ${key}: ${message}`);
    }
  } else if (backend === "postgres") {
    try {
      await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" = ${fullKey}`;
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
