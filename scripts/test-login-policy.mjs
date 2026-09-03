/**
 * test-login-policy.mjs — Tests d'intégration de la POLITIQUE de limitation
 * de connexion (correction n°2 « clé de limitation Email → IP »).
 *
 * Vérifie que la clé utilisée correspond RÉELLEMENT à la politique définie
 * (src/lib/login-policy.ts), avec les 3 scénarios d'attaque exigés :
 *
 *   T1  Plusieurs comptes depuis une MÊME IP   → budget IP partagé épuisé
 *   T2  Un compte attaqué depuis PLUSIEURS IP  → budget compte partagé épuisé
 *   T3  Clé combinée login:<ip>:<email>        → blocage précis du couple,
 *                                              sans effets de bord sur les
 *                                              autres comptes/IP + normalisation
 *   T4  Succès → reset compte + couple (IP conservée)
 *   T5  Tentatives SIMULTANÉES → atomicité (aucun incrément perdu)
 *   T6  Garde-fou global activé → blocage toutes sources confondues
 *   T7  Garde-fou global désactivé par défaut → aucune clé login:global
 *   T8/T9 (Postgres/Neon réel embarqué) → politique identique sur l'autre
 *      backend partagé + atomicité sous charge parallèle
 *
 * Architecture : chaque "instance" = processus Node indépendant
 * (`node --import tsx`) chargeant le vrai login-policy.ts ; le stockage
 * partagé vit ailleurs (mock Upstash REST / cluster Postgres embarqué),
 * comme un vrai Redis/Neon en production.
 *
 * Exécution : node scripts/test-login-policy.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMockUpstash } from "./mock-upstash-redis.mjs";

const WORKER_PATH = new URL("./test-login-policy-worker.mjs", import.meta.url).pathname;
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

// ─── Helpers de scénario ─────────────────────────────────────────────────────

const attempt = (env, ip, email, ops = 1) =>
  runInstance(env, ["--mode=attempt", `--ip=${ip}`, `--email=${email}`, `--ops=${ops}`]);
const evaluate = (env, ip, email, ops = 1) =>
  runInstance(env, ["--mode=evaluate", `--ip=${ip}`, `--email=${email}`, `--ops=${ops}`]);
const success = (env, ip, email) =>
  runInstance(env, ["--mode=success", `--ip=${ip}`, `--email=${email}`]);
const status = (env, key) => runInstance(env, ["--mode=status", `--key=${key}`]);

/**
 * Seuils de la politique pour un test donné (par défaut : 100 partout pour
 * n'activer que le niveau étudié). Les fenêtres restent à 900 s : la
 * mécanique d'expiration est déjà couverte par test-rate-limit.mjs.
 */
const policyEnv = (base, { email = 100, ip = 100, pair = 100, global = 0 } = {}) => ({
  ...base,
  LOGIN_EMAIL_LIMIT: String(email),
  LOGIN_IP_LIMIT: String(ip),
  LOGIN_PAIR_LIMIT: String(pair),
  LOGIN_GLOBAL_LIMIT: String(global),
  LOGIN_EMAIL_WINDOW_SECONDS: "900",
  LOGIN_IP_WINDOW_SECONDS: "900",
  LOGIN_PAIR_WINDOW_SECONDS: "900",
  LOGIN_GLOBAL_WINDOW_SECONDS: "900",
});

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
  // ══ T1 : plusieurs comptes depuis une MÊME IP ════════════════════════════
  console.log("T1 — Plusieurs comptes depuis une même IP (niveau 2 : login:ip)");
  const t1env = policyEnv(REDIS_ENV, { ip: 9 });
  await attempt(t1env, "203.0.113.10", "compte-a@exemple.com", 3);
  await attempt(t1env, "203.0.113.10", "compte-b@exemple.com", 3);
  await attempt(t1env, "203.0.113.10", "compte-c@exemple.com", 3);
  const t1d = await attempt(t1env, "203.0.113.10", "compte-d@exemple.com", 1);
  check("Chaque compte reste sous ses budgets compte/couple (3/100), mais la 10e tentative est bloquée au niveau IP",
    t1d[0].allowed === false && t1d[0].reason === "ip", JSON.stringify(t1d));
  const t1ip = await status(t1env, "login:ip:203.0.113.10");
  check("Clé IP partagée par tous les comptes : compteur = 10 (9 tentatives + la bloquée)",
    t1ip[0].count === 10 && t1ip[0].backend === "redis", JSON.stringify(t1ip));
  const t1ea = await status(t1env, "login:email:compte-a@exemple.com");
  const t1pa = await status(t1env, "login:203.0.113.10:compte-a@exemple.com");
  check("Clés compte et couple INDÉPENDANTES par compte (3 chacune, pas 9)",
    t1ea[0].count === 3 && t1pa[0].count === 3,
    `email=${JSON.stringify(t1ea)} pair=${JSON.stringify(t1pa)}`);
  const t1ed = await status(t1env, "login:email:compte-d@exemple.com");
  check("La tentative bloquée (IP) n'a PAS incrémenté les compteurs d'échec du compte ciblé",
    t1ed[0].count === 0, JSON.stringify(t1ed));

  // ══ T2 : un compte attaqué depuis PLUSIEURS IP ═══════════════════════════
  console.log("\nT2 — Un compte attaqué depuis plusieurs IP (niveau 1 : login:email)");
  const t2env = policyEnv(REDIS_ENV, { email: 5 });
  for (let n = 1; n <= 5; n++) {
    await attempt(t2env, `198.51.100.${n}`, "victime@exemple.com", 1);
  }
  const t2six = await attempt(t2env, "198.51.100.6", "victime@exemple.com", 1);
  check("6e échec (nouvelle IP fraîche) bloqué au niveau COMPTE : 5 échecs/15 min toutes IP confondues",
    t2six[0].allowed === false && t2six[0].reason === "email", JSON.stringify(t2six));
  const t2em = await status(t2env, "login:email:victime@exemple.com");
  check("Clé compte partagée entre TOUTES les sources : compteur = 5",
    t2em[0].count === 5, JSON.stringify(t2em));
  const t2p1 = await status(t2env, "login:198.51.100.1:victime@exemple.com");
  const t2p6 = await status(t2env, "login:198.51.100.6:victime@exemple.com");
  check("Clés couple par source : 1 échec chacune (l'IP 6 a été bloquée AVANT d'enregistrer un échec)",
    t2p1[0].count === 1 && t2p6[0].count === 0,
    `pair1=${JSON.stringify(t2p1)} pair6=${JSON.stringify(t2p6)}`);
  const t2ip6 = await status(t2env, "login:ip:198.51.100.6");
  check("Le compteur de la source bloquée a quand même compté la tentative (volume IP)",
    t2ip6[0].count === 1, JSON.stringify(t2ip6));

  // ══ T3 : clé combinée login:<ip>:<email> ═════════════════════════════════
  console.log("\nT3 — Clé combinée login:<ip>:<email> (niveau 3, précision du couple)");
  const t3env = policyEnv(REDIS_ENV, { pair: 3 });
  await attempt(t3env, "192.0.2.7", "specifique@exemple.com", 3);
  const t3fourth = await attempt(t3env, "192.0.2.7", "specifique@exemple.com", 1);
  check("4e échec du MÊME couple bloqué au niveau PAIRE (3 échecs/15 min)",
    t3fourth[0].allowed === false && t3fourth[0].reason === "pair", JSON.stringify(t3fourth));
  const t3key = await status(t3env, "login:192.0.2.7:specifique@exemple.com");
  check("La clé stockée correspond EXACTEMENT au format de la politique : login:<ip>:<email> = 3",
    t3key[0].count === 3 && t3key[0].backend === "redis", JSON.stringify(t3key));
  const t3other = await attempt(t3env, "192.0.2.7", "autre@exemple.com", 1);
  check("Même IP, autre compte → autorisé (pas de punition collective du NAT)",
    t3other[0].allowed === true, JSON.stringify(t3other));
  const t3newip = await attempt(t3env, "192.0.2.8", "specifique@exemple.com", 1);
  check("Même compte, autre IP → autorisé (utilisateur mobile non pénalisé)",
    t3newip[0].allowed === true, JSON.stringify(t3newip));
  await attempt(t3env, "192.0.2.9", "Specifique@Exemple.COM", 1);
  const t3norm = await status(t3env, "login:email:specifique@exemple.com");
  check("E-mails normalisés (casse/espaces) : Specifique@Exemple.COM fusionné dans la même clé (= 5)",
    t3norm[0].count === 5, JSON.stringify(t3norm));
  const t3pair9 = await status(t3env, "login:192.0.2.9:specifique@exemple.com");
  check("Clé couple normalisée pour l'IP 192.0.2.9 (= 1)",
    t3pair9[0].count === 1, JSON.stringify(t3pair9));

  // ══ T4 : succès → reset compte + couple, IP conservée ════════════════════
  console.log("\nT4 — Connexion réussie : reset des budgets d'échec (compte + couple)");
  const t4env = policyEnv(REDIS_ENV, { email: 2, pair: 2 });
  await attempt(t4env, "203.0.113.77", "succes@exemple.com", 2);
  const t4blocked = await attempt(t4env, "203.0.113.77", "succes@exemple.com", 1);
  check("Sans succès : 3e tentative bloquée (seuils compte=paire=2, le compte est vérifié avant le couple)",
    t4blocked[0].allowed === false && t4blocked[0].reason === "email", JSON.stringify(t4blocked));
  await success(t4env, "203.0.113.77", "succes@exemple.com");
  const t4em = await status(t4env, "login:email:succes@exemple.com");
  const t4pr = await status(t4env, "login:203.0.113.77:succes@exemple.com");
  check("Après succès : compte ET couple remis à zéro",
    t4em[0].count === 0 && t4pr[0].count === 0,
    `email=${JSON.stringify(t4em)} pair=${JSON.stringify(t4pr)}`);
  const t4ip = await status(t4env, "login:ip:203.0.113.77");
  check("Le compteur IP (volume) est CONSERVÉ après succès (= 3)",
    t4ip[0].count === 3, JSON.stringify(t4ip));
  const t4again = await attempt(t4env, "203.0.113.77", "succes@exemple.com", 1);
  check("Nouvelle tentative autorisée : budget d'échecs récupéré",
    t4again[0].allowed === true, JSON.stringify(t4again));

  // ══ T5 : tentatives SIMULTANÉES (atomicité) ══════════════════════════════
  console.log("\nT5 — 5 instances simultanées sur le même couple (atomicité INCR)");
  const t5env = policyEnv(REDIS_ENV);
  const t5results = await Promise.all(
    Array.from({ length: 5 }, () => attempt(t5env, "203.0.113.99", "parallele@exemple.com", 1)),
  );
  check("Les 5 tentatives parallèles sont autorisées (seuils 100) et marquées échouées",
    t5results.every((r) => r[0].allowed === true && r[0].failed === true),
    JSON.stringify(t5results));
  const t5em = await status(t5env, "login:email:parallele@exemple.com");
  const t5pr = await status(t5env, "login:203.0.113.99:parallele@exemple.com");
  const t5ip = await status(t5env, "login:ip:203.0.113.99");
  check("Compteurs EXACTS après la salve : compte=5, couple=5, IP=5 (aucun perdu, aucun doublon)",
    t5em[0].count === 5 && t5pr[0].count === 5 && t5ip[0].count === 5,
    `email=${JSON.stringify(t5em)} pair=${JSON.stringify(t5pr)} ip=${JSON.stringify(t5ip)}`);

  // ══ T6 : garde-fou global ACTIVÉ ═════════════════════════════════════════
  console.log("\nT6 — Garde-fou global login:global (LOGIN_GLOBAL_LIMIT=3)");
  const t6env = policyEnv(REDIS_ENV, { global: 3 });
  await attempt(t6env, "203.0.113.201", "tempete-1@exemple.com", 1);
  await attempt(t6env, "203.0.113.202", "tempete-2@exemple.com", 1);
  await attempt(t6env, "203.0.113.203", "tempete-3@exemple.com", 1);
  const t6fourth = await attempt(t6env, "203.0.113.204", "tempete-4@exemple.com", 1);
  check("4e tentative bloquée par le garde-fou GLOBAL malgré IP/compte/paire vierges",
    t6fourth[0].allowed === false && t6fourth[0].reason === "global", JSON.stringify(t6fourth));
  const t6g = await status(t6env, "login:global");
  check("Clé globale partagée : compteur = 4 (les tentatives bloquées comptent aussi)",
    t6g[0].count === 4, JSON.stringify(t6g));

  // ══ T7 : garde-fou global DÉSACTIVÉ par défaut ═══════════════════════════
  // Mock DÉDIÉ : T6 a posé une clé login:global sur le mock partagé, on
  // vérifie ici sur un stockage vierge qu'aucune clé globale n'est créée.
  console.log("\nT7 — Garde-fou global désactivé par défaut (pas de LOGIN_GLOBAL_LIMIT)");
  const mock2 = createMockUpstash({ token: TOKEN });
  const { url: mockUrl2 } = await mock2.listen();
  const T7_ENV = { ...REDIS_ENV, UPSTASH_REDIS_REST_URL: mockUrl2 };
  try {
    const t7env = policyEnv(T7_ENV);
    const t7 = await attempt(t7env, "203.0.113.221", "sansgarde@exemple.com", 2);
    check("Tentatives autorisées sans aucune configuration du garde-fou",
      t7.every((r) => r.allowed === true), JSON.stringify(t7));
    const t7g = await status(t7env, "login:global");
    check("AUCUNE clé login:global créée (compteur = 0) : pas de point de blocage global par défaut",
      t7g[0].count === 0, JSON.stringify(t7g));
  } finally {
    await mock2.close();
  }
} finally {
  await mock.close();
}

// ─── Backend 2 : POSTGRESQL / NEON (cluster réel embarqué) ───────────────────
console.log("\n────────────────────────────────────────────");
let pgCluster = null;
let pgDir = null;

try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-loginpolicy-"));
  pgCluster = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "password",
    port: 54331,
    persistent: false,
  });
  await pgCluster.initialise();
  await pgCluster.start();
  await pgCluster.createDatabase("ratelimit_test");
  console.log("Postgres embarqué : postgresql://127.0.0.1:54331/ratelimit_test\n");
} catch (error) {
  console.log(`Postgres embarqué indisponible (${error.message.slice(0, 80)}…) : tests PG ignorés\n`);
  pgCluster = null;
}

const PG_URL = "postgresql://postgres:password@127.0.0.1:54331/ratelimit_test";
const PG_ENV = {
  ...process.env,
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  DATABASE_URL: PG_URL,
};

try {
  if (pgCluster) {
    // ══ T8 : politique identique sur Postgres/Neon (scénario T2) ═══════════
    console.log("T8 — Politique à 3 niveaux sur Postgres/Neon (compte attaqué depuis plusieurs IP)");
    const t8env = policyEnv(PG_ENV, { email: 3 });
    await attempt(t8env, "198.51.100.11", "pg-victime@exemple.com", 1);
    await attempt(t8env, "198.51.100.12", "pg-victime@exemple.com", 1);
    await attempt(t8env, "198.51.100.13", "pg-victime@exemple.com", 1);
    const t8fourth = await attempt(t8env, "198.51.100.14", "pg-victime@exemple.com", 1);
    check("4e source bloquée au niveau COMPTE (3 échecs toutes IP confondues), backend postgres",
      t8fourth[0].allowed === false && t8fourth[0].reason === "email", JSON.stringify(t8fourth));
    const t8em = await status(t8env, "login:email:pg-victime@exemple.com");
    check("Compteur compte partagé = 3, stocké dans Neon (backend=postgres, zéro config en plus)",
      t8em[0].count === 3 && t8em[0].backend === "postgres", JSON.stringify(t8em));

    // ══ T9 : tentatives simultanées sur Postgres (atomicité) ═══════════════
    console.log("\nT9 — 5 instances simultanées sur Postgres/Neon (atomicité ON CONFLICT)");
    const t9env = policyEnv(PG_ENV);
    const t9results = await Promise.all(
      Array.from({ length: 5 }, () => attempt(t9env, "203.0.113.150", "pg-parallele@exemple.com", 1)),
    );
    check("Les 5 tentatives parallèles sont autorisées",
      t9results.every((r) => r[0].allowed === true && r[0].failed === true), JSON.stringify(t9results));
    const t9em = await status(t9env, "login:email:pg-parallele@exemple.com");
    const t9pr = await status(t9env, "login:203.0.113.150:pg-parallele@exemple.com");
    const t9ip = await status(t9env, "login:ip:203.0.113.150");
    check("Compteurs EXACTS après la salve : compte=5, couple=5, IP=5",
      t9em[0].count === 5 && t9pr[0].count === 5 && t9ip[0].count === 5,
      `email=${JSON.stringify(t9em)} pair=${JSON.stringify(t9pr)} ip=${JSON.stringify(t9ip)}`);
  } else {
    console.log("T8-T9 ignorés (Postgres embarqué indisponible dans cet environnement).");
  }
} finally {
  if (pgCluster) {
    await pgCluster.stop().catch(() => {});
    if (pgDir) fs.rmSync(pgDir, { recursive: true, force: true });
  }
}

console.log(`\n════════════════════════════════════════`);
console.log(`Résultat : ${passed} vérification(s) OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
