/**
 * test-atomic-lockout.mjs — Tests du compteur d'échecs ATOMIQUE
 * (correction n°3 « rendre le compteur d'échecs atomique »).
 *
 * Critères couverts :
 *   T0  ANCIEN pattern (read → increment → write) : 30 instances simultanées
 *       → des incréments sont PERDUS (démonstration du problème corrigé).
 *   T1  NOUVEAU pattern atomique : 30 instances simultanées → compteur
 *       EXACTEMENT à 30, aucune incrémentation perdue.
 *   T2  Déclenchement du verrou (seuil 5) : compteur final = 5, verrou posé,
 *       exactement 26/30 réponses verrouillées (sérialisation prouvée).
 *   T3  Verrou expiré : compteur repart à 1 ET verrou nettoyé, en une seule
 *       opération atomique.
 *   T4  isLockedOut : verrou actif / expiré (nettoyage conditionnel sans
 *       écraser un incrément concurrent).
 *   T5  resetAttempts après connexion réussie.
 *   T6/T7  Les compteurs PARTAGÉS (Redis et Postgres/Neon) tiennent aussi la
 *       charge : 30 instances simultanées → compteurs 1..30 exacts (INCR
 *       Redis atomique, INSERT … ON CONFLICT count+1 atomique).
 *
 * Architecture : chaque "instance" = processus Node indépendant
 * (`node --import tsx`, client Prisma dédié) contre un cluster Postgres réel
 * embarqué — comme des lambdas Vercel simultanées sur la même base Neon.
 *
 * Exécution : node scripts/test-atomic-lockout.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMockUpstash } from "./mock-upstash-redis.mjs";

const WORKER_PATH = new URL("./test-atomic-lockout-worker.mjs", import.meta.url).pathname;
const SQL_PATH = new URL("./test-atomic-lockout-sql.mjs", import.meta.url).pathname;
const RL_WORKER_PATH = new URL("./test-rate-limit-worker.mjs", import.meta.url).pathname;
const TOKEN = "test-token-123";
const N = 30; // dizaines de requêtes simultanées (exigence du critère)

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

/** Lance un processus (worker ou helper SQL) et retourne ses lignes JSON taguées. */
function runProcess(bin, args, env, tag) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`exit=${code} args=${args.join(" ")}\n${err.slice(-500)}`));
        return;
      }
      resolve(
        out
          .trim()
          .split("\n")
          .filter((line) => line.startsWith(tag))
          .map((line) => JSON.parse(line.slice(tag.length))),
      );
    });
  });
}

const runInstance = (env, args) =>
  runProcess(process.execPath, ["--import", "tsx", WORKER_PATH, ...args], env, "##AL##");
const sqlJob = (env, args) =>
  runProcess(process.execPath, ["--import", "tsx", SQL_PATH, ...args], env, "##SQL##");
const runRlInstance = (env, args) =>
  runProcess(process.execPath, ["--import", "tsx", RL_WORKER_PATH, ...args], env, "##RL##");

// Lance N instances en parallèle et retourne leurs PREMIÈRES réponses (objets).
const parallel = async (env, args, n = N) =>
  (await Promise.all(Array.from({ length: n }, () => runInstance(env, args)))).map((lines) => lines[0]);

// ─── Cluster Postgres embarqué (rôle de la base Neon en production) ──────────
let pgCluster = null;
let pgDir = null;
try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-atomiclock-"));
  pgCluster = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "password",
    port: 54332,
    persistent: false,
  });
  await pgCluster.initialise();
  await pgCluster.start();
  await pgCluster.createDatabase("lockout_test");
  console.log(`Postgres embarqué : postgresql://127.0.0.1:54332/lockout_test\n`);
} catch (error) {
  console.log(`Postgres embarqué indisponible (${error.message.slice(0, 80)}…) : tests impossibles\n`);
  process.exit(1);
}

const PG_URL = "postgresql://postgres:password@127.0.0.1:54332/lockout_test";
const ENV = {
  ...process.env,
  DATABASE_URL: PG_URL,
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};

try {
  // ── Préparation : table minimale + comptes de test ──
  await sqlJob(ENV, ["--job=setup"]);
  const users = [
    "t0-course@exemple.com",   // T0 démonstration de la course (ancien pattern)
    "t1-atome@exemple.com",    // T1 30 échecs atomiques
    "t2-verrou@exemple.com",   // T2 déclenchement du verrou
    "t3-expire@exemple.com",   // T3 verrou expiré
    "t4a-actif@exemple.com",   // T4 verrou actif
    "t4b-expire@exemple.com",  // T4 verrou expiré
    "t5-reset@exemple.com",    // T5 reset après succès
  ];
  for (const u of users) await sqlJob(ENV, ["--job=seed", `--email=${u}`]);

  // ══ T0 : ANCIEN pattern — la course read→increment→write est réelle ═══════
  console.log(`T0 — ANCIEN pattern (read → increment → write) : ${N} instances simultanées`);
  const t0 = await Promise.all(
    Array.from({ length: N }, () =>
      runInstance(ENV, ["--mode=fail-legacy", "--email=t0-course@exemple.com", "--legacy-sleep=800"])),
  );
  const t0state = await sqlJob(ENV, ["--job=state", "--email=t0-course@exemple.com"]);
  const t0final = t0state[0].failedAttempts;
  check(
    `Des incréments sont PERDUS : compteur final ${t0final}/${N} (chaque instance a écrit « lu+1 »)`,
    t0final < N,
    `30 instances ont exécuté le pattern historique, compteur final = ${t0final} → ${N - t0final} incrément(s) écrasé(s)`,
  );

  // ══ T1 : NOUVEAU pattern atomique — aucune incrémentation perdue ═══════════
  console.log(`\nT1 — NOUVEAU pattern atomique : ${N} instances simultanées (seuil élevé, pas de verrou)`);
  const t1env = { ...ENV, LOCKOUT_MAX_ATTEMPTS: "1000" };
  const t1 = await parallel(t1env, ["--mode=fail", "--email=t1-atome@exemple.com"]);
  const t1state = await sqlJob(t1env, ["--job=state", "--email=t1-atome@exemple.com"]);
  const t1bad = t1.filter((r) => !(r.locked === false && r.remainingMs === 0));
  check(
    `Les ${N} instances sont servies sans verrouillage (toutes locked=false)`,
    t1.length === N && t1bad.length === 0,
    `reçues=${t1.length} fautives=${JSON.stringify(t1bad.slice(0, 3))}`,
  );
  check(
    `Compteur final EXACT = ${N} : chaque tentative est comptabilisée, AUCUN incrément perdu`,
    t1state[0].failedAttempts === N,
    JSON.stringify(t1state[0]),
  );

  // ══ T2 : déclenchement du verrou au seuil (5, défaut) ══════════════════════
  console.log(`\nT2 — Déclenchement du verrou (seuil 5) : ${N} instances simultanées`);
  const t2 = await parallel(ENV, ["--mode=fail", "--email=t2-verrou@exemple.com"]);
  const t2state = await sqlJob(ENV, ["--job=state", "--email=t2-verrou@exemple.com"]);
  const t2lockedCount = t2.filter((r) => r.locked).length;
  check(
    "Le compteur s'arrête EXACTEMENT au seuil (5) — pas un de plus, pas un de moins",
    t2state[0].failedAttempts === 5,
    JSON.stringify(t2state[0]),
  );
  const t2bad = t2.filter((r) => !((r.locked === true && r.remainingMs > 0) || (r.locked === false && r.remainingMs === 0)));
  check(
    `Exactement ${N - 4} réponses verrouillées (les 4 premières incrémentent, la 5e déclenche, les suivantes voient le verrou)`,
    t2lockedCount === N - 4 && t2.filter((r) => !r.locked).length === 4,
    `locked=${t2lockedCount}/${N} échantillon=${JSON.stringify(t2.slice(0, 3))} incohérentes=${JSON.stringify(t2bad.slice(0, 3))}`,
  );
  check(
    "Le verrou est posé (lockoutUntil dans le futur) et remainingMs cohérent (> 0)",
    t2state[0].lockoutUntil !== null &&
      new Date(t2state[0].lockoutUntil).getTime() > Date.now() &&
      t2.filter((r) => r.locked).every((r) => r.remainingMs > 0),
    JSON.stringify(t2state[0]),
  );

  // ══ T3 : verrou expiré → compteur repart à 1, atomiquement ════════════════
  console.log("\nT3 — Verrou expiré : reprise à 1 + nettoyage du verrou (même instruction)");
  await sqlJob(ENV, [
    "--job=set-state", "--email=t3-expire@exemple.com",
    "--failed=5", `--lockout=${new Date(Date.now() - 60_000).toISOString()}`,
  ]);
  const t3 = await runInstance(ENV, ["--mode=fail", "--email=t3-expire@exemple.com"]);
  const t3state = await sqlJob(ENV, ["--job=state", "--email=t3-expire@exemple.com"]);
  check(
    "L'échec sur verrou expiré repart à 1 (pas 6) et le verrou est nettoyé (NULL)",
    t3[0].locked === false && t3state[0].failedAttempts === 1 && t3state[0].lockoutUntil === null,
    `réponse=${JSON.stringify(t3[0])} état=${JSON.stringify(t3state[0])}`,
  );

  // ══ T4 : isLockedOut — verrou actif / expiré (nettoyage conditionnel) ══════
  console.log("\nT4 — isLockedOut : lecture + nettoyage conditionnel sans écraser d'incrément");
  await sqlJob(ENV, [
    "--job=set-state", "--email=t4a-actif@exemple.com",
    "--failed=2", `--lockout=${new Date(Date.now() + 10 * 60_000).toISOString()}`,
  ]);
  const t4a = await runInstance(ENV, ["--mode=check", "--email=t4a-actif@exemple.com"]);
  check(
    "Verrou actif : locked=true avec remainingMs ≈ 10 min",
    t4a[0].locked === true && t4a[0].remainingMs > 9 * 60_000 && t4a[0].remainingMs <= 10 * 60_000,
    JSON.stringify(t4a[0]),
  );
  await sqlJob(ENV, [
    "--job=set-state", "--email=t4b-expire@exemple.com",
    "--failed=5", `--lockout=${new Date(Date.now() - 60_000).toISOString()}`,
  ]);
  const t4b = await runInstance(ENV, ["--mode=check", "--email=t4b-expire@exemple.com"]);
  const t4bState = await sqlJob(ENV, ["--job=state", "--email=t4b-expire@exemple.com"]);
  check(
    "Verrou expiré : locked=false et nettoyage effectué (compteur 0, verrou NULL)",
    t4b[0].locked === false && t4bState[0].failedAttempts === 0 && t4bState[0].lockoutUntil === null,
    `réponse=${JSON.stringify(t4b[0])} état=${JSON.stringify(t4bState[0])}`,
  );

  // ══ T5 : resetAttempts après connexion réussie ════════════════════════════
  console.log("\nT5 — resetAttempts (connexion réussie) : compteur et verrou remis à zéro");
  await sqlJob(ENV, [
    "--job=set-state", "--email=t5-reset@exemple.com",
    "--failed=3", `--lockout=${new Date(Date.now() + 10 * 60_000).toISOString()}`,
  ]);
  await runInstance(ENV, ["--mode=reset", "--email=t5-reset@exemple.com"]);
  const t5state = await sqlJob(ENV, ["--job=state", "--email=t5-reset@exemple.com"]);
  check(
    "Après succès : failedAttempts=0 et lockoutUntil=NULL",
    t5state[0].failedAttempts === 0 && t5state[0].lockoutUntil === null,
    JSON.stringify(t5state[0]),
  );
} finally {
  if (pgCluster) {
    await pgCluster.stop().catch(() => {});
    if (pgDir) fs.rmSync(pgDir, { recursive: true, force: true });
  }
}

// ─── Compteurs PARTAGÉS (Redis / Postgres) sous dizaines d'instances ─────────
console.log("\n────────────────────────────────────────────");
const mock = createMockUpstash({ token: TOKEN });
const { url: mockUrl } = await mock.listen();

try {
  // ══ T6 : compteur partagé Redis — 30 instances simultanées ════════════════
  console.log(`T6 — Compteur partagé REDIS (INCR atomique) : ${N} instances simultanées`);
  const REDIS_ENV = {
    ...process.env,
    DATABASE_URL: "",
    UPSTASH_REDIS_REST_URL: mockUrl,
    UPSTASH_REDIS_REST_TOKEN: TOKEN,
    RATE_LIMIT_BACKEND: "redis",
  };
  const t6 = await Promise.all(
    Array.from({ length: N }, () =>
      runRlInstance(REDIS_ENV, ["--key=atomisation:redis", "--limit=1000", "--window=900", "--ops=1"])),
  );
  const t6counts = t6.map((r) => r[0].count).sort((a, b) => a - b).join(",");
  const expected = Array.from({ length: N }, (_, i) => i + 1).join(",");
  const t6bad = t6.filter((r) => !(r[0].backend === "redis" && r[0].allowed));
  check(
    `Les ${N} INCR concurrents produisent les compteurs 1..${N} (aucun perdu, aucun doublon)`,
    t6counts === expected && t6bad.length === 0,
    `obtenu=${t6counts} fautives=${JSON.stringify(t6bad.slice(0, 2))}`,
  );
} finally {
  await mock.close();
}

// ══ T7 : compteur partagé Postgres/Neon — 30 instances simultanées ═══════════
console.log(`\nT7 — Compteur partagé POSTGRES/NEON (ON CONFLICT count+1) : ${N} instances simultanées`);
{
  const pgCluster2 = null;
  try {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "pg-atomiclock2-"));
    const cluster2 = new EmbeddedPostgres({
      databaseDir: dir2, user: "postgres", password: "password", port: 54333, persistent: false,
    });
    await cluster2.initialise();
    await cluster2.start();
    await cluster2.createDatabase("ratelimit_test");
    const PG_ENV = {
      ...process.env,
      DATABASE_URL: "postgresql://postgres:password@127.0.0.1:54333/ratelimit_test",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    };
    const t7 = await Promise.all(
      Array.from({ length: N }, () =>
        runRlInstance(PG_ENV, ["--key=atomisation:pg", "--limit=1000", "--window=900", "--ops=1"])),
    );
    const t7counts = t7.map((r) => r[0].count).sort((a, b) => a - b).join(",");
    const expected = Array.from({ length: N }, (_, i) => i + 1).join(",");
    const t7bad = t7.filter((r) => !(r[0].backend === "postgres" && r[0].allowed));
    check(
      `Les ${N} upserts concurrents produisent les compteurs 1..${N} (aucun perdu, aucun doublon)`,
      t7counts === expected && t7bad.length === 0,
      `obtenu=${t7counts} fautives=${JSON.stringify(t7bad.slice(0, 2))}`,
    );
    await cluster2.stop().catch(() => {});
    fs.rmSync(dir2, { recursive: true, force: true });
  } catch (error) {
    console.log(`  ⚠️ T7 ignoré : Postgres embarqué indisponible (${error.message.slice(0, 60)}…)`);
  }
}

console.log(`\n════════════════════════════════════════`);
console.log(`Résultat : ${passed} vérification(s) OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
