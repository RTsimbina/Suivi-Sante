/**
 * test-rate-limit-worker.mjs — Worker représentant UNE "instance" serverless.
 *
 * Chaque invocation est un processus Node indépendant (mémoire vide) qui
 * charge le vrai module src/lib/rate-limit.ts et exécute N opérations contre
 * le stockage partagé désigné par les variables d'environnement.
 * Sortie : une ligne JSON par opération sur stdout.
 *
 * Options :
 *   --mode=check|status|reset   (défaut : check)
 *   --key=login:email:test@exemple.com
 *   --limit=5 --window=900 --ops=1
 *   --no-redis=1                (supprime UPSTASH_* : teste le fallback mémoire)
 */

const argv = process.argv.slice(2);
/** Lit --nom=valeur ou --nom valeur, sinon fallback. */
const arg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const withEq = argv.find((a) => a.startsWith(prefix));
  if (withEq !== undefined) return withEq.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const mode = arg("mode", "check");
const key = arg("key", "");
const limit = Number(arg("limit", "5"));
const windowSeconds = Number(arg("window", "900"));
const ops = Number(arg("ops", "1"));

if (arg("no-redis", "0") === "1") {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

const rateLimit = await import(
  new URL("../src/lib/rate-limit.ts", import.meta.url).href
);

for (let i = 1; i <= ops; i++) {
  if (mode === "check") {
    const r = await rateLimit.checkRateLimit({ key, limit, windowSeconds });
    console.log(
      JSON.stringify({
        i,
        allowed: r.allowed,
        count: r.count,
        remaining: r.remaining,
        resetSeconds: r.resetSeconds,
        backend: r.backend,
        redisError: r.redisError ?? null,
      }),
    );
  } else if (mode === "status") {
    const s = await rateLimit.getRateLimitStatus(key);
    console.log(JSON.stringify({ i, mode: "status", count: s.count, resetSeconds: s.resetSeconds, backend: s.backend }));
  }
}

if (mode === "reset") {
  await rateLimit.resetRateLimit(key);
  console.log(JSON.stringify({ mode: "reset", ok: true }));
}

process.exit(0);
