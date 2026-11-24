/**
 * Démarre un PostgreSQL embarqué (embedded-postgres) sur un répertoire de
 * données NEUF — base de recette jetable pour tester `prisma migrate deploy`
 * SANS jamais toucher aux vraies bases (Neon / production).
 *
 * Usage :
 *   node scripts/start-pg-recette.mjs start   → initialise + démarre + crée la base
 *   node scripts/start-pg-recette.mjs stop    → arrête le serveur
 *
 * La chaîne de connexion est écrite dans /home/z/my-project/recette-pg/url.txt.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

const DATA_DIR = '/home/z/my-project/recette-pg';
const URL_FILE = `${DATA_DIR}/url.txt`;
const PORT = 5433;
const USER = 'recette';
const PASSWORD = 'recette-local-only';
const DATABASE = 'suivi_recette';

const commande = process.argv[2] ?? 'start';

if (commande === 'stop') {
  // embedded-postgres ne gère pas l'arrêt par processus séparé : on utilise
  // pg_ctl du paquet avec le répertoire de données.
  const { execFileSync } = await import('node:child_process');
  const pgctl = new URL('../node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl', import.meta.url).pathname;
  try {
    execFileSync(pgctl, ['-D', `${DATA_DIR}/data`, '-m', 'fast', 'stop'], { stdio: 'inherit' });
    console.log('PG_RECETTE_ARRETE');
  } catch (e) {
    console.log('PG_RECETTE_DEJA_ARRETE (ou erreur :', e.message, ')');
  }
  process.exit(0);
}

// ─── start ──────────────────────────────────────────────────────────────────
if (existsSync(`${DATA_DIR}/data/PG_VERSION`)) {
  console.error('ERREUR : répertoire de données déjà initialisé — rm -rf ' + DATA_DIR);
  process.exit(1);
}
mkdirSync(`${DATA_DIR}/data`, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: `${DATA_DIR}/data`,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

await pg.initialise();
await pg.start();
await pg.createDatabase(DATABASE);

const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;
writeFileSync(URL_FILE, url);
console.log('PG_RECETTE_PRET', url);
