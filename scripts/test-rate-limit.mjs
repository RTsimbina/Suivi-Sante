/**
 * test-rate-limit.mjs — Tests d'intégration du rate limiting distribué.
 *
 * Vérifie les critères d'acceptation sur les DEUX backends partagés :
 *
 *   REDIS (Upstash REST simulé)                     → T1 à T7
 *   POSTGRESQL / NEON (Postgres réel embarqué)      → T8 à T12
 *
 * Critères couverts :
 *   1. Toutes les instances partagent EXACTEMENT le même compteur.
 *   2. Le compteur reste actif après redémarrage d'une instance.
 *   3. Fenêtre fixe atomique (Redis : EVAL INCR+EXPIRE ; Postgres :
 *      INSERT … ON CONFLICT DO UPDATE) — y compris sous charge PARALLÈLE.
 *   4. Reset après succès (DEL/DELETE) + lecture d'état sans incrément.
 *   5. Fallback mémoire sans stockage partagé (développement).
 *   6. Échec ouvert si le backend est injoignable (disponibilité préservée).
 *
 * Architecture : chaque "instance" de l'application est un processus Node
 * indépendant (mémoire vide) lancé via `node --import tsx` ; le stockage
 * partagé vit ailleurs (mock Upstash REST dans ce processus, cluster Postgres
 * embarqué dans ce processus) — comme un vrai Redis/Neon en production.
 *
 * Exécution : node scripts/test-rate-limit.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

/**
 * Lance une "instance" (processus indépendant) et retourne ses lignes JSON.
 * `--import tsx` permet au worker de charger src/lib/rate-limit.ts et sa
 * dépendance ./db (Prisma) avec résolution TypeScript.
 */
function runInstance(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", WORKER_PATH, ...args], {
      env,
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
          .filter((line) => line.startsWith("##RL##"))
          .map((line) => JSON.parse(line.slice("##RL##".length))),
      );
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Backend 1 : REDIS (mock Upstash REST) ───────────────────────────────────
const mock = createMockUpstash({ token: TOKEN });
const { url: mockUrl } = await mock.listen();
console.log(`Mock Upstash REST : ${mockUrl}\n`);

const REDIS_ENV = {
  ...process.env,
  UPSTASH_REDIS_REST_URL: mockUrl,
  UPSTASH_REDIS_REST_TOKEN: TOKEN,
  RATE_LIMIT_BACKEND: "redis",
};

try {
  // ── T1 : partage du compteur entre instances simultanées ──
  console.log("T1 — Toutes les instances partagent le même compteur (login:email)");
  const t1a = await runInstance(REDIS_ENV, ["--key=login:email:partage@exemple.com", "--limit=5", "--window=900", "--ops=3"]);
  check("Instance A : 3 tentatives comptées 1,2,3 et autorisées",
    t1a.length === 3 && t1a.every((r) => r.allowed && r.backend === "redis") && t1a.map((r) => r.count).join(",") === "1,2,3",
    JSON.stringify(t1a));
  const t1b = await runInstance(REDIS_ENV, ["--key=login:email:partage@exemple.com", "--limit=5", "--window=900", "--ops=2"]);
  check("Instance B : reprend le compteur à 4,5 (partagé, pas reparti à 1)",
    t1b.map((r) => r.count).join(",") === "4,5" && t1b.every((r) => r.allowed),
    JSON.stringify(t1b));
  const t1c = await runInstance(REDIS_ENV, ["--key=login:email:partage@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("6e tentative (toutes instances confondues) bloquée : 5/15 min respecté",
    t1c[0].count === 6 && t1c[0].allowed === false,
    JSON.stringify(t1c));

  // ── T2 : le compteur survit au redémarrage d'une instance ──
  console.log("\nT2 — Persistance après redémarrage d'une instance");
  const t2 = await runInstance(REDIS_ENV, ["--key=login:email:partage@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("Nouvelle instance (mémoire vide) : compteur toujours actif (7) et blocage maintenu",
    t2[0].count === 7 && t2[0].allowed === false && t2[0].backend === "redis",
    JSON.stringify(t2));

  // ── T3 : reset du compteur après connexion réussie ──
  console.log("\nT3 — Réinitialisation après connexion réussie (DEL)");
  await runInstance(REDIS_ENV, ["--mode=reset", "--key=login:email:partage@exemple.com"]);
  const t3 = await runInstance(REDIS_ENV, ["--key=login:email:partage@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
  check("Après reset : compteur reparti à 1, tentative autorisée",
    t3[0].count === 1 && t3[0].allowed === true,
    JSON.stringify(t3));
  const t3s = await runInstance(REDIS_ENV, ["--mode=status", "--key=login:email:partage@exemple.com"]);
  check("Lecture d'état SANS incrément (count inchangé = 1)",
    t3s[0].count === 1,
    JSON.stringify(t3s));

  // ── T4 : fenêtre fixe — expiration et réinitialisation (INCR + EXPIRE) ──
  console.log("\nT4 — Fenêtre de temps : réinitialisation après expiration (2 s)");
  const t4a = await runInstance(REDIS_ENV, ["--key=login:email:feneitre@exemple.com", "--limit=2", "--window=2", "--ops=2"]);
  check("2 tentatives autorisées dans la fenêtre, resetSeconds ≈ fenêtre",
    t4a.every((r) => r.allowed) && t4a[0].resetSeconds > 0 && t4a[0].resetSeconds <= 2,
    JSON.stringify(t4a));
  await sleep(2300);
  const t4b = await runInstance(REDIS_ENV, ["--key=login:email:feneitre@exemple.com", "--limit=2", "--window=2", "--ops=1"]);
  check("Après expiration de la fenêtre : compteur reparti à 1, autorisé",
    t4b[0].count === 1 && t4b[0].allowed === true,
    JSON.stringify(t4b));

  // ── T5 : clé IP partagée (brute-force distribué multi-comptes) ──
  console.log("\nT5 — Compteur par IP partagé entre instances (login:ip)");
  const t5a = await runInstance(REDIS_ENV, ["--key=login:ip:192.0.2.10", "--limit=3", "--window=900", "--ops=2"]);
  const t5b = await runInstance(REDIS_ENV, ["--key=login:ip:192.0.2.10", "--limit=3", "--window=900", "--ops=2"]);
  check("Instance A : 2 tentatives (1,2) ; Instance B : 3e autorisée, 4e bloquée",
    t5a.map((r) => r.count).join(",") === "1,2" &&
      t5b.map((r) => r.count).join(",") === "3,4" &&
      t5b[0].allowed === true && t5b[1].allowed === false,
    `A=${JSON.stringify(t5a)} B=${JSON.stringify(t5b)}`);

  // ── T6 : fallback mémoire sans stockage partagé (développement) ──
  console.log("\nT6 — Fallback mémoire sans Redis ni Postgres (par instance, non partagé)");
  const MEM_ENV = { ...process.env, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" };
  const t6a = await runInstance(MEM_ENV, ["--no-redis=1", "--key=login:email:mem@exemple.com", "--limit=2", "--window=900", "--ops=2"]);
  check("Sans backend partagé : instance 1 compte localement (backend=memory)",
    t6a.every((r) => r.backend === "memory" && r.allowed) && t6a.map((r) => r.count).join(",") === "1,2",
    JSON.stringify(t6a));
  const t6b = await runInstance(MEM_ENV, ["--no-redis=1", "--key=login:email:mem@exemple.com", "--limit=2", "--window=900", "--ops=1"]);
  check("Sans backend partagé : instance 2 démarre son PROPRE compteur (preuve qu'un backend partagé est indispensable en multi-instances)",
    t6b[0].backend === "memory" && t6b[0].count === 1 && t6b[0].allowed === true,
    JSON.stringify(t6b));

  // ── T7 : Redis injoignable → échec ouvert (disponibilité préservée) ──
  console.log("\nT7 — Redis injoignable (mauvais token) : échec ouvert + log");
  const t7 = await runInstance({ ...REDIS_ENV, UPSTASH_REDIS_REST_TOKEN: "mauvais-token" }, [
    "--key=login:email:echec@exemple.com", "--limit=5", "--window=900", "--ops=1",
  ]);
  check("La requête passe (fail-open), bascule mémoire, erreur Redis exposée",
    t7[0].allowed === true && t7[0].backend === "memory" && typeof t7[0].redisError === "string" && t7[0].redisError.length > 0,
    JSON.stringify(t7));
} finally {
  await mock.close();
}

// ─── Backend 2 : POSTGRESQL / NEON (cluster Postgres réel embarqué) ──────────
console.log("\n────────────────────────────────────────────");
let pgCluster = null;
let pgDir = null;

try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-ratelimit-"));
  pgCluster = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "password",
    port: 54329,
    persistent: false,
  });
  await pgCluster.initialise();
  await pgCluster.start();
  await pgCluster.createDatabase("ratelimit_test");
  console.log("Postgres embarqué : postgresql://127.0.0.1:54329/ratelimit_test\n");
} catch (error) {
  console.log(`Postgres embarqué indisponible (${error.message.slice(0, 80)}…) : tests live ignorés\n`);
  pgCluster = null;
}

const PG_URL = "postgresql://postgres:password@127.0.0.1:54329/ratelimit_test";
const PG_ENV = {
  ...process.env,
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  DATABASE_URL: PG_URL,
  // RATE_LIMIT_BACKEND absent → sélection AUTO : Postgres (Neon) via DATABASE_URL
};

try {
  if (pgCluster) {
    // ── T8 : sélection automatique du backend ──
    console.log("T8 — Sélection automatique : DATABASE_URL seul → backend Postgres");
    const t8 = await runInstance(PG_ENV, ["--key=login:email:pg@exemple.com", "--limit=5", "--window=900", "--ops=1"]);
    check("backend=postgres sans aucune config Redis (zéro infrastructure en plus)",
      t8[0].backend === "postgres" && t8[0].count === 1 && t8[0].allowed === true,
      JSON.stringify(t8));

    // ── T9 : partage + ATOMICITÉ sous charge parallèle ──
    console.log("\nT9 — Atomicité : 5 instances simultanées sur la MÊME clé (verbatim SQL ON CONFLICT)");
    const t9results = await Promise.all(
      Array.from({ length: 5 }, () =>
        runInstance(PG_ENV, ["--key=login:email:parallele@exemple.com", "--limit=100", "--window=900", "--ops=1"]),
      ),
    );
    const t9counts = t9results.map((r) => r[0].count).sort((a, b) => a - b).join(",");
    check("5 incréments concurrents → compteurs 1,2,3,4,5 (aucun perdu, aucun doublon)",
      t9counts === "1,2,3,4,5" && t9results.every((r) => r[0].backend === "postgres" && r[0].allowed),
      `${JSON.stringify(t9results)} (attendu 1,2,3,4,5, obtenu ${t9counts})`);
    const t9b = await runInstance(PG_ENV, ["--key=login:email:parallele@exemple.com", "--limit=100", "--window=900", "--ops=1"]);
    check("Le compteur continue exactement à 6 après la salve parallèle",
      t9b[0].count === 6, JSON.stringify(t9b));

    // ── T10 : fenêtre fixe ( expiration → reset) ──
    console.log("\nT10 — Fenêtre de temps Postgres : réinitialisation après expiration (2 s)");
    const t10a = await runInstance(PG_ENV, ["--key=login:email:pgfeneitre@exemple.com", "--limit=2", "--window=2", "--ops=2"]);
    check("2 tentatives autorisées, resetSeconds ≈ fenêtre",
      t10a.every((r) => r.allowed) && t10a[0].resetSeconds > 0 && t10a[0].resetSeconds <= 2,
      JSON.stringify(t10a));
    await sleep(2300);
    const t10b = await runInstance(PG_ENV, ["--key=login:email:pgfeneitre@exemple.com", "--limit=2", "--window=2", "--ops=1"]);
    check("Après expiration : compteur reparti à 1 (EXPIRE équivalent), autorisé",
      t10b[0].count === 1 && t10b[0].allowed === true,
      JSON.stringify(t10b));

    // ── T11 : reset + status ──
    console.log("\nT11 — Réinitialisation (DELETE) et lecture d'état Postgres");
    await runInstance(PG_ENV, ["--mode=reset", "--key=login:email:pg@exemple.com"]);
    const t11 = await runInstance(PG_ENV, ["--mode=status", "--key=login:email:pg@exemple.com"]);
    check("Après DELETE : compteur inexistant (count=0), backend postgres",
      t11[0].count === 0 && t11[0].backend === "postgres",
      JSON.stringify(t11));
  } else {
    console.log("T8-T11 ignorés (Postgres embarqué indisponible dans cet environnement).");
  }

  // ── T12 : Postgres injoignable → échec ouvert (testable sans serveur) ──
  console.log("\nT12 — Postgres injoignable (port mort) : échec ouvert + log");
  const t12 = await runInstance(
    { ...process.env, UPSTASH_REDIS_REST_URL: "", DATABASE_URL: "postgresql://postgres:password@127.0.0.1:59999/inexistant", RATE_LIMIT_BACKEND: "postgres" },
    ["--key=login:email:echecpg@exemple.com", "--limit=5", "--window=900", "--ops=1"],
  );
  check("La requête passe (fail-open), bascule mémoire, erreur DB exposée",
    t12[0].allowed === true && t12[0].backend === "memory" && typeof t12[0].dbError === "string" && t12[0].dbError.length > 0,
    JSON.stringify(t12));
} finally {
  if (pgCluster) {
    await pgCluster.stop().catch(() => {});
    if (pgDir) fs.rmSync(pgDir, { recursive: true, force: true });
  }
}

console.log(`\n════════════════════════════════════════`);
console.log(`Résultat : ${passed} vérification(s) OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
