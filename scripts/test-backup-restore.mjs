/**
 * test-backup-restore.mjs — Test RÉEL du cycle sauvegarde → restauration
 * dans un environnement ISOLÉ (mission sauvegardes, item 10).
 *
 * Principe : pg_dump/pg_restore ne sont pas installables dans l'environnement
 * d'audit (pas d'accès root) — le test implémente donc un DUMP LOGIQUE
 * équivalent (toutes les tables, types explicites, sérialisation JSON) :
 *
 *   1. PG source (port 5434) : migrate deploy + seed + 2 justificatifs data URI
 *   2. DUMP de TOUTES les tables (y compris Justificatif et _prisma_migrations)
 *   3. PG cible ISOLÉ (port 5435) : structure via migrate deploy, puis
 *      restauration intégrale du dump (contraintes FK différées via
 *      session_replication_role, réservé au superuser du cluster jetable)
 *   4. VÉRIFICATION : compteurs par table identiques, SHA-256 du contenu des
 *      justificatifs identiques, _prisma_migrations restaurée (migrate status à jour)
 *
 * Aucune base réelle (Neon/production) n'est contactée. Aucune donnée supprimée.
 * Usage : node scripts/test-backup-restore.mjs
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RACINE = '/home/z/my-project/backup-test-pg';
const PORT_SOURCE = 5434;
const PORT_CIBLE = 5435;
const USER = 'recette', PASSWORD = 'recette-local-only', DATABASE = 'suivi_test';
const URL_SOURCE = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT_SOURCE}/${DATABASE}`;
const URL_CIBLE = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT_CIBLE}/${DATABASE}`;

let pgSource = null, pgCible = null;

function executer(cmd, args, url, label) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url }, cwd: `${__dirname}/..` });
  if (res.status !== 0) {
    console.error(`ÉCHEC ${label} (${cmd})`, res.stdout?.slice(-500), res.stderr?.slice(-500));
    throw new Error(`Étape échouée : ${label}`);
  }
  return res.stdout;
}

function serialiserValeur(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  // Prisma.Decimal (numeric) — détection par structure Decimal.js
  if (typeof v === 'object' && v.d && v.e !== undefined && v.s !== undefined) return v.toString();
  if (Buffer.isBuffer(v)) return v.toString('base64');
  return v;
}

async function dump(db) {
  const tables = (await db.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  )).map(r => r.table_name);
  const dump = {};
  for (const t of tables) {
    const colonnes = await db.$queryRawUnsafe(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, t
    );
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "${t}"`);
    dump[t] = {
      colonnes: colonnes.map(c => ({ nom: c.column_name, type: c.data_type })),
      lignes: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, serialiserValeur(v)]))),
    };
    console.log(`   dump ${t} : ${rows.length} ligne(s)`);
  }
  return dump;
}

function valeurSql(v, type) {
  if (v === null || v === undefined) return 'NULL';
  if (type.includes('timestamp')) return `'${v}'::timestamptz`;
  if (type === 'date') return `'${v}'::date`;
  if (type === 'numeric') return `'${v}'::numeric`;
  if (type === 'integer' || type === 'smallint' || type === 'bigint') return String(Number(v));
  if (type === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (type === 'json' || type === 'jsonb') return `'${String(v).replace(/'/g, "''")}'::jsonb`;
  if (type === 'double precision' || type === 'real') return String(Number(v));
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function restaurer(db, dumpDonnees) {
  await db.$executeRawUnsafe(`SET session_replication_role = replica`);
  let total = 0;
  for (const [t, donnees] of Object.entries(dumpDonnees)) {
    await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
    const { colonnes, lignes } = donnees;
    if (lignes.length === 0) continue;
    const noms = colonnes.map(c => `"${c.nom}"`).join(', ');
    for (let i = 0; i < lignes.length; i += 50) {
      const lot = lignes.slice(i, i + 50);
      const valeurs = lot.map(l =>
        `(${colonnes.map(c => valeurSql(l[c.nom], c.type)).join(', ')})`
      ).join(', ');
      await db.$executeRawUnsafe(`INSERT INTO "${t}" (${noms}) VALUES ${valeurs}`);
    }
    total += lignes.length;
    console.log(`   restaure ${t} : ${lignes.length} ligne(s)`);
  }
  await db.$executeRawUnsafe(`RESET session_replication_role`);
  return total;
}

async function main() {
  rmSync(RACINE, { recursive: true, force: true });
  mkdirSync(`${RACINE}/source/data`, { recursive: true });
  mkdirSync(`${RACINE}/cible/data`, { recursive: true });

  console.log('── 1. PG source (recette simulée)…');
  pgSource = new EmbeddedPostgres({ databaseDir: `${RACINE}/source/data`, user: USER, password: PASSWORD, port: PORT_SOURCE, persistent: true });
  await pgSource.initialise(); await pgSource.start(); await pgSource.createDatabase(DATABASE);
  executer('npx', ['prisma', 'migrate', 'deploy'], URL_SOURCE, 'migrate deploy source');
  executer('npm', ['run', 'db:seed'], URL_SOURCE, 'seed source');
  executer('node', ['scripts/insert-justificatifs-test.mjs'], URL_SOURCE, 'justificatifs test');

  const dbSource = new PrismaClient({ datasources: { db: { url: URL_SOURCE } } });
  // Empreintes AVANT sauvegarde
  const justifsAvant = await dbSource.$queryRawUnsafe(
    `SELECT id, "nomFichier", "chemin" FROM "Justificatif" ORDER BY id`
  );
  const empreintesAvant = Object.fromEntries(justifsAvant.map(j => [j.id,
    createHash('sha256').update(Buffer.from(j.chemin.split(',')[1], 'base64')).digest('hex')]));
  console.log(`   empreintes justificatifs (avant) :`, empreintesAvant);

  console.log('── 2. Dump logique complet…');
  const dumpDonnees = await dump(dbSource);
  const fichier = `${RACINE}/dump-recette.json`;
  writeFileSync(fichier, JSON.stringify(dumpDonnees));
  const empreinteDump = createHash('sha256').update(readFileSync(fichier)).digest('hex');
  console.log(`   dump écrit : ${fichier} (${(JSON.stringify(dumpDonnees).length / 1024).toFixed(0)} Ko) sha256=${empreinteDump.slice(0, 16)}…`);

  console.log('── 3. PG cible ISOLÉ + restauration intégrale…');
  pgCible = new EmbeddedPostgres({ databaseDir: `${RACINE}/cible/data`, user: USER, password: PASSWORD, port: PORT_CIBLE, persistent: true });
  await pgCible.initialise(); await pgCible.start(); await pgCible.createDatabase(DATABASE);
  executer('npx', ['prisma', 'migrate', 'deploy'], URL_CIBLE, 'migrate deploy cible (structure)');
  const dbCible = new PrismaClient({ datasources: { db: { url: URL_CIBLE } } });
  const totalLignes = await restaurer(dbCible, dumpDonnees);
  console.log(`   total restauré : ${totalLignes} ligne(s)`);

  console.log('── 4. Vérifications…');
  let echec = false;
  for (const [t, donnees] of Object.entries(dumpDonnees)) {
    const cible = await dbCible.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    if (cible[0].n !== donnees.lignes.length) {
      console.error(`   [KO] ${t} : ${cible[0].n} ≠ ${donnees.lignes.length}`);
      echec = true;
    }
  }
  const justifsApres = await dbCible.$queryRawUnsafe(
    `SELECT id, "nomFichier", "chemin" FROM "Justificatif" ORDER BY id`
  );
  for (const j of justifsApres) {
    const empreinte = createHash('sha256').update(Buffer.from(j.chemin.split(',')[1], 'base64')).digest('hex');
    if (empreinte !== empreintesAvant[j.id]) {
      console.error(`   [KO] justificatif ${j.id} : contenu divergent après restauration`);
      echec = true;
    } else {
      console.log(`   [OK] justificatif ${j.id} (${j.nomFichier}) — SHA-256 identique`);
    }
  }
  const statut = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: URL_CIBLE }, cwd: `${__dirname}/..`,
  });
  const aJour = statut.stdout.includes('Database schema is up to date');
  console.log(`   ${aJour ? '[OK]' : '[KO]'} _prisma_migrations restaurée (migrate status : up to date = ${aJour})`);
  if (!aJour) echec = true;

  await dbSource.$disconnect(); await dbCible.$disconnect();
  console.log(echec ? '\nRÉSULTAT : ÉCHEC du cycle sauvegarde/restauration' : '\nRÉSULTAT : CYCLE SAUVEGARDE → RESTAURATION ISOLÉE VÉRIFIÉ (aucune perte)');
  process.exit(echec ? 1 : 0);
}

main().catch(async e => {
  console.error('ERREUR FATALE :', e);
  process.exit(1);
}).finally(() => {
  try { pgSource?.stop(); } catch {}
  try { pgCible?.stop(); } catch {}
});
