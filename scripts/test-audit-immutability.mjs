/**
 * test-audit-immutability.mjs — Test d'échec d'écriture directe du journal
 * d'audit (P1 « Durcir l'immuabilité du journal en base »).
 *
 * Critère du cahier des charges (chapitre 10, tâche P1) :
 *   « Déclencheurs interdisant UPDATE/DELETE ou hachage enchaîné ;
 *     test d'échec d'écriture directe »
 *
 * Principe : un Postgres réel embarqué (rôle équivalent à la Neon de
 * production) reçoit la table "HistoriqueParametre" minimale, PUIS la
 * migration 20261117090000_audit_journal_immutabilite_truncate exécutée
 * VERBATIM (le fichier de migration est lu et appliqué tel quel — aucune
 * duplication du SQL dans ce script). Ensuite, chaque écriture directe est
 * tentée et son résultat vérifié :
 *   S1  INSERT        → autorisé (le journal doit pouvoir s'écrire) ;
 *   S2  UPDATE        → refusé (échec attendu) ;
 *   S3  DELETE        → refusé (échec attendu) ;
 *   S4  TRUNCATE      → refusé (lacune couverte par cette migration :
 *                       TRUNCATE ne passe pas par les triggers row-level) ;
 *   S5  catalogue     → les 2 déclencheurs et les 2 fonctions sont présents
 *                       dans pg_trigger / pg_proc ;
 *   S6  données       → après les échecs, les lignes restent INTACTES.
 *
 * Exécution : node scripts/test-audit-immutability.mjs
 *         ou : npm run test:audit-immutabilite
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIGRATION_REL = "../prisma/migrations/20261117090000_audit_journal_immutabilite_truncate/migration.sql";

let passed = 0;
let failed = 0;

function check(name, condition, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${details ? ` — ${details}` : ""}`);
  }
}

/**
 * Découpe un fichier de migration SQL en instructions exécutables.
 * Respecte les blocs $fn$ … $fn$ (fonctions plpgsql : leurs ';' internes ne
 * terminent PAS une instruction) et ignore les lignes de commentaires
 * (le bloc d'en-tête contient des ';' dans l'exemple de rollback).
 */
function decouperRequetes(sql) {
  const requetes = [];
  let courant = "";
  let dansFn = false;
  for (const ligne of sql.split("\n")) {
    const estCommentaire = ligne.trim().startsWith("--");
    const nbFences = (ligne.match(/\$fn\$/g) || []).length;
    courant += ligne + "\n";
    if (nbFences % 2 === 1) dansFn = !dansFn;
    if (!estCommentaire && !dansFn && ligne.trimEnd().endsWith(";")) {
      const r = courant.trim();
      const aDuCode = r.split("\n").some((l) => {
        const t = l.trim();
        return t && !t.startsWith("--");
      });
      if (aDuCode) requetes.push(r);
      courant = "";
    }
  }
  if (courant.trim()) {
    throw new Error("Migration : dernière instruction non terminée par ';'");
  }
  return requetes;
}

// ─── Cluster Postgres embarqué ──────────────────────────────────────────────
let pgCluster = null;
let pgDir = null;
try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-auditimmut-"));
  pgCluster = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "postgres",
    password: "password",
    port: 54333, // ≠ 54332 : coexistence avec les tests lockout/rate-limit
    persistent: false,
  });
  await pgCluster.initialise();
  await pgCluster.start();
  await pgCluster.createDatabase("audit_immutable_test");
  console.log(`Postgres embarqué : postgresql://127.0.0.1:54333/audit_immutable_test\n`);
} catch (error) {
  console.log(`Postgres embarqué indisponible (${error.message.slice(0, 80)}…) : test impossible\n`);
  process.exit(1);
}

// ─── Client Prisma direct (script autonome — aucun import TS, pas de tsx) ──
const PG_URL = "postgresql://postgres:password@127.0.0.1:54333/audit_immutable_test?connection_limit=1";
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({
  log: ["error"],
  datasources: { db: { url: PG_URL } },
});

try {
  // ── Table minimale "HistoriqueParametre" (colonnes suffisant au test) ──
  await db.$executeRaw`
    CREATE TABLE "HistoriqueParametre" (
      "id" TEXT PRIMARY KEY,
      "entite" TEXT NOT NULL,
      "champ" TEXT,
      "modifiePar" TEXT NOT NULL,
      "dateModification" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log("Table minimale \"HistoriqueParametre\" créée.\n");

  // ── Application VERBATIM de la migration ────────────────────────────────
  const cheminMigration = new URL(MIGRATION_REL, import.meta.url).pathname;
  const sql = fs.readFileSync(cheminMigration, "utf8");
  const requetes = decouperRequetes(sql);
  for (const requete of requetes) {
    await db.$executeRawUnsafe(requete);
  }
  console.log(`Migration appliquée verbatim (${requetes.length} instructions).\n`);

  // ── S5 : catalogue pg_trigger / pg_proc ─────────────────────────────────
  const triggers = await db.$queryRaw`
    SELECT tg.tgname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE c.relname = 'HistoriqueParametre' AND NOT tg.tgisinternal
    ORDER BY tg.tgname
  `;
  const nomsTriggers = triggers.map((t) => String(t.tgname));
  check(
    "S5a trigger historiqueparametre_immutabilite (UPDATE/DELETE) présent",
    nomsTriggers.includes("historiqueparametre_immutabilite"),
    `triggers trouvés : ${nomsTriggers.join(", ") || "aucun"}`,
  );
  check(
    "S5b trigger historiqueparametre_truncate_interdit (TRUNCATE) présent",
    nomsTriggers.includes("historiqueparametre_truncate_interdit"),
    `triggers trouvés : ${nomsTriggers.join(", ") || "aucun"}`,
  );

  // ── S1 : INSERT autorisé (le journal doit rester écrivable) ─────────────
  await db.$executeRaw`
    INSERT INTO "HistoriqueParametre" ("id", "entite", "champ", "modifiePar")
    VALUES ('audit-1', 'Utilisateur', 'role', 'script-test')
  `;
  await db.$executeRaw`
    INSERT INTO "HistoriqueParametre" ("id", "entite", "champ", "modifiePar")
    VALUES ('audit-2', 'Contrat', 'budgetAnnuel', 'script-test')
  `;
  check("S1 INSERT autorisé (2 entrées de journal écrites)", true);

  // ── S2 : UPDATE refusé ──────────────────────────────────────────────────
  let errUpdate = "";
  try {
    await db.$executeRaw`UPDATE "HistoriqueParametre" SET "entite" = 'PIRATE' WHERE "id" = 'audit-1'`;
  } catch (e) {
    errUpdate = e.message ?? String(e);
  }
  check(
    "S2 UPDATE refusé (échec d'écriture directe attendu)",
    errUpdate.includes("interdit") && errUpdate.includes("UPDATE"),
    errUpdate ? `message : ${errUpdate.slice(0, 140)}` : "AUCUNE ERREUR — écriture passée !",
  );

  // ── S3 : DELETE refusé ──────────────────────────────────────────────────
  let errDelete = "";
  try {
    await db.$executeRaw`DELETE FROM "HistoriqueParametre" WHERE "id" = 'audit-1'`;
  } catch (e) {
    errDelete = e.message ?? String(e);
  }
  check(
    "S3 DELETE refusé (échec d'écriture directe attendu)",
    errDelete.includes("interdit") && errDelete.includes("DELETE"),
    errDelete ? `message : ${errDelete.slice(0, 140)}` : "AUCUNE ERREUR — écriture passée !",
  );

  // ── S4 : TRUNCATE refusé (la lacune couverte par la migration) ──────────
  let errTruncate = "";
  try {
    await db.$executeRaw`TRUNCATE TABLE "HistoriqueParametre"`;
  } catch (e) {
    errTruncate = e.message ?? String(e);
  }
  check(
    "S4 TRUNCATE refusé (FOR EACH STATEMENT — contournement impossible)",
    errTruncate.includes("interdit") && errTruncate.includes("TRUNCATE"),
    errTruncate ? `message : ${errTruncate.slice(0, 140)}` : "AUCUNE ERREUR — le journal aurait pu être vidé !",
  );

  // ── S6 : les données restent intactes après les tentatives ──────────────
  const reste = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "HistoriqueParametre"`;
  check("S6 données intactes après les 3 tentatives (2 lignes)", reste[0]?.n === 2, `n = ${reste[0]?.n}`);
} catch (error) {
  failed++;
  console.error(`\n❌ Erreur inattendue du harnais : ${error.message}`);
} finally {
  try {
    await db.$disconnect();
  } catch { /* cluster stop ci-dessous */ }
  try {
    await pgCluster.stop();
  } catch { /* déjà arrêté */ }
}

console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
