/**
 * test-calcul-tm.mjs — Tests MULTI-INSTANCES du calcul centralisé du
 * ticket modérateur (P2-04).
 *
 * Chaque "instance" = processus Node indépendant (`node --import tsx`,
 * client Prisma dédié) contre un cluster Postgres réel embarqué — comme des
 * lambdas Vercel simultanées sur la même base Neon.
 *
 * Critères couverts (grille mission P2-04F) :
 *   T1  EXEMPLE DE RÉFÉRENCE en base réelle : 100 000 Ar · 80 % · plafond
 *       500 000 · consommé 450 000 → montant validé 50 000 · TM 50 000.
 *   T2  Plafond TOTALEMENT épuisé : création BLOQUÉE (PLAFOND_ACTE_ATTEINT).
 *   T3  Consommation annuelle : RECU et REJETE ne consomment PAS (règle
 *       unifiée du moteur — l'ancienne simulation comptait les RECU).
 *   T4  Plusieurs BÉNÉFICIAIRES : plafonds indépendants.
 *   T5  Plusieurs SOCIÉTÉS : barèmes indépendants.
 *   T6  REMBOURSEMENTS SIMULTANÉS à la VALIDATION : deux dossiers EN_ANALYSE
 *       sur un reliquat insuffisant → EXACTEMENT un validé (verrou FOR UPDATE
 *       + re-vérification dans la transaction), l'autre échoue en 422-like.
 *   T7  Créations simultanées : sérialisées sans erreur ni numéro dupliqué
 *       (le plafond est re-contrôlé à la validation — règle métier RECU).
 *
 * Exécution : node scripts/test-calcul-tm.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const WORKER_PATH = new URL("./test-calcul-tm-worker.mjs", import.meta.url).pathname;
const TAG = "##TM##";

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

function runWorker(env, args) {
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
        reject(new Error(`exit=${code}\n${err.slice(-900)}`));
        return;
      }
      const lines = out
        .trim()
        .split("\n")
        .filter((line) => line.startsWith(TAG))
        .map((line) => JSON.parse(line.slice(TAG.length)));
      resolve(lines[0] ?? null);
    });
  });
}

// ─── Cluster Postgres embarqué (rôle de la base Neon en production) ──────────
let pgCluster = null;
let pgDir = null;
try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-calcul-tm-"));
  pgCluster = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "password",
    port: 54336,
    persistent: false,
  });
  await pgCluster.initialise();
  await pgCluster.start();
  await pgCluster.createDatabase("tm_test");
  console.log(`Postgres embarqué : postgresql://127.0.0.1:54336/tm_test\n`);
} catch (error) {
  console.log(`Postgres embarqué indisponible (${error.message.slice(0, 80)}…) : tests impossibles\n`);
  process.exit(1);
}

const PG_URL = "postgresql://postgres:password@127.0.0.1:54336/tm_test";
const ENV = { ...process.env, DATABASE_URL: PG_URL, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" };

const ACTE = "CONSULTATION";

try {
  // ─── Préparation ──────────────────────────────────────────────────────────
  await runWorker(ENV, ["--mode=setup"]);
  await runWorker(ENV, ["--mode=seed", "--type=societe", "--id=soc-1", "--nom=Société A"]);
  await runWorker(ENV, ["--mode=seed", "--type=societe", "--id=soc-2", "--nom=Société B"]);
  await runWorker(ENV, ["--mode=seed", "--type=bareme", "--id=bar-1", "--societe=soc-1", `--acte=${ACTE}`, "--taux=80", "--plafond=500000"]);
  await runWorker(ENV, ["--mode=seed", "--type=bareme", "--id=bar-2", "--societe=soc-2", `--acte=${ACTE}`, "--taux=90", "--plafond=300000"]);
  for (const a of ["assure-1", "assure-2", "assure-3", "assure-4", "assure-5", "assure-7", "assure-8"]) {
    await runWorker(ENV, ["--mode=seed", "--type=assure", `--id=${a}`, "--societe=soc-1"]);
  }
  await runWorker(ENV, ["--mode=seed", "--type=assure", "--id=assure-6", "--societe=soc-2"]);

  // ══ T1 : EXEMPLE DE RÉFÉRENCE — 100 000 · 80 % · plafond 500 000 · consommé 450 000 ══
  console.log(`T1 — Exemple de référence (mission P2-04C) sur base réelle`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t1-1", "--societe=soc-1", "--assure=assure-1", `--acte=${ACTE}`, "--montant=450000", "--statut=VALIDE"]);
  const t1 = await runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-1", `--acte=${ACTE}`, "--montant=100000"]);
  check("prise en charge AUTORISÉE = 50 000 (plafond restant 50 000, après taux 80 %)", t1.ok && t1.montantValide === 50000, `reçu ${JSON.stringify(t1)}`);
  check("ticket modérateur = 50 000 (part contractuelle 20 000 + dépassement 30 000)", t1.ok && t1.ticketModerateur === 50000);

  // ══ T2 : plafond TOTALEMENT épuisé → création BLOQUÉE ═════════════════════
  console.log(`T2 — Plafond totalement épuisé : création bloquée`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t2-1", "--societe=soc-1", "--assure=assure-2", `--acte=${ACTE}`, "--montant=500000", "--statut=VALIDE"]);
  const t2 = await runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-2", `--acte=${ACTE}`, "--montant=100000"]);
  check("dossier REFUSÉ (PLAFOND_ACTE_ATTEINT)", !t2.ok && t2.raison === 'PLAFOND_ACTE_ATTEINT', `reçu ${JSON.stringify(t2)}`);

  // ══ T3 : RECU et REJETE ne consomment PAS (règle unifiée) ═════════════════
  console.log(`T3 — Consommation annuelle unifiée : RECU et REJETE exclus`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t3-1", "--societe=soc-1", "--assure=assure-3", `--acte=${ACTE}`, "--montant=200000", "--statut=RECU"]);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t3-2", "--societe=soc-1", "--assure=assure-3", `--acte=${ACTE}`, "--montant=50000", "--statut=REJETE"]);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t3-3", "--societe=soc-1", "--assure=assure-3", `--acte=${ACTE}`, "--montant=100000", "--statut=EN_ANALYSE"]);
  const t3 = await runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-3", `--acte=${ACTE}`, "--montant=100000"]);
  // consommé réel = 100 000 (EN_ANALYSE seul) → restant 400 000 → autorisée = 80 000
  check("RECU (200 000) et REJETE (50 000) exclus : montant validé = 80 000", t3.ok && t3.montantValide === 80000, `reçu ${JSON.stringify(t3)}`);

  // ══ T4 : plusieurs BÉNÉFICIAIRES — plafonds indépendants ══════════════════
  console.log(`T4 — Plusieurs bénéficiaires : le plafond ne se partage pas`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t4-1", "--societe=soc-1", "--assure=assure-4", `--acte=${ACTE}`, "--montant=490000", "--statut=VALIDE"]);
  const t4a = await runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-4", `--acte=${ACTE}`, "--montant=100000"]);
  const t4b = await runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-5", `--acte=${ACTE}`, "--montant=100000"]);
  check("bénéficiaire A (restant 10 000) : montant validé = 10 000", t4a.ok && t4a.montantValide === 10000, `reçu ${JSON.stringify(t4a)}`);
  check("bénéficiaire B (sans consommation) : montant validé = 80 000", t4b.ok && t4b.montantValide === 80000, `reçu ${JSON.stringify(t4b)}`);

  // ══ T5 : plusieurs SOCIÉTÉS — barèmes indépendants ════════════════════════
  console.log(`T5 — Plusieurs sociétés : barèmes indépendants`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t5-1", "--societe=soc-2", "--assure=assure-6", `--acte=${ACTE}`, "--montant=250000", "--statut=VALIDE"]);
  const t5 = await runWorker(ENV, ["--mode=create", "--societe=soc-2", "--assure=assure-6", `--acte=${ACTE}`, "--montant=60000"]);
  // soc-2 : 90 % plafond 300 000, consommé 250 000 → restant 50 000, théo 54 000 → autorisée 50 000
  check("société B (90 %, restant 50 000) : montant validé = 50 000, TM = 10 000", t5.ok && t5.montantValide === 50000 && t5.ticketModerateur === 10000, `reçu ${JSON.stringify(t5)}`);

  // ══ T6 : REMBOURSEMENTS SIMULTANÉS à l'entrée en consommation ═════════════
  console.log(`T6 — Simultanés : 2 passages RECU → EN_ANALYSE en parallèle sur restant 150 000`);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t6-1", "--societe=soc-1", "--assure=assure-7", `--acte=${ACTE}`, "--montant=350000", "--statut=VALIDE"]);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t6-2", "--societe=soc-1", "--assure=assure-7", `--acte=${ACTE}`, "--montant=100000", "--statut=RECU"]);
  await runWorker(ENV, ["--mode=seed", "--type=dossier", "--id=d-t6-3", "--societe=soc-1", "--assure=assure-7", `--acte=${ACTE}`, "--montant=100000", "--statut=RECU"]);
  const t6 = await Promise.all([
    runWorker(ENV, ["--mode=validate", "--dossier=d-t6-2"]),
    runWorker(ENV, ["--mode=validate", "--dossier=d-t6-3"]),
  ]);
  const validees = t6.filter(r => r.ok).length;
  const bloques = t6.filter(r => !r.ok && r.raison === 'PLAFOND_ATTEINT_TRANSACTION').length;
  check("EXACTEMENT 1 passage en analyse accepté (sérialisation FOR UPDATE + re-vérif)", validees === 1, `reçu ${JSON.stringify(t6)}`);
  check("EXACTEMENT 1 passage bloqué (PLAFOND_ATTEINT_TRANSACTION)", bloques === 1);
  const t6state = await runWorker(ENV, ["--mode=state", "--societe=soc-1", "--assure=assure-7", `--acte=${ACTE}`]);
  const consommeFinal = t6state.consomme;
  check("le plafond annuel n'est JAMAIS dépassé : consommation finale ≤ 500 000", consommeFinal <= 500000, `consommé ${consommeFinal}`);

  // ══ T7 : CRÉATIONS simultanées sérialisées (numéros uniques) ══════════════
  console.log(`T7 — Créations simultanées : sérialisation, numéros uniques, plafond re-contrôlé à la validation`);
  const t7 = await Promise.all([
    runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-8", `--acte=${ACTE}`, "--montant=100000"]),
    runWorker(ENV, ["--mode=create", "--societe=soc-1", "--assure=assure-8", `--acte=${ACTE}`, "--montant=100000"]),
  ]);
  check("2 créations simultanées acceptées sans crash (règle RECU — re-contrôle à la validation)", t7.every(r => r.ok));
  check("numéros de dossier uniques", new Set(t7.map(r => r.numero)).size === 2);
  check("montants validés IDENTIQUES (recalcul dans la transaction, aucune perte)", t7.every(r => r.montantValide === 80000));

  // ══ Bilan ══════════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Résultat : ${passed} vérification(s) OK, ${failed} échec(s)`);
  process.exit(failed > 0 ? 1 : 0);
} finally {
  try {
    await pgCluster?.stop();
  } catch { /* arrêt best effort */ }
  try {
    fs.rmSync(pgDir, { recursive: true, force: true });
  } catch { /* nettoyage best effort */ }
}
