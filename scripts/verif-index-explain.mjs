#!/usr/bin/env node
/**
 * ARC-02 — Vérification des plans d'exécution des index cœur.
 *
 * À exécuter dans un environnement disposant de la base (développement ou
 * recette) : node scripts/verif-index-explain.mjs
 *
 * Prérequis : `npx prisma migrate deploy` appliqué (les index de la migration
 * 20261120090000_index_coeur doivent exister).
 *
 * Pour chaque requête critique (listes isolées par société, consommation de
 * plafond par acte, consommation globale, contrats d'une société), le script
 * affiche EXPLAIN (ANALYZE, BUFFERS) et vérifie que le plan utilise un
 * Index Scan / Bitmap Index Scan (et non un Seq Scan).
 *
 * Requiert DATABASE_URL (postgresql://...).
 */

import { Client } from 'pg';

const REQUETES = [
  {
    nom: 'Liste dossiers — isolation société + statut + période',
    sql: `SELECT * FROM "Dossier"
          WHERE "societeId" = $1 AND "statut" = 'VALIDE'
            AND "dateReception" >= $2 AND "dateReception" <= $3
          ORDER BY "createdAt" DESC LIMIT 20`,
    params: ['soc-demo', new Date('2026-01-01'), new Date('2026-12-31')],
    indexAttendu: 'Dossier_societeId_statut_dateReception_idx',
  },
  {
    nom: 'Plafond par acte — consommation annuelle (verifierPlafondAnnuel)',
    sql: `SELECT "montantPaye", "montantValide", "montantReclame" FROM "Dossier"
          WHERE "assureId" = $1 AND "typeDossier" = $2
            AND "dateReception" >= $3 AND "dateReception" <= $4
            AND "statut" IN ('EN_ANALYSE','VALIDE','EN_COMPTABILITE','EN_PAIEMENT','PAYE')`,
    params: ['assure-demo', 'CONSULTATION', new Date('2026-01-01'), new Date('2026-12-31')],
    indexAttendu: 'Dossier_assureId_typeDossier_dateReception_idx',
  },
  {
    nom: 'Plafond global — consommation tous actes',
    sql: `SELECT "montantPaye", "montantValide", "montantReclame" FROM "Dossier"
          WHERE "assureId" = $1
            AND "dateReception" >= $2 AND "dateReception" <= $3
            AND "statut" IN ('EN_ANALYSE','VALIDE','EN_COMPTABILITE','EN_PAIEMENT','PAYE')`,
    params: ['assure-demo', new Date('2026-01-01'), new Date('2026-12-31')],
    indexAttendu: 'Dossier_assureId_dateReception_idx',
  },
  {
    nom: 'Contrats d\u2019une société (appels de fonds, budgets)',
    sql: `SELECT * FROM "Contrat" WHERE "societeId" = $1 AND "statut" = 'ACTIF'`,
    params: ['soc-demo'],
    indexAttendu: 'Contrat_societeId_statut_idx',
  },
  {
    nom: 'Assurés d\u2019une société (listes gestion)',
    sql: `SELECT * FROM "Assure" WHERE "societeId" = $1 AND "actif" = true LIMIT 50`,
    params: ['soc-demo'],
    indexAttendu: 'Assure_societeId_actif_idx',
  },
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let indexManquants = 0;
for (const r of REQUETES) {
  const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${r.sql}`, r.params);
  const texte = plan.rows.map(l => l['QUERY PLAN']).join('\n');
  const utiliseIndex = texte.includes(r.indexAttendu);
  if (!utiliseIndex) indexManquants++;
  console.log(`\n── ${r.nom}`);
  console.log(`   index attendu : ${r.indexAttendu} → ${utiliseIndex ? '✓ UTILISÉ' : '✗ NON UTILISÉ (Seq Scan ?)'}`);
  console.log(texte.split('\n').slice(0, 6).map(l => '   ' + l).join('\n'));
}

await client.end();
console.log(`\n══ Résultat : ${REQUETES.length - indexManquants}/${REQUETES.length} requêtes utilisent leurs index.`);
if (indexManquants > 0) process.exit(1);
