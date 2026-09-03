/**
 * test-login-policy-worker.mjs — Worker représentant UNE "instance" serverless
 * pour les tests de la POLITIQUE de limitation de connexion.
 *
 * Chaque invocation est un processus Node indépendant (mémoire vide) qui
 * charge le VRAI module src/lib/login-policy.ts (et src/lib/rate-limit.ts)
 * et exécute des tentatives de connexion contre le stockage partagé désigné
 * par l'environnement. Sortie : une ligne JSON par opération sur stdout,
 * préfixée ##RL## (filtrage des logs parasites type prisma:error).
 *
 * Modes :
 *   --mode=attempt   (défaut) N tentatives RÉALISTES : evaluateLoginAttempt(),
 *                    puis recordFailedLogin() si autorisée (échec simulé).
 *   --mode=evaluate  N évaluations pures (aucun enregistrement d'échec).
 *   --mode=success   resetLoginCounters() — connexion réussie.
 *   --mode=status    lecture SANS incrément d'une clé EXACTE (--key=...) :
 *                    prouve que la clé stockée correspond au format de la
 *                    politique (ex. "login:192.0.2.7:user@exemple.com").
 *
 * Seuils de la politique (--mode=attempt/evaluate) : lus UNE FOIS au
 * démarrage du processus depuis l'environnement (LOGIN_EMAIL_LIMIT,
 * LOGIN_IP_LIMIT, LOGIN_PAIR_LIMIT, LOGIN_GLOBAL_LIMIT, *_WINDOW_SECONDS),
 * comme en production — l'orchestrateur fixe des seuils réduits par test.
 *
 * Options : --ip=1.2.3.4 --email=user@exemple.com --key=login:... --ops=1
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

const mode = arg("mode", "attempt");
const ip = arg("ip", "0.0.0.0");
const email = arg("email", "");
const key = arg("key", "");
const ops = Number(arg("ops", "1"));

if (arg("no-redis", "0") === "1") {
  // Simule un environnement SANS stockage partagé (fallback mémoire local).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.DATABASE_URL;
  delete process.env.RATE_LIMIT_BACKEND;
}

const TAG = "##RL##";

// Le VRAI module de politique (qui charge lui-même rate-limit.ts → db Prisma).
const policy = await import(
  new URL("../src/lib/login-policy.ts", import.meta.url).href
);

for (let i = 1; i <= ops; i++) {
  if (mode === "attempt" || mode === "evaluate") {
    const ev = await policy.evaluateLoginAttempt(ip, email);
    let failed = false;
    if (mode === "attempt" && ev.allowed) {
      // Tentative autorisée → simulation d'un ÉCHEC d'authentification :
      // les compteurs compte + couple doivent s'incrémenter ici uniquement.
      await policy.recordFailedLogin(ip, email);
      failed = true;
    }
    console.log(
      TAG +
      JSON.stringify({
        i,
        allowed: ev.allowed,
        reason: ev.reason ?? null,
        count: ev.count ?? null,
        resetSeconds: ev.resetSeconds ?? null,
        failed,
      }),
    );
  }
}

if (mode === "success") {
  await policy.resetLoginCounters(ip, email);
  console.log(TAG + JSON.stringify({ mode: "success", ok: true }));
}

if (mode === "status") {
  // Lecture brute d'une clé EXACTE via rate-limit.ts : vérifie le format
  // réel des clés posées par la politique.
  const rateLimit = await import(
    new URL("../src/lib/rate-limit.ts", import.meta.url).href
  );
  const s = await rateLimit.getRateLimitStatus(key);
  console.log(
    TAG +
    JSON.stringify({
      mode: "status",
      key,
      count: s.count,
      resetSeconds: s.resetSeconds,
      backend: s.backend,
    }),
  );
}

process.exit(0);
