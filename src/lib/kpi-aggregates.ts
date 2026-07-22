/**
 * kpi-aggregates.ts — Helpers d'agrégation SQL-bornées
 * Remplace les patterns findMany + filter + reduce par des requêtes
 * Prisma count / aggregate / groupBy / $queryRaw.
 */
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Utilitaires ──────────────────────────────────────────────────

function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ── Types publics ────────────────────────────────────────────────

export interface KpiDirection {
  totalRecus: number;
  totalTraites: number;
  totalPayes: number;
  totalRejetes: number;
  delaiMoyenGlobal: number;
  montantTotalReclame: number;
  montantTotalPaye: number;
  tauxRejet: number;
}

export interface KpiReception {
  totalEnregistres: number;
  tempsMoyenAvantTransfert: number;
  enAttente: number;
}

export interface KpiTechnique {
  totalAnalyses: number;
  totalValides: number;
  totalRejetes: number;
  delaiMoyenAnalyse: number;
  montantTotalValide: number;
  enCours: number;
}

export interface KpiComptabilite {
  decomptesRecus: number;
  paiementsEffectues: number;
  montantTotalPaye: number;
  enCoursPaiement: number;
}

export interface ProductiviteRow {
  gestionnaireNom: string;
  service: string;
  nbDossiers: number;
  montantTraite: number;
  tempsMoyenTraitement: number;
}

export interface ParSocieteRow {
  societeNom: string;
  nbDossiers: number;
  montantReclame: number;
  montantPaye: number;
  coutMoyen: number;
}

export interface VolumeMensuelRow {
  mois: string;
  nbDossiers: number;
}

export interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

/** Construit un filtre Prisma optionnel pour plage de dates */
function buildDateWhere(dr?: DateRange): Prisma.DossierWhereInput {
  if (!dr?.startDate && !dr?.endDate) return {};
  const w: Prisma.DossierWhereInput = {};
  if (dr.startDate || dr.endDate) {
    w.dateReception = {};
    if (dr.startDate) w.dateReception.gte = dr.startDate;
    if (dr.endDate) w.dateReception.lt = dr.endDate;
  }
  return w;
}

// ── Compteurs par statut (une seule requête groupBy) ────────────

export async function countByStatut(extraWhere?: Prisma.DossierWhereInput) {
  const rows = await db.dossier.groupBy({
    by: ["statut"],
    _count: { id: true },
    where: extraWhere,
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.statut, r._count.id);
  return map;
}

// ── Sommes globales ─────────────────────────────────────────────

export async function globalSums(extraWhere?: Prisma.DossierWhereInput) {
  const [sumAll, sumValide] = await Promise.all([
    db.dossier.aggregate({
      _sum: { montantReclame: true, montantPaye: true },
      where: extraWhere,
    }),
    db.dossier.aggregate({
      _sum: { montantValide: true },
      where: { ...(extraWhere || {}), statut: "VALIDE" },
    }),
  ]);
  return {
    montantTotalReclame: round2(sumAll._sum.montantReclame),
    montantTotalPaye: round2(sumAll._sum.montantPaye),
    montantTotalValide: round2(sumValide._sum.montantValide),
  };
}

// ── Délai moyen (réception → paiement) via SQL ──────────────────

async function avgDelaiPaiement(dr?: DateRange) {
  type Row = { avg_days: number | null };
  const rows = await db.$queryRaw<Row[]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("datePaiement" - "dateReception")) / 86400)::float AS "avg_days"
    FROM "Dossier"
    WHERE "statut" = 'PAYE'
      AND "datePaiement" IS NOT NULL
      AND "dateReception" IS NOT NULL
      ${dr?.startDate ? Prisma.sql`AND "dateReception" >= ${dr.startDate}` : Prisma.empty}
      ${dr?.endDate ? Prisma.sql`AND "dateReception" < ${dr.endDate}` : Prisma.empty}
  `;
  return round2(rows[0]?.avg_days);
}

// ── Délai moyen (réception → traitement technique) via SQL ──────

async function avgDelaiTransfert(dr?: DateRange) {
  type Row = { avg_days: number | null };
  const rows = await db.$queryRaw<Row[]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("dateTraitementTechnique" - "dateReception")) / 86400)::float AS "avg_days"
    FROM "Dossier"
    WHERE "dateTraitementTechnique" IS NOT NULL
      AND "dateReception" IS NOT NULL
      ${dr?.startDate ? Prisma.sql`AND "dateReception" >= ${dr.startDate}` : Prisma.empty}
      ${dr?.endDate ? Prisma.sql`AND "dateReception" < ${dr.endDate}` : Prisma.empty}
  `;
  return round2(rows[0]?.avg_days);
}

async function avgDelaiAnalyse(dr?: DateRange) {
  type Row = { avg_days: number | null };
  const rows = await db.$queryRaw<Row[]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("dateTraitementTechnique" - "dateReception")) / 86400)::float AS "avg_days"
    FROM "Dossier"
    WHERE "statut" IN ('EN_ANALYSE', 'VALIDE', 'REJETE')
      AND "dateTraitementTechnique" IS NOT NULL
      AND "dateReception" IS NOT NULL
      ${dr?.startDate ? Prisma.sql`AND "dateReception" >= ${dr.startDate}` : Prisma.empty}
      ${dr?.endDate ? Prisma.sql`AND "dateReception" < ${dr.endDate}` : Prisma.empty}
  `;
  return round2(rows[0]?.avg_days);
}

// ── Par société (groupBy sur societeId) ──────────────────────────

export async function parSocieteAgg(extraWhere?: Prisma.DossierWhereInput): Promise<ParSocieteRow[]> {
  const rows = await db.dossier.groupBy({
    by: ["societeId"],
    _count: { id: true },
    _sum: { montantReclame: true, montantPaye: true },
    where: extraWhere,
  });

  const societeIds = rows.map((r) => r.societeId);
  const societes =
    societeIds.length > 0
      ? await db.societe.findMany({
          where: { id: { in: societeIds } },
          select: { id: true, nom: true },
        })
      : [];
  const nomMap = new Map(societes.map((s) => [s.id, s.nom]));

  return rows.map((r) => {
    const nb = r._count.id;
    const paye = round2(r._sum.montantPaye);
    return {
      societeNom: nomMap.get(r.societeId) || r.societeId,
      nbDossiers: nb,
      montantReclame: round2(r._sum.montantReclame),
      montantPaye: paye,
      coutMoyen: nb > 0 ? round2(paye / nb) : 0,
    };
  });
}

// ── Volume mensuel pour une année donnée ─────────────────────────

export async function volumeMensuel(annee: number): Promise<VolumeMensuelRow[]> {
  type Row = { mois: string; nbDossiers: number };
  const rows = await db.$queryRaw<Row[]>`
    SELECT TO_CHAR("dateReception", 'YYYY-MM') AS mois, COUNT(*)::int AS "nbDossiers"
    FROM "Dossier"
    WHERE EXTRACT(YEAR FROM "dateReception") = ${annee}
    GROUP BY TO_CHAR("dateReception", 'YYYY-MM')
    ORDER BY mois
  `;

  const result: VolumeMensuelRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${annee}-${String(m).padStart(2, "0")}`;
    const found = rows.find((r) => r.mois === key);
    result.push({ mois: key, nbDossiers: found?.nbDossiers || 0 });
  }
  return result;
}

// ── Productivité par gestionnaire (SQL) ──────────────────────────

export async function productiviteGestionnaires(): Promise<ProductiviteRow[]> {
  type Row = {
    gestionnaireNom: string;
    service: string;
    nbDossiers: number;
    montantTraite: number;
    tempsMoyenTraitement: number | null;
  };

  const [accueil, technique, compta] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT
        g."nom" AS "gestionnaireNom",
        'RECEPTION' AS service,
        COUNT(d."id")::int AS "nbDossiers",
        COALESCE(SUM(COALESCE(d."montantValide", d."montantReclame")), 0)::float AS "montantTraite",
        AVG(EXTRACT(EPOCH FROM (d."dateTraitementTechnique" - d."dateReception")) / 86400)::float AS "tempsMoyenTraitement"
      FROM "Dossier" d
      JOIN "Gestionnaire" g ON g."id" = d."gestionnaireAccueilId"
      WHERE d."gestionnaireAccueilId" IS NOT NULL
        AND d."dateTraitementTechnique" IS NOT NULL
        AND d."dateReception" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
    db.$queryRaw<Row[]>`
      SELECT
        g."nom" AS "gestionnaireNom",
        'TECHNIQUE' AS service,
        COUNT(d."id")::int AS "nbDossiers",
        COALESCE(SUM(COALESCE(d."montantValide", d."montantReclame")), 0)::float AS "montantTraite",
        AVG(EXTRACT(EPOCH FROM (d."dateTraitementTechnique" - d."dateReception")) / 86400)::float AS "tempsMoyenTraitement"
      FROM "Dossier" d
      JOIN "Gestionnaire" g ON g."id" = d."gestionnaireTechniqueId"
      WHERE d."gestionnaireTechniqueId" IS NOT NULL
        AND d."dateTraitementTechnique" IS NOT NULL
        AND d."dateReception" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
    db.$queryRaw<Row[]>`
      SELECT
        g."nom" AS "gestionnaireNom",
        'COMPTABILITE' AS service,
        COUNT(d."id")::int AS "nbDossiers",
        COALESCE(SUM(COALESCE(d."montantValide", d."montantReclame")), 0)::float AS "montantTraite",
        AVG(EXTRACT(EPOCH FROM (d."datePaiement" - d."dateReception")) / 86400)::float AS "tempsMoyenTraitement"
      FROM "Dossier" d
      JOIN "Gestionnaire" g ON g."id" = d."gestionnaireComptaId"
      WHERE d."gestionnaireComptaId" IS NOT NULL
        AND d."datePaiement" IS NOT NULL
        AND d."dateReception" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
  ]);

  return [...accueil, ...technique, ...compta].map((r) => ({
    gestionnaireNom: r.gestionnaireNom,
    service: r.service,
    nbDossiers: r.nbDossiers,
    montantTraite: round2(r.montantTraite),
    tempsMoyenTraitement: round2(r.tempsMoyenTraitement),
  }));
}

// ── KPI complets — helpers composés ─────────────────────────────

export async function getDirectionKpis(dr?: DateRange): Promise<KpiDirection> {
  const dateWhere = buildDateWhere(dr);
  const [statutMap, sums, delai, total] = await Promise.all([
    countByStatut(dateWhere),
    globalSums(dateWhere),
    avgDelaiPaiement(dr),
    db.dossier.count({ where: dateWhere }),
  ]);

  const totalRecus = statutMap.get("RECU") || 0;
  const totalPayes = statutMap.get("PAYE") || 0;
  const totalRejetes = statutMap.get("REJETE") || 0;
  const totalTraites =
    (statutMap.get("VALIDE") || 0) + totalRejetes + totalPayes;

  return {
    totalRecus,
    totalTraites,
    totalPayes,
    totalRejetes,
    delaiMoyenGlobal: delai,
    montantTotalReclame: sums.montantTotalReclame,
    montantTotalPaye: sums.montantTotalPaye,
    tauxRejet: total > 0 ? round2((totalRejetes / total) * 100) : 0,
  };
}

export async function getReceptionKpis(dr?: DateRange): Promise<KpiReception> {
  const dateWhere = buildDateWhere(dr);
  const [totalEnregistres, delai, totalRecus] = await Promise.all([
    db.dossier.count({ where: dateWhere }),
    avgDelaiTransfert(dr),
    db.dossier.count({ where: { ...dateWhere, statut: "RECU" } }),
  ]);
  return { totalEnregistres, tempsMoyenAvantTransfert: delai, enAttente: totalRecus };
}

export async function getTechniqueKpis(dr?: DateRange): Promise<KpiTechnique> {
  const dateWhere = buildDateWhere(dr);
  const [statutMap, delai, sums] = await Promise.all([
    countByStatut(dateWhere),
    avgDelaiAnalyse(dr),
    globalSums(dateWhere),
  ]);

  const totalValides = statutMap.get("VALIDE") || 0;
  const totalRejetes = statutMap.get("REJETE") || 0;
  const totalAnalyses = (statutMap.get("EN_ANALYSE") || 0) + totalValides + totalRejetes;
  const enCours = statutMap.get("EN_ANALYSE") || 0;

  return {
    totalAnalyses,
    totalValides,
    totalRejetes,
    delaiMoyenAnalyse: delai,
    montantTotalValide: sums.montantTotalValide,
    enCours,
  };
}

export async function getComptabiliteKpis(dr?: DateRange): Promise<KpiComptabilite> {
  const dateWhere = buildDateWhere(dr);
  const [statutMap, sumPaye] = await Promise.all([
    countByStatut(dateWhere),
    db.dossier.aggregate({
      _sum: { montantPaye: true },
      where: { ...dateWhere, statut: "PAYE" },
    }),
  ]);

  const decomptesRecus = (statutMap.get("EN_PAIEMENT") || 0) + (statutMap.get("PAYE") || 0);
  const paiementsEffectues = statutMap.get("PAYE") || 0;
  const enCoursPaiement = statutMap.get("EN_PAIEMENT") || 0;

  return {
    decomptesRecus,
    paiementsEffectues,
    montantTotalPaye: round2(sumPaye._sum.montantPaye),
    enCoursPaiement,
  };
}

// ── Retards (requêtes ciblées par statut + seuil de date) ───────

export async function fetchRetards() {
  const now = new Date();
  const cinqJours = new Date(now.getTime() - 5 * 86400000);
  const dixJours = new Date(now.getTime() - 10 * 86400000);

  const [retardsReception, retardsAnalyse, retardsValide, retardsPaiement] = await Promise.all([
    db.dossier.findMany({
      where: { statut: "RECU", dateReception: { lt: cinqJours } },
      select: { numeroDossier: true, beneficiaire: true, statut: true, dateReception: true },
    }),
    db.dossier.findMany({
      where: { statut: "EN_ANALYSE", dateTraitementTechnique: { lt: dixJours } },
      select: { numeroDossier: true, beneficiaire: true, statut: true, dateTraitementTechnique: true },
    }),
    db.dossier.findMany({
      where: { statut: "VALIDE", dateTraitementTechnique: { lt: cinqJours } },
      select: { numeroDossier: true, beneficiaire: true, statut: true, dateTraitementTechnique: true },
    }),
    db.dossier.findMany({
      where: { statut: "EN_PAIEMENT", dateReceptionDecompte: { lt: cinqJours } },
      select: { numeroDossier: true, beneficiaire: true, statut: true, dateReceptionDecompte: true },
    }),
  ]);

  const retards: { numeroDossier: string; beneficiaire: string; statut: string; joursRetard: number; serviceEnCause: string }[] = [];
  const diff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

  for (const d of retardsReception) {
    const jours = diff(now, d.dateReception);
    retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "RECEPTION" });
  }
  for (const d of retardsAnalyse) {
    const jours = diff(now, d.dateTraitementTechnique!);
    retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 10, serviceEnCause: "TECHNIQUE" });
  }
  for (const d of retardsValide) {
    const jours = diff(now, d.dateTraitementTechnique!);
    retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "TECHNIQUE" });
  }
  for (const d of retardsPaiement) {
    const jours = diff(now, d.dateReceptionDecompte!);
    retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "COMPTABILITE" });
  }

  retards.sort((a, b) => b.joursRetard - a.joursRetard);
  return retards;
}

// ── Anomalies (requêtes SQL ciblées) ────────────────────────────

export async function fetchAnomalies() {
  const now = new Date();
  const quinzeJours = new Date(now.getTime() - 15 * 86400000);
  const anomalies: { numeroDossier: string; typeAnomalie: string; details: string }[] = [];

  // ECART_MONTANT — écart > 10% entre montantValide et montantPaye
  type EcartRow = { numeroDossier: string; montantValide: number; montantPaye: number };
  const ecarts = await db.$queryRaw<EcartRow[]>`
    SELECT "numeroDossier", "montantValide", "montantPaye"
    FROM "Dossier"
    WHERE "montantPaye" IS NOT NULL
      AND "montantValide" IS NOT NULL
      AND "montantValide" > 0
      AND ABS("montantPaye" - "montantValide") / "montantValide" > 0.1
  `;
  for (const r of ecarts) {
    const ecart = Math.round((Math.abs(r.montantPaye - r.montantValide) / r.montantValide) * 100);
    anomalies.push({
      numeroDossier: r.numeroDossier,
      typeAnomalie: "ECART_MONTANT",
      details: `Montant valid\u00e9: ${r.montantValide} Ar, montant pay\u00e9: ${r.montantPaye} Ar (\u00e9cart de ${ecart}%)`,
    });
  }

  // DECOMPTE_MANQUANT — VALIDE sans décompte depuis > 15 jours
  const decompeteManquants = await db.dossier.findMany({
    where: {
      statut: "VALIDE",
      dateReceptionDecompte: null,
      dateTraitementTechnique: { lt: quinzeJours },
    },
    select: { numeroDossier: true, dateTraitementTechnique: true },
  });
  for (const d of decompeteManquants) {
    const jours = Math.round((now.getTime() - d.dateTraitementTechnique!.getTime()) / 86400000);
    anomalies.push({
      numeroDossier: d.numeroDossier,
      typeAnomalie: "DECOMPTE_MANQUANT",
      details: `Dossier valid\u00e9 depuis ${jours} jours sans r\u00e9ception de d\u00e9compte. Service comptabilit\u00e9 en attente.`,
    });
  }

  // MONTANT_NEGATIF
  const negatifs = await db.dossier.findMany({
    where: { OR: [
      { montantReclame: { lt: 0 } },
      { montantValide: { lt: 0 } },
      { montantPaye: { lt: 0 } },
    ]},
    select: { numeroDossier: true, montantReclame: true, montantValide: true, montantPaye: true },
  });
  for (const d of negatifs) {
    if (d.montantReclame < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant r\u00e9clam\u00e9 n\u00e9gatif: ${d.montantReclame} Ar` });
    if (d.montantValide !== null && d.montantValide < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant valid\u00e9 n\u00e9gatif: ${d.montantValide} Ar` });
    if (d.montantPaye !== null && d.montantPaye < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant pay\u00e9 n\u00e9gatif: ${d.montantPaye} Ar` });
  }

  return anomalies;
}

// ── Pièces justificatives manquantes ────────────────────────────

export async function fetchPiecesManquantes() {
  const now = new Date();
  const troisJours = new Date(now.getTime() - 3 * 86400000);

  const dossiers = await db.dossier.findMany({
    where: {
      statut: "EN_ANALYSE",
      dateTraitementTechnique: { lt: troisJours },
      justificatifs: { none: {} },
    },
    select: {
      numeroDossier: true,
      beneficiaire: true,
      dateTraitementTechnique: true,
      societe: { select: { nom: true } },
    },
  });

  return dossiers
    .map((d) => ({
      numeroDossier: d.numeroDossier,
      beneficiaire: d.beneficiaire,
      societeNom: d.societe.nom,
      joursEnAnalyse: Math.round((now.getTime() - d.dateTraitementTechnique!.getTime()) / 86400000),
    }))
    .sort((a, b) => b.joursEnAnalyse - a.joursEnAnalyse);
}

// ── Incohérences de traitement ──────────────────────────────────

export async function fetchIncoherences() {
  const [payeSansMontant, paiementSansDecompte, valideSansMontant, rejeteSansMotif, dateIncoherente] = await Promise.all([
    db.dossier.findMany({
      where: { statut: "PAYE", OR: [{ montantPaye: null }, { montantPaye: 0 }] },
      select: { numeroDossier: true },
    }),
    db.dossier.findMany({
      where: { statut: "EN_PAIEMENT", dateReceptionDecompte: null },
      select: { numeroDossier: true },
    }),
    db.dossier.findMany({
      where: { statut: "VALIDE", OR: [{ montantValide: null }, { montantValide: 0 }] },
      select: { numeroDossier: true },
    }),
    db.dossier.findMany({
      where: { statut: "REJETE", OR: [{ motifRejet: null }, { motifRejet: "" }] },
      select: { numeroDossier: true },
    }),
    db.$queryRaw<{ numeroDossier: string; datePaiement: string; dateReception: string }[]>`
      SELECT "numeroDossier", "datePaiement"::text, "dateReception"::text
      FROM "Dossier"
      WHERE "datePaiement" IS NOT NULL AND "dateReception" IS NOT NULL
        AND "datePaiement" < "dateReception"
    `,
  ]);

  const incoherences: { numeroDossier: string; typeIncoherence: string; description: string }[] = [];

  for (const d of payeSansMontant) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "PAYE_SANS_MONTANT", description: "Dossier marqu\u00e9 comme pay\u00e9 mais sans montant de paiement renseign\u00e9." });
  for (const d of paiementSansDecompte) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "PAIEMENT_SANS_DECOMPTE", description: "Dossier en paiement mais aucune date de r\u00e9ception de d\u00e9compte n'est renseign\u00e9e." });
  for (const d of valideSansMontant) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "VALIDE_SANS_MONTANT", description: "Dossier marqu\u00e9 comme valid\u00e9 mais sans montant valid\u00e9 renseign\u00e9." });
  for (const d of rejeteSansMotif) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "REJET_SANS_MOTIF", description: "Dossier rejet\u00e9 sans motif de rejet renseign\u00e9." });
  for (const d of dateIncoherente) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "DATE_INCOHERENTE", description: `La date de paiement (${d.datePaiement.split("T")[0]}) est ant\u00e9rieure \u00e0 la date de r\u00e9ception (${d.dateReception.split("T")[0]}).` });

  incoherences.sort((a, b) => a.typeIncoherence.localeCompare(b.typeIncoherence) || a.numeroDossier.localeCompare(b.numeroDossier));
  return incoherences;
}

// ── Charge par gestionnaire (dossiers actifs non terminaux) ──────

export async function chargeParGestionnaire() {
  type Row = { nom: string; service: string; nbDossiers: number };

  const [accueil, technique, compta] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT g."nom", 'RECEPTION' AS service, COUNT(d."id")::int AS "nbDossiers"
      FROM "Dossier" d JOIN "Gestionnaire" g ON g."id" = d."gestionnaireAccueilId"
      WHERE d."statut" NOT IN ('PAYE', 'REJETE') AND d."gestionnaireAccueilId" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
    db.$queryRaw<Row[]>`
      SELECT g."nom", 'TECHNIQUE' AS service, COUNT(d."id")::int AS "nbDossiers"
      FROM "Dossier" d JOIN "Gestionnaire" g ON g."id" = d."gestionnaireTechniqueId"
      WHERE d."statut" NOT IN ('PAYE', 'REJETE') AND d."gestionnaireTechniqueId" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
    db.$queryRaw<Row[]>`
      SELECT g."nom", 'COMPTABILITE' AS service, COUNT(d."id")::int AS "nbDossiers"
      FROM "Dossier" d JOIN "Gestionnaire" g ON g."id" = d."gestionnaireComptaId"
      WHERE d."statut" NOT IN ('PAYE', 'REJETE') AND d."gestionnaireComptaId" IS NOT NULL
      GROUP BY g."id", g."nom"
    `,
  ]);

  return [...accueil, ...technique, ...compta];
}

// ── Volume moyen mensuel (pour prévisions IA) ────────────────────

export async function volumeMoyenMensuelPourAnnee(annee: number, maxMois: number = 6) {
  type Row = { nb: number; mois_count: number };
  const rows = await db.$queryRaw<Row[]>`
    SELECT
      COUNT(*)::int AS nb,
      COUNT(DISTINCT EXTRACT(MONTH FROM "dateReception"))::int AS "mois_count"
    FROM "Dossier"
    WHERE EXTRACT(YEAR FROM "dateReception") = ${annee}
      AND EXTRACT(MONTH FROM "dateReception") <= ${maxMois}
  `;
  const total = rows[0]?.nb || 0;
  const mois = rows[0]?.mois_count || 0;
  return mois > 0 ? Math.round(total / mois) : 0;
}