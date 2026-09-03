/**
 * test-atomic-lockout-sql.mjs — Helper SQL pour les tests du verrouillage
 * par compte ATOMIQUE. Exécuté via `node --import tsx` avec DATABASE_URL
 * pointant sur le cluster Postgres embarqué de l'orchestrateur.
 *
 * Jobs :
 *   --job=setup                          Crée la table "Utilisateur" minimale
 *   --job=seed --email=x@y.z             (Re)crée un compte à zéro
 *   --job=state --email=x@y.z            Lit {failedAttempts, lockoutUntil}
 *   --job=set-state --email=... --failed=N --lockout=ISO|""   Pose un état
 *
 * Sortie : une ligne JSON préfixée ##SQL## par job (filtrage des logs Prisma).
 */

const argv = process.argv.slice(2);
const arg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const withEq = argv.find((a) => a.startsWith(prefix));
  if (withEq !== undefined) return withEq.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = "##SQL##";
const job = arg("job", "");
const email = arg("email", "");

const { db } = await import(new URL("../src/lib/db.ts", import.meta.url).href);

try {
  if (job === "setup") {
    // Table minimale : uniquement les colonnes utilisées par
    // src/lib/account-lockout.ts (l'application réelle a la table complète
    // via schema.prisma + migrations).
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Utilisateur" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "failedAttempts" INTEGER NOT NULL DEFAULT 0,
        "lockoutUntil" TIMESTAMPTZ(3)
      )
    `;
    console.log(TAG + JSON.stringify({ job, ok: true }));
  } else if (job === "seed") {
    const id = `test-${Math.random().toString(36).slice(2)}`;
    await db.$executeRaw`
      INSERT INTO "Utilisateur" ("id", "email")
      VALUES (${id}, ${email})
      ON CONFLICT ("email") DO UPDATE
      SET "failedAttempts" = 0, "lockoutUntil" = NULL
    `;
    console.log(TAG + JSON.stringify({ job, ok: true, email }));
  } else if (job === "state") {
    const rows = await db.$queryRaw`
      SELECT "failedAttempts" AS "failedattempts",
             "lockoutUntil"   AS "lockoutuntil"
      FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
    `;
    const row = rows[0];
    console.log(
      TAG +
      JSON.stringify({
        job,
        email,
        failedAttempts: row ? Number(row.failedattempts) : null,
        lockoutUntil: row?.lockoutuntil ? row.lockoutuntil.toISOString() : null,
      }),
    );
  } else if (job === "set-state") {
    const failed = Number(arg("failed", "0"));
    const lockoutIso = arg("lockout", "");
    if (lockoutIso) {
      await db.$executeRaw`
        UPDATE "Utilisateur"
        SET "failedAttempts" = ${failed}, "lockoutUntil" = ${new Date(lockoutIso)}
        WHERE "email" = ${email}
      `;
    } else {
      await db.$executeRaw`
        UPDATE "Utilisateur"
        SET "failedAttempts" = ${failed}, "lockoutUntil" = NULL
        WHERE "email" = ${email}
      `;
    }
    console.log(TAG + JSON.stringify({ job, ok: true, email, failed, lockoutIso: lockoutIso || null }));
  } else {
    console.log(TAG + JSON.stringify({ job, error: `job inconnu: ${job}` }));
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  console.log(TAG + JSON.stringify({ job, error: String(error).slice(0, 300) }));
  process.exit(1);
}
