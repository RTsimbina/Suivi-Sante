/**
 * Backfill KPI — crée les étapes de traçabilité (périodes de responsabilité)
 * pour les dossiers EXISTANTS, à partir des données disponibles :
 *   - dateReception / createdAt → étape ACCUEIL ;
 *   - dateTraitementTechnique → étape TECHNIQUE (fermée à dateReceptionDecompte
 *     ou au rejet) ;
 *   - dateReceptionDecompte → étape COMPTABILITE (fermée à datePaiement ou au
 *     rejet) ;
 *   - userIds dérivés des transitions enregistrées dans Dossier.historique
 *     (JSON) quand elles existent ; sinon responsable = gestionnaire assigné.
 * Idempotent : un dossier ayant déjà des étapes est ignoré. Source = MIGRATION.
 *
 * Sème aussi les OBJECTIFS par défaut (si aucun en vigueur) et les SEUILS
 * d'alerte GLOBAL (si absents). Aucune donnée réelle : à exécuter sur recette.
 *
 * Usage : DATABASE_URL=… npx tsx scripts/backfill-kpi.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

interface EntreeHistorique {
  date?: string;
  statut?: string;
  statutPrecedent?: string;
  commentaire?: string;
  userId?: string;
}

function transitions(dossier: { historique: string }): EntreeHistorique[] {
  try {
    const parse = JSON.parse(dossier.historique || '[]');
    return Array.isArray(parse) ? (parse as EntreeHistorique[]) : [];
  } catch {
    return [];
  }
}

async function seedReferentiel(): Promise<void> {
  const objectifs = [
    { service: 'ACCUEIL', delaiMinutes: 30 },
    { service: 'TECHNIQUE', delaiMinutes: 240 },
    { service: 'CONTROLE_MEDICAL', delaiMinutes: 240 },
    { service: 'COMPTABILITE', delaiMinutes: 120 },
  ];
  for (const o of objectifs) {
    const existant = await db.objectifDelai.findFirst({ where: { service: o.service, typeDossier: null, valideAu: null } });
    if (!existant) {
      await db.objectifDelai.create({
        data: { service: o.service, typeDossier: null, delaiMinutes: o.delaiMinutes, motif: 'Valeurs initiales (exemples configurables, décision métier requise)', creeParId: (await db.utilisateur.findFirst({ where: { role: 'ADMINISTRATEUR' } }))?.id ?? '' },
      });
      console.log(`Objectif semé : ${o.service} = ${o.delaiMinutes} min`);
    }
  }
  const seuils = [
    { typeAlerte: 'PROCHE_CIBLE', valeur: 80 },
    { typeAlerte: 'ACCUMULATION', valeur: 20 },
    { typeAlerte: 'DEGRADATION', valeur: 10 },
    { typeAlerte: 'HAUSSE_RETOURS', valeur: 10 },
  ];
  for (const s of seuils) {
    await db.seuilAlerteKpi.upsert({
      where: { service_typeAlerte: { service: 'GLOBAL', typeAlerte: s.typeAlerte } },
      create: { service: 'GLOBAL', typeAlerte: s.typeAlerte, valeur: s.valeur },
      update: {},
    });
  }
  console.log('Seuils GLOBAL assurés (PROCHE_CIBLE 80 %, ACCUMULATION 20, DEGRADATION 10 pts, HAUSSE_RETOURS 10 %)');
}

async function backfillDossier(d: {
  id: string; statut: string; historique: string; createdAt: Date;
  dateReception: Date; dateTraitementTechnique: Date | null;
  dateReceptionDecompte: Date | null; datePaiement: Date | null;
  gestionnaireAccueilId: string | null; gestionnaireTechniqueId: string | null;
  gestionnaireComptaId: string | null;
}): Promise<number> {
  const existant = await db.etapeTraitement.count({ where: { dossierId: d.id } });
  if (existant > 0) return 0; // idempotent

  const hist = transitions(d);
  const premiereTransitionVers = (statutPrecedent: string, cible?: string[]) =>
    hist.find((h) => h.statutPrecedent === statutPrecedent && (!cible || (h.statut && cible.includes(h.statut))) && h.date);

  let creees = 0;

  // ─── Étape ACCUEIL : réception → première action (transition hors RECU) ──
  const sortieAccueil = premiereTransitionVers('RECU');
  const terminal = ['PAYE', 'REJETE'].includes(d.statut);
  if (sortieAccueil || terminal || d.dateTraitementTechnique) {
    const fin = sortieAccueil?.date ? new Date(sortieAccueil.date)
      : d.dateTraitementTechnique ?? d.dateReceptionDecompte ?? d.datePaiement ?? d.dateReception;
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'ACCUEIL',
        userId: sortieAccueil?.userId ?? null,
        gestionnaireId: d.gestionnaireAccueilId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'RECU', statutApres: sortieAccueil?.statut ?? null,
        dateAffectation: d.dateReception, dateDebut: fin, dateFin: fin,
      },
    });
    creees++;
  } else {
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'ACCUEIL',
        gestionnaireId: d.gestionnaireAccueilId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'RECU',
        dateAffectation: d.dateReception,
      },
    });
    creees++;
  }

  // ─── Étape TECHNIQUE : entrée EN_ANALYSE → sortie (decompte / rejet) ─────
  if (d.dateTraitementTechnique || hist.some((h) => h.statut === 'EN_ANALYSE' && h.date)) {
    const entree = d.dateTraitementTechnique
      ?? new Date(hist.find((h) => h.statut === 'EN_ANALYSE' && h.date)!.date as string);
    const transitionValide = premiereTransitionVers('EN_ANALYSE', ['VALIDE']);
    const sortieTechnique = d.dateReceptionDecompte
      ?? (premiereTransitionVers('VALIDE')?.date ? new Date(premiereTransitionVers('VALIDE')!.date as string) : null)
      ?? (d.statut === 'REJETE' && transitionValide?.date ? new Date(transitionValide.date) : null)
      ?? (terminal ? d.datePaiement ?? entree : null);
    const userIdTechnique = transitionValide?.userId
      ?? hist.find((h) => h.userId && h.statut === 'EN_ANALYSE')?.userId ?? null;
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'TECHNIQUE',
        userId: userIdTechnique,
        gestionnaireId: d.gestionnaireTechniqueId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'EN_ANALYSE',
        statutApres: sortieTechnique ? (d.dateReceptionDecompte ? 'EN_COMPTABILITE' : null) : null,
        dateAffectation: entree,
        dateDebut: sortieTechnique ?? null,
        dateFin: sortieTechnique,
      },
    });
    creees++;
  } else if (['EN_ANALYSE', 'VALIDE'].includes(d.statut)) {
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'TECHNIQUE',
        gestionnaireId: d.gestionnaireTechniqueId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'EN_ANALYSE',
        dateAffectation: d.createdAt,
      },
    });
    creees++;
  }

  // ─── Étape COMPTABILITE : decompte → paiement / rejet ─────────────────────
  if (d.dateReceptionDecompte || hist.some((h) => h.statut === 'EN_COMPTABILITE' && h.date)) {
    const entree = d.dateReceptionDecompte
      ?? new Date(hist.find((h) => h.statut === 'EN_COMPTABILITE' && h.date)!.date as string);
    const finCompta = d.datePaiement
      ?? (d.statut === 'REJETE' && hist.find((h) => h.statutPrecedent?.startsWith('EN_COMPTABILITE') && h.date)
        ? new Date(hist.find((h) => h.statutPrecedent?.startsWith('EN_COMPTABILITE') && h.date)!.date as string)
        : null)
      ?? (terminal ? entree : null);
    const userIdCompta = hist.find((h) => h.userId && h.statut && ['EN_PAIEMENT', 'PAYE'].includes(h.statut))?.userId ?? null;
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'COMPTABILITE',
        userId: userIdCompta,
        gestionnaireId: d.gestionnaireComptaId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'EN_COMPTABILITE',
        statutApres: d.datePaiement ? 'PAYE' : null,
        dateAffectation: entree,
        dateDebut: finCompta ?? null,
        dateFin: finCompta,
      },
    });
    creees++;
  } else if (['EN_COMPTABILITE', 'EN_PAIEMENT'].includes(d.statut)) {
    await db.etapeTraitement.create({
      data: {
        dossierId: d.id, service: 'COMPTABILITE',
        gestionnaireId: d.gestionnaireComptaId,
        type: 'TRAVAIL', source: 'MIGRATION',
        statutAvant: 'EN_COMPTABILITE',
        dateAffectation: d.createdAt,
      },
    });
    creees++;
  }

  return creees;
}

async function main() {
  await seedReferentiel();
  const dossiers = await db.dossier.findMany({
    select: {
      id: true, statut: true, historique: true, createdAt: true,
      dateReception: true, dateTraitementTechnique: true, dateReceptionDecompte: true,
      datePaiement: true, gestionnaireAccueilId: true, gestionnaireTechniqueId: true,
      gestionnaireComptaId: true,
    },
  });
  console.log(`Dossiers à traiter : ${dossiers.length}`);
  let total = 0, touches = 0;
  for (const d of dossiers) {
    const n = await backfillDossier(d);
    if (n > 0) touches++;
    total += n;
  }
  console.log(`Étapes créées : ${total} (dossiers touchés : ${touches}/${dossiers.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
