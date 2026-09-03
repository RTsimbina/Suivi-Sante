/**
 * test-atomic-lockout-worker.mjs — Worker représentant UNE "instance"
 * serverless pour les tests du verrouillage par compte atomique.
 *
 * Chaque invocation est un processus Node indépendant (mémoire vide, client
 * Prisma dédié) chargeant le VRAI module src/lib/account-lockout.ts.
 * Sortie : une ligne JSON par opération, préfixée ##AL##.
 *
 * Modes :
 *   --mode=fail         (défaut) N × recordFailedAttempt(email) — le NOUVEAU
 *                       pattern atomique (UPDATE ... + 1 ... RETURNING).
 *   --mode=fail-legacy  N × ANCIEN pattern read → increment → write (SELECT,
 *                       pause optionnelle --legacy-sleep=ms, UPDATE SET
 *                       valeur calculée en JS) — sert à DÉMONTRER la perte
 *                       d'incréments sous charge simultanée.
 *   --mode=check        isLockedOut(email).
 *   --mode=reset        resetAttempts(email) (connexion réussie).
 *
 * Options : --email=user@exemple.com --ops=1 --legacy-sleep=0
 *
 * Seuil du verrou : LOCKOUT_MAX_ATTEMPTS (env, défaut 5) — l'orchestrateur
 * le monte à 1000 pour les salves qui doivent compter sans verrouillage.
 */

const argv = process.argv.slice(2);
const arg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const withEq = argv.find((a) => a.startsWith(prefix));
  if (withEq !== undefined) return withEq.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = "##AL##";
const mode = arg("mode", "fail");
const email = arg("email", "");
const ops = Number(arg("ops", "1"));
const legacySleepMs = Number(arg("legacy-sleep", "0"));

const lockout = await import(
  new URL("../src/lib/account-lockout.ts", import.meta.url).href
);

for (let i = 1; i <= ops; i++) {
  if (mode === "fail") {
    const r = await lockout.recordFailedAttempt(email);
    console.log(TAG + JSON.stringify({ i, mode, locked: r.locked, remainingMs: r.remainingMs }));
  } else if (mode === "check") {
    const r = await lockout.isLockedOut(email);
    console.log(TAG + JSON.stringify({ mode: "check", locked: r.locked, remainingMs: r.remainingMs }));
  } else if (mode === "fail-legacy") {
    // ANCIEN pattern (la course à démontrer) : lecture, calcul en JS, écriture.
    const { db } = await import(new URL("../src/lib/db.ts", import.meta.url).href);
    const rows = await db.$queryRaw`
      SELECT "failedAttempts" AS "failedattempts"
      FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
    `;
    const read = Number(rows[0]?.failedattempts ?? 0);
    if (legacySleepMs > 0) await new Promise((r) => setTimeout(r, legacySleepMs));
    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = ${read + 1}
      WHERE "email" = ${email}
    `;
    console.log(TAG + JSON.stringify({ i, mode, read, wrote: read + 1 }));
  }
}

if (mode === "reset") {
  await lockout.resetAttempts(email);
  console.log(TAG + JSON.stringify({ mode: "reset", ok: true }));
}

process.exit(0);
