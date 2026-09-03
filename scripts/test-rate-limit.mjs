/**
 * test-rate-limit.mjs — Tests d'intégration du rate limiting distribué.
 *
 * Vérifie les critères d'acceptation :
 *   1. Toutes les instances partagent EXACTEMENT le même compteur (Redis).
 *   2. Le compteur reste actif après redémarrage d'une instance.
 *   3. Fenêtre fixe : le compteur se réinitialise après expiration (INCR + EXPIRE).
 *   4. Reset après succès (DEL) + lecture d'état sans incrément.
 *   5. Fallback mémoire sans Redis (développement) : par instance, non partagé.
 *   6. Échec ouvert si Redis est injoignable (disponibilité du login préservée).
 *
 * Architecture : le mock Upstash REST tourne dans CE processus (le "Redis"
 * partagé) ; chaque "instance" de l'application est un processus worker
 * indépendant lancé via spawn — sa mémoire part à zéro à chaque lancement.
 *
 * Exécution : node scripts/test-rate-limit.mjs
 */

import { spawn } from "node:child_process";
import { createMockUpstash } from "./mock-upstash-redis.mjs";

const WORKER_PATH = new URL("./test-rate-limit-worker.mjs", import.meta.url).pathname;
const TOKEN = "test-token-123";

let passed = 0;
let failed = 0;

function check(name, condition, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${details ? `— ${details}` : ""}`);
  }
}

/** Lance une "instance" (processus indépendant) et retourne ses lignes JSON. */
function runInstance(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER_PATH, ...args], {
      env: { ...process.env, UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: TOKEN, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`worker exit=${code}\n${err}`));
        return;
      }
      resolve(
        out
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      );
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Démarrage du "Redis" partagé ─────────────────────────────────────────────
const mock = createMockUpstash({ token: TOKEN });
const { url } = await mock.listen();
console.log(`Mock Upstash REST : ${url}\n`);

try {
  // ── T1 : partage du compteur entre instances simultanées ──
  console.log("T1 — Toutes les instances partagent le même compteur (login:email)");
  const t1a = await runInstance({}, ["--key=login:email:shared@exemple.com", "--limit=5", "--window=900", "--ops=3"]);
  check("Instance A : 3 tentatives comptées 1,2,3 et autorisées",
    t1a.length === 3 && t1a.every((r) => r.allowed && r.backend === "redis") && t1a.map((r) => r.count).join(",") === "1,2,3",
    JSON.stringify(t1a));
  const t1b = await runInstance({}, ["--key=login:email:shared@exemple.com", "--limit=5", "--window=900", "--ops=2"]);
  check("Instance B : reprend le compteur à 4,5 (partagé, pas reparti à 1)",
    t1b.map((r) => r.count).join(",") === "4,5" && t1b.every((r) => r.allowed),
    JSON.stringify(t1b));
  const t1c = await runInstance({}, ["--key=login:email:shared@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("6e tentative (toutes instances confondues) bloquée : 5/15 min respecté",
    t1c[0].count === 6 && t1c[0].allowed === false,
    JSON.stringify(t1c));

  // ── T2 : le compteur survit au redémarrage d'une instance ──
  console.log("\nT2 — Persistance après redémarrage d'une instance");
  const t2 = await runInstance({}, ["--key=login:email:shared@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("Nouvelle instance (mémoire vide) : compteur toujours actif (7) et blocage maintenu",
    t2[0].count === 7 && t2[0].allowed === false && t2[0].backend === "redis",
    JSON.stringify(t2));

  // ── T3 : reset du compteur après connexion réussie ──
  console.log("\nT3 — Réinitialisation après connexion réussie (DEL)");
  await runInstance({}, ["--mode=reset", "--key=login:email:shared@exemple.com"]);
  const t3 = await runInstance({}, ["--key=login:email:shared@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("Après reset : compteur reparti à 1, tentative autorisée",
    t3[0].count === 1 && t3[0].allowed === true,
    JSON.stringify(t3));
  const t3s = await runInstance({}, ["--mode=status", "--key=login:email:shared@exemple.com"]);
  check("Lecture d'état SANS incrément (count inchangé = 1)",
    t3s[0].count === 1,
    JSON.stringify(t3s));

  // ── T4 : fenêtre fixe — expiration et réinitialisation (INCR + EXPIRE) ──
  console.log("\nT4 — Fenêtre de temps : réinitialisation après expiration (2 s)");
  const t4a = await runInstance({}, ["--key=login:email:feneitre@exemple.com", "--limit=2", "--window=2", "--ops=2"]);
  check("2 tentatives autorisées dans la fenêtre, resetSeconds ≈ fenêtre",
    t4a.every((r) => r.allowed) && t4a[0].resetSeconds > 0 && t4a[0].resetSeconds <= 2,
    JSON.stringify(t4a));
  await sleep(2300);
  const t4b = await runInstance({}, ["--key=login:email:feneitre@exemple.com", "--limit=2", "--window=2", "--ops=1"]);
  check("Après expiration de la fenêtre : compteur reparti à 1, autorisé",
    t4b[0].count === 1 && t4b[0].allowed === true,
    JSON.stringify(t4b));

  // ── T5 : clé IP partagée (brute-force distribué multi-comptes) ──
  console.log("\nT5 — Compteur par IP partagé entre instances (login:ip)");
  const t5a = await runInstance({}, ["--key=login:ip:192.0.2.10", "--limit=3", "--window=900", "--ops=2"]);
  const t5b = await runInstance({}, ["--key=login:ip:192.0.2.10", "--limit=3", "--window=900", "--ops=2"]);
  check("Instance A : 2 tentatives (1,2) ; Instance B : 3e autorisée, 4e bloquée",
    t5a.map((r) => r.count).join(",") === "1,2" &&
      t5b.map((r) => r.count).join(",") === "3,4" &&
      t5b[0].allowed === true && t5b[1].allowed === false,
    `A=${JSON.stringify(t5a)} B=${JSON.stringify(t5b)}`);

  // ── T6 : fallback mémoire sans Redis (développement mono-instance) ──
  console.log("\nT6 — Fallback mémoire sans Redis (par instance, non partagé)");
  const t6a = await runInstance({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" }, [
    "--no-redis=1", "--key=login:email:mem@exemple.com", "--limit=2", "--window=900", "--ops=2",
  ]);
  check("Sans Redis : instance 1 compte localement (backend=memory)",
    t6a.every((r) => r.backend === "memory" && r.allowed) && t6a.map((r) => r.count).join(",") === "1,2",
    JSON.stringify(t6a));
  const t6b = await runInstance({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" }, [
    "--no-redis=1", "--key=login:email:mem@exemple.com", "--limit=2", "--window=900", "--ops=1",
  ]);
  check("Sans Redis : instance 2 démarre son PROPRE compteur (preuve que Redis est indispensable en multi-instances)",
    t6b[0].backend === "memory" && t6b[0].count === 1 && t6b[0].allowed === true,
    JSON.stringify(t6b));

  // ── T7 : Redis injoignable → échec ouvert (disponibilité préservée) ──
  console.log("\nT7 — Redis injoignable (mauvais token) : échec ouvert + log");
  const t7 = await runInstance({ UPSTASH_REDIS_REST_TOKEN: "mauvais-token" }, [
    "--key=login:email:fail@exemple.com", "--limit=5", "--window=900", "--ops=1",
  ]);
  check("La requête passe (fail-open), bascule mémoire, erreur Redis exposée",
    t7[0].allowed === true && t7[0].backend === "memory" && typeof t7[0].redisError === "string" && t7[0].redisError.length > 0,
    JSON.stringify(t7));
} finally {
  await mock.close();
}

console.log(`\n════════════════════════════════════════`);
console.log(`Résultat : ${passed} vérification(s) OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
