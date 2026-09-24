// liberer-verrou-migrate.mjs — Libération du verrou consultatif Prisma.
//
// Incident récurrent : une exécution interrompue de `prisma migrate deploy`
// (build Vercel en échec, connexion poolée pgbouncer) laisse un verrou
// consultatif de session (pg_advisory_lock(72707369)) détenu par une
// session serveur devenue IDLE dans le pool pgbouncer. Toute commande
// `prisma migrate` ultérieure échoue alors en P1002
// (« Timed out trying to acquire a postgres advisory lock »).
//
// Ce script (exécuté en connexion DIRECTE, sans -pooler) :
//   1. liste les sessions détenant encore le verrou 72707369 ;
//   2. termine ces backends (pg_terminate_backend) — les sessions idle
//      pgbouncer sont abandonnées, aucune opération en cours à casser ;
//   3. confirme que le verrou est libre.
//
// Utilisation : DATABASE_URL=<uri directe> node scripts/liberer-verrou-migrate.mjs
// (cf. workflow « Migration base de données » — input liberer_verrou).

import { PrismaClient } from '@prisma/client';

const LOCK_ID = 72707369; // verrou consultatif utilisé par prisma migrate

const prisma = new PrismaClient();

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));

// 1. Diagnostic : qui détient le verrou ?
const titulaires = await prisma.$queryRawUnsafe(
  `SELECT a.pid, a.usename, a.application_name, a.client_addr::text AS client,
          a.state, a.backend_start, a.state_change,
          left(coalesce(a.query, ''), 160) AS derniere_requete
     FROM pg_locks l
     JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'advisory' AND l.objid = $1 AND l.pid <> pg_backend_pid()`,
  LOCK_ID
);

console.log(`Verrou ${LOCK_ID} : ${titulaires.length} session(s) titulaire(s).`);
for (const t of titulaires) console.log(json(t));

if (titulaires.length === 0) {
  console.log('Aucun titulaire — verrou déjà libre, rien à faire.');
} else {
  // 2. Terminaison des backends titulaires (sessions idle pgbouncer).
  const res = await prisma.$queryRawUnsafe(
    `SELECT pg_terminate_backend(pid) AS termine, pid
       FROM pg_locks
      WHERE locktype = 'advisory' AND objid = $1 AND pid <> pg_backend_pid()`,
    LOCK_ID
  );
  console.log(`Terminaison(s) demandée(s) : ${json(res)}`);

  // 3. Vérification : le verrou doit être libre.
  const restants = await prisma.$queryRawUnsafe(
    `SELECT pid FROM pg_locks
      WHERE locktype = 'advisory' AND objid = $1 AND pid <> pg_backend_pid()`,
    LOCK_ID
  );
  console.log(`Après nettoyage : ${restants.length} titulaire(s) restant(s).`);
  if (restants.length > 0) {
    console.error('Verrou toujours détenu — relancer ou vérifier la base.');
    process.exitCode = 1;
  } else {
    console.log('Verrou consultatif libéré ✔');
  }
}

await prisma.$disconnect();
