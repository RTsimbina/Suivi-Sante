/**
 * R4 — Validation TRACÉE des délais cibles et seuils d'alerte du module KPI.
 * ────────────────────────────────────────────────────────────────────────────
 * Rend explicites en base les valeurs proposées par le module (jusqu'ici
 * implicites via les constantes OBJECTIFS_DEFAUT_MINUTES / SEUILS_DEFAUT) :
 *   - ObjectifDelai : ACCUEIL 30 min, TECHNIQUE 240, CONTROLE_MEDICAL 240,
 *     COMPTABILITE 120 (version créée, versionnée comme via l'API) ;
 *   - SeuilAlerteKpi : PROCHE_CIBLE 80 %, ACCUMULATION 20, DEGRADATION 10,
 *     HAUSSE_RETOURS 10 % — pour GLOBAL et chacun des 4 services.
 * Chaque écriture est journalisée dans HistoriqueParametre (audit immuable,
 * mêmes champs que logParametreChange : entite, champ, ancienne/nouvelle
 * valeur, action, module KPI, motif) et attribuée à un ADMINISTRATEUR actif.
 *
 * Politique d'idempotence :
 *   - valeur absente            → création tracée (CREATION) ;
 *   - valeur déjà identique     → ignorée (aucune écriture) ;
 *   - valeur différente présente → REFUS sans écriture, sauf --force qui
 *     applique la même versionnage que l'API (fermeture valideAu + création,
 *     audit MODIFICATION avec ancienne valeur).
 *
 * Usage :
 *   DATABASE_URL=… npx tsx scripts/valider-objectifs-seuils-kpi.ts \
 *     --par admin@suivisante.mg [--motif "…"] [--force]
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ─── Référentiel validé (R4) — miroir des constantes du module KPI ───────────

const OBJECTIFS_VALIDES = [
  { service: 'ACCUEIL', delaiMinutes: 30 },
  { service: 'TECHNIQUE', delaiMinutes: 240 },
  { service: 'CONTROLE_MEDICAL', delaiMinutes: 240 },
  { service: 'COMPTABILITE', delaiMinutes: 120 },
] as const;

const SEUILS_VALIDES = {
  PROCHE_CIBLE: 80,   // % du délai cible consommé
  ACCUMULATION: 20,   // dossiers ouverts simultanément dans le service
  DEGRADATION: 10,    // points de baisse du taux de respect
  HAUSSE_RETOURS: 10, // % de taux de retour pour correction
} as const;

const SERVICES = ['GLOBAL', 'ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const;

const MOTIF_DEFAUT = 'Validation des délais cibles et seuils d\u2019alerte (R4) — décision direction';

// ─── Arguments ───────────────────────────────────────────────────────────────

function parseArgs(): { par: string; motif: string; force: boolean } {
  const args = process.argv.slice(2);
  let par = '';
  let motif = MOTIF_DEFAUT;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--par') par = args[++i] ?? '';
    else if (args[i] === '--motif') motif = args[++i] ?? '';
    else if (args[i] === '--force') force = true;
  }
  if (!par) {
    console.error('Usage : npx tsx scripts/valider-objectifs-seuils-kpi.ts --par admin@suivisante.mg [--motif "…"] [--force]');
    console.error('--par est OBLIGATOIRE : la traçabilité exige un auteur réel (administrateur actif).');
    process.exit(1);
  }
  if (motif.trim().length < 10) {
    console.error('Le motif doit contenir au moins 10 caractères (exigence de traçabilité du module KPI).');
    process.exit(1);
  }
  return { par, motif: motif.trim(), force };
}

/** Écrit une ligne d'audit identique à logParametreChange (sans contexte HTTP). */
async function journaliser(p: {
  entite: string; entiteId: string; champ: string;
  ancienneValeur: number | null; nouvelleValeur: number;
  action: 'CREATION' | 'MODIFICATION';
  objet: string; motif: string;
  modifiePar: string; modifieParId: string;
}): Promise<void> {
  await db.historiqueParametre.create({
    data: {
      entite: p.entite,
      entiteId: p.entiteId,
      champ: p.champ,
      ancienneValeur: p.ancienneValeur === null ? null : String(p.ancienneValeur),
      nouvelleValeur: String(p.nouvelleValeur),
      modifiePar: p.modifiePar,
      modifieParId: p.modifieParId,
      action: p.action,
      niveau: 'STANDARD',
      module: 'KPI',
      objet: p.objet,
      motif: p.motif,
    },
  });
}

async function main(): Promise<void> {
  const { par, motif, force } = parseArgs();

  // ── Auteur : administrateur actif (traçabilité honnête, jamais fabriquée) ──
  const auteur = await db.utilisateur.findUnique({
    where: { email: par.toLowerCase() },
    select: { id: true, nom: true, role: true, actif: true },
  });
  if (!auteur || !auteur.actif || auteur.role !== 'ADMINISTRATEUR') {
    console.error(`Refus : « ${par} » n'est pas un compte ADMINISTRATEUR actif — validation annulée.`);
    process.exit(1);
  }

  console.log(`Validation KPI (R4) — auteur : ${auteur.nom} <${par}>`);
  console.log(`Motif : « ${motif} »${force ? ' — mode --force' : ''}\n`);

  // ── 1. Diagnostic SANS écriture : refus global si divergence sans --force ──
  const conflits: string[] = [];
  for (const o of OBJECTIFS_VALIDES) {
    const enVigueur = await db.objectifDelai.findFirst({
      where: { service: o.service, typeDossier: null, valideAu: null },
      orderBy: { valideDu: 'desc' },
    });
    if (enVigueur && enVigueur.delaiMinutes !== o.delaiMinutes) {
      conflits.push(`Objectif ${o.service} : ${enVigueur.delaiMinutes} min en vigueur ≠ ${o.delaiMinutes} min validées`);
    }
  }
  for (const service of SERVICES) {
    for (const [typeAlerte, valeur] of Object.entries(SEUILS_VALIDES)) {
      const seuil = await db.seuilAlerteKpi.findUnique({
        where: { service_typeAlerte: { service, typeAlerte } },
      });
      if (seuil && seuil.valeur !== valeur) {
        conflits.push(`Seuil ${typeAlerte}/${service} : ${seuil.valeur} ≠ ${valeur} validées`);
      }
    }
  }
  if (conflits.length > 0 && !force) {
    console.error('Divergences détectées avec les valeurs déjà en base (aucune écriture faite) :');
    for (const c of conflits) console.error(`  × ${c}`);
    console.error('\nRelancez avec --force pour appliquer le versionnage de l\u2019API');
    console.error('(fermeture de la version en vigueur + création tracée, audit MODIFICATION),');
    console.error('ou ajustez les valeurs depuis l\u2019interface KPI → Objectifs.');
    process.exit(1);
  }

  // ── 2. Objectifs ────────────────────────────────────────────────────────────
  let objectifsCrees = 0;
  for (const o of OBJECTIFS_VALIDES) {
    const enVigueur = await db.objectifDelai.findFirst({
      where: { service: o.service, typeDossier: null, valideAu: null },
      orderBy: { valideDu: 'desc' },
    });
    if (enVigueur && enVigueur.delaiMinutes === o.delaiMinutes) {
      console.log(`  = Objectif ${o.service} : déjà ${o.delaiMinutes} min — ignoré`);
      continue;
    }
    const ancienne = enVigueur?.delaiMinutes ?? null;
    const now = new Date();
    const cree = await db.$transaction(async (tx) => {
      if (enVigueur) {
        await tx.objectifDelai.update({ where: { id: enVigueur.id }, data: { valideAu: now } });
      }
      return tx.objectifDelai.create({
        data: {
          service: o.service,
          typeDossier: null,
          delaiMinutes: o.delaiMinutes,
          valideDu: now,
          motif,
          creeParId: auteur.id,
        },
      });
    });
    await journaliser({
      entite: 'ObjectifDelai', entiteId: cree.id, champ: 'delaiMinutes',
      ancienneValeur: ancienne, nouvelleValeur: o.delaiMinutes,
      action: ancienne === null ? 'CREATION' : 'MODIFICATION',
      objet: `Délai cible ${o.service}`, motif,
      modifiePar: auteur.nom, modifieParId: auteur.id,
    });
    objectifsCrees++;
    console.log(`  + Objectif ${o.service} : ${o.delaiMinutes} min${ancienne === null ? ' (créé)' : ` (remplace ${ancienne} min)`}`);
  }

  // ── 3. Seuils (GLOBAL + 4 services × 4 types) ───────────────────────────────
  let seuilsEcrits = 0;
  for (const service of SERVICES) {
    for (const [typeAlerte, valeur] of Object.entries(SEUILS_VALIDES)) {
      const existant = await db.seuilAlerteKpi.findUnique({
        where: { service_typeAlerte: { service, typeAlerte } },
      });
      if (existant && existant.valeur === valeur) {
        console.log(`  = Seuil ${typeAlerte}/${service} : déjà ${valeur} — ignoré`);
        continue;
      }
      const ancienne = existant?.valeur ?? null;
      const seuil = await db.seuilAlerteKpi.upsert({
        where: { service_typeAlerte: { service, typeAlerte } },
        create: { service, typeAlerte, valeur, modifieParId: auteur.id },
        update: { valeur, modifieParId: auteur.id },
      });
      await journaliser({
        entite: 'SeuilAlerteKpi', entiteId: seuil.id, champ: 'valeur',
        ancienneValeur: ancienne, nouvelleValeur: valeur,
        action: ancienne === null ? 'CREATION' : 'MODIFICATION',
        objet: `Seuil ${typeAlerte} — ${service}`, motif,
        modifiePar: auteur.nom, modifieParId: auteur.id,
      });
      seuilsEcrits++;
      console.log(`  + Seuil ${typeAlerte}/${service} : ${valeur}${ancienne === null ? ' (créé)' : ` (remplace ${ancienne})`}`);
    }
  }

  console.log(`\nTerminé : ${objectifsCrees} objectif(s) et ${seuilsEcrits} seuil(s) tracés dans le journal d'audit.`);
}

main()
  .catch((e) => {
    console.error('Erreur critique :', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
