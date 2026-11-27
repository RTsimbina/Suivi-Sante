/**
 * verifier-sync-comptes-demo.ts — Contrôle de cohérence BASE ↔ CATALOGUE.
 * ────────────────────────────────────────────────────────────────────────────
 * Compare les comptes réellement présents dans la base (Utilisateur) avec le
 * catalogue src/lib/comptes-demo.ts (source de vérité) :
 *   - comptes du catalogue ABSENTS de la base (seed incomplet) ;
 *   - comptes en base HORS catalogue (créés à la main — signalés, jamais
 *     modifiés par ce script : lecture seule) ;
 *   - écarts de rôle / état actif pour les comptes communs.
 *
 * Usage : DATABASE_URL=… npx tsx scripts/verifier-sync-comptes-demo.ts
 * Sortie : rapport lisible + code retour 1 si un compte du catalogue manque.
 */
import { PrismaClient } from '@prisma/client';
import { COMPTES_DEMO, emailDemoNormalise } from '../src/lib/comptes-demo';

const db = new PrismaClient();

async function main() {
  const enBase = await db.utilisateur.findMany({
    select: { email: true, role: true, actif: true },
  });
  const parEmail = new Map(enBase.map((u) => [emailDemoNormalise(u.email), u]));

  console.log(`Base : ${enBase.length} comptes — catalogue : ${COMPTES_DEMO.length} comptes\n`);

  let manquants = 0;
  let ecarts = 0;
  for (const c of COMPTES_DEMO) {
    const email = emailDemoNormalise(c.email);
    const u = parEmail.get(email);
    if (!u) {
      console.log(`❌ ABSENT de la base : ${c.email} (attendu rôle ${c.role})`);
      manquants++;
      continue;
    }
    const diffs: string[] = [];
    if (u.role !== c.role) diffs.push(`rôle base=${u.role} ≠ catalogue=${c.role}`);
    if (!u.actif) diffs.push('compte désactivé en base');
    if (diffs.length) {
      console.log(`⚠️  ÉCART ${c.email} : ${diffs.join(' ; ')}`);
      ecarts++;
    }
  }

  const emailsCatalogue = new Set(COMPTES_DEMO.map((c) => emailDemoNormalise(c.email)));
  const horsCatalogue = enBase.filter((u) => !emailsCatalogue.has(emailDemoNormalise(u.email)));
  if (horsCatalogue.length) {
    console.log(`\nℹ️  ${horsCatalogue.length} compte(s) en base hors catalogue (signalés, non modifiés) :`);
    for (const u of horsCatalogue) console.log(`   - ${u.email} | ${u.role} | actif=${u.actif}`);
  }

  console.log(`\nBILAN : ${COMPTES_DEMO.length - manquants}/${COMPTES_DEMO.length} comptes du catalogue présents, ${ecarts} écart(s), ${horsCatalogue.length} hors catalogue.`);
  if (manquants > 0 || ecarts > 0) process.exitCode = 1;
  await db.$disconnect();
}

main().catch((e) => {
  console.error('ERREUR :', e.message);
  process.exit(1);
});
