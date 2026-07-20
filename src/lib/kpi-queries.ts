import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

export function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

const MS_DAY = 86_400_000;

/* ──────────────────────────────────────────────────────────────
   1. Status counts  (1 groupBy)
   ────────────────────────────────────────────────────────────── */

export async function getStatutCounts(): Promise<Record<string, number>> {
  const rows = await db.dossier.groupBy({
    by: ["statut"],
    _count: { statut: true },
  });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.statut] = r._count.statut;
  return map;
}

/* ──────────────────────────────────────────────────────────────
   2. Global aggregate sums  (1 aggregate)
   ────────────────────────────────────────────────────────────── */

export async function getTotalSums(where?: Prisma.DossierWhereInput) {
  const res = await db.dossier.aggregate({
    _sum: { montantReclame: true, montantPaye: true, montantValide: true },
    _count: true,
    where,
  });
  return {
    total: res._count,
    montantReclame: round2(res._sum.montantReclame),
    montantPaye: round2(res._sum.montantPaye),
    montantValide: round2(res._sum.montantValide),
  };
}

/* ──────────────────────────────────────────────────────────────
   3. Per-societe breakdown  (1 groupBy + 1 findMany for names)
   ────────────────────────────────────────────────────────────── */

export async function getSocieteBreakdown(where?: Prisma.DossierWhereInput) {
  const rows = await db.dossier.groupBy({
    by: ["societeId"],
    _count: true,
    _sum: { montantReclame: true, montantPaye: true },
    where,
  });

  const ids = rows.map((r) => r.societeId);
  const societes =
    ids.length > 0
      ? await db.societe.findMany({
          where: { id: { in: ids } },
          select: { id: true, nom: true },
        })
      : [];
  const nomMap = new Map(societes.map((s) => [s.id, s.nom]));

  return rows
    .map((r) => ({
      societeId: r.societeId,
      societeNom: nomMap.get(r.societeId) || "Inconnu",
      nbDossiers: r._count,
      montantReclame: round2(r._sum.montantReclame),
      montantPaye: round2(r._sum.montantPaye),
      coutMoyen:
        r._count > 0 ? round2((r._sum.montantPaye || 0) / r._count) : 0,
    }))
    .sort((a, b) => b.nbDossiers - a.nbDossiers);
}

/* ──────────────────────────────────────────────────────────────
   4. Monthly volume  (1 raw SQL)
   ────────────────────────────────────────────────────────────── */

export async function getMonthlyVolume(year: number) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const rows: { month: string; count: bigint }[] = await db.$queryRaw`
    SELECT TO_CHAR("dateReception", 'YYYY-MM') AS month,
           COUNT(*)::bigint                      AS count
    FROM "Dossier"
    WHERE "dateReception" >= ${startDate}
      AND "dateReception" <  ${endDate}
    GROUP BY month
    ORDER BY month
  `;

  const map = new Map<string, number>();
  for (let m = 1; m <= 12; m++)
    map.set(`${year}-${String(m).padStart(2, "0")}`, 0);
  for (const r of rows) map.set(r.month, Number(r.count));
  return Array.from(map.entries()).map(([mois, nbDossiers]) => ({
    mois,
    nbDossiers,
  }));
}

/* ──────────────────────────────────────────────────────────────
   5. Average delays  (raw SQL – one query each)
   ────────────────────────────────────────────────────────────── */

/** Avg days reception → paiement (PAYE only) */
export async function getAvgDelaiPaiement(): Promise<number> {
  const rows: { avg: number | null }[] = await db.$queryRaw`
    SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM ("datePaiement" - "dateReception")) / 86400), 2), 0) AS avg
    FROM "Dossier"
    WHERE "statut" = 'PAYE' AND "datePaiement" IS NOT NULL AND "dateReception" IS NOT NULL
  `;
  return rows[0]?.avg ?? 0;
}

/** Avg days reception → traitement technique (all with both dates) */
export async function getAvgDelaiTransfert(): Promise<number> {
  const rows: { avg: number | null }[] = await db.$queryRaw`
    SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM ("dateTraitementTechnique" - "dateReception")) / 86400), 2), 0) AS avg
    FROM "Dossier"
    WHERE "dateTraitementTechnique" IS NOT NULL AND "dateReception" IS NOT NULL
  `;
  return rows[0]?.avg ?? 0;
}

/** Avg days reception → traitement technique (EN_ANALYSE / VALIDE / REJETE only) */
export async function getAvgDelaiAnalyse(): Promise<number> {
  const rows: { avg: number | null }[] = await db.$queryRaw`
    SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM ("dateTraitementTechnique" - "dateReception")) / 86400), 2), 0) AS avg
    FROM "Dossier"
    WHERE "statut" IN ('EN_ANALYSE','VALIDE','REJETE')
      AND "dateTraitementTechnique" IS NOT NULL
      AND "dateReception"        IS NOT NULL
  `;
  return rows[0]?.avg ?? 0;
}

/* ──────────────────────────────────────────────────────────────
   6. Gestionnaire productivité  (1 raw SQL – UNION ALL)
   ────────────────────────────────────────────────────────────── */

interface GestionnaireRow {
  gid: string;
  nom: string;
  service: string;
  nb_dossiers: bigint;
  montant_traite: number;
  temps_moyen: number | null;
}

export async function getGestionnaireProductivite() {
  const rows: GestionnaireRow[] = await db.$queryRaw`
    SELECT sub.gid, sub.nom, sub.service,
           COUNT(*)::bigint                                                          AS nb_dossiers,
           ROUND(SUM(COALESCE(sub."montantValide", sub."montantReclame")), 2)       AS montant_traite,
           ROUND(AVG(
             CASE
               WHEN sub.service IN ('RECEPTION','TECHNIQUE')
                 THEN EXTRACT(EPOCH FROM (sub."dateTraitementTechnique" - sub."dateReception")) / 86400
               WHEN sub.service = 'COMPTABILITE'
                 THEN EXTRACT(EPOCH FROM (sub."datePaiement" - sub."dateReception")) / 86400
             END
           ), 2)                                                                     AS temps_moyen
    FROM (
      SELECT d."gestionnaireAccueilId" AS gid, g.nom, 'RECEPTION'     AS service,
             d."montantValide", d."montantReclame",
             d."dateTraitementTechnique", d."dateReception", d."datePaiement"
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireAccueilId" = g.id
      UNION ALL
      SELECT d."gestionnaireTechniqueId" AS gid, g.nom, 'TECHNIQUE'    AS service,
             d."montantValide", d."montantReclame",
             d."dateTraitementTechnique", d."dateReception", d."datePaiement"
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireTechniqueId" = g.id
      UNION ALL
      SELECT d."gestionnaireComptaId"    AS gid, g.nom, 'COMPTABILITE' AS service,
             d."montantValide", d."montantReclame",
             d."dateTraitementTechnique", d."dateReception", d."datePaiement"
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireComptaId" = g.id
    ) sub
    GROUP BY sub.gid, sub.nom, sub.service
    ORDER BY sub.service, nb_dossiers DESC
  `;

  return rows.map((r) => ({
    gestionnaireNom: r.nom,
    service: r.service,
    nbDossiers: Number(r.nb_dossiers),
    montantTraite: round2(r.montant_traite),
    tempsMoyenTraitement: r.temps_moyen ? round2(Number(r.temps_moyen)) : 0,
  }));
}

/* ──────────────────────────────────────────────────────────────
   7. Doublons  (2 raw SQL GROUP BY  → O(n log n))
   ────────────────────────────────────────────────────────────── */

export async function detectDoublons(): Promise<
  { numeroDossier1: string; numeroDossier2: string; beneficiaire: string; motif: string }[]
> {
  const doublons: {
    numeroDossier1: string;
    numeroDossier2: string;
    beneficiaire: string;
    motif: string;
  }[] = [];

  // Rule 1 – same benef + societe + type + dateSoins
  const byDate: { benef: string; nums: string[] }[] = await db.$queryRaw`
    SELECT LOWER(TRIM("beneficiaire"))                              AS benef,
           array_agg("numeroDossier" ORDER BY "numeroDossier")      AS nums
    FROM "Dossier"
    WHERE "beneficiaire" IS NOT NULL AND "dateSoins" IS NOT NULL
    GROUP BY LOWER(TRIM("beneficiaire")), "societeId", "typeDossier", DATE("dateSoins")
    HAVING COUNT(*) > 1
  `;
  for (const g of byDate)
    for (let i = 0; i < g.nums.length; i++)
      for (let j = i + 1; j < g.nums.length; j++)
        doublons.push({
          numeroDossier1: g.nums[i],
          numeroDossier2: g.nums[j],
          beneficiaire: g.benef,
          motif: "M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et date de soins",
        });

  // Rule 2 – same benef + societe + type + montant (> 0)
  const byMontant: { benef: string; nums: string[] }[] = await db.$queryRaw`
    SELECT LOWER(TRIM("beneficiaire"))                              AS benef,
           array_agg("numeroDossier" ORDER BY "numeroDossier")      AS nums
    FROM "Dossier"
    WHERE "beneficiaire" IS NOT NULL AND "montantReclame" > 0
    GROUP BY LOWER(TRIM("beneficiaire")), "societeId", "typeDossier", "montantReclame"
    HAVING COUNT(*) > 1
  `;
  for (const g of byMontant)
    for (let i = 0; i < g.nums.length; i++)
      for (let j = i + 1; j < g.nums.length; j++)
        doublons.push({
          numeroDossier1: g.nums[i],
          numeroDossier2: g.nums[j],
          beneficiaire: g.benef,
          motif: "M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et montant",
        });

  return doublons;
}

/* ──────────────────────────────────────────────────────────────
   8. Retards  (4 targeted findMany, not full scan)
   ────────────────────────────────────────────────────────────── */

export async function findRetards() {
  const NOW = new Date();
  const diffD = (a: Date, b: Date) =>
    Math.round((a.getTime() - b.getTime()) / MS_DAY);

  const retards: {
    numeroDossier: string;
    beneficiaire: string;
    statut: string;
    joursRetard: number;
    serviceEnCause: string;
  }[] = [];

  // RECU > 5j
  const r1 = await db.dossier.findMany({
    where: { statut: "RECU", dateReception: { lt: new Date(NOW.getTime() - 4 * MS_DAY) } },
    select: { numeroDossier: true, beneficiaire: true, statut: true, dateReception: true },
  });
  for (const d of r1) {
    const j = diffD(NOW, d.dateReception);
    if (j > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: j - 5, serviceEnCause: "RECEPTION" });
  }

  // EN_ANALYSE > 10j
  const r2 = await db.dossier.findMany({
    where: { statut: "EN_ANALYSE", dateTraitementTechnique: { lt: new Date(NOW.getTime() - 9 * MS_DAY) } },
    select: { numeroDossier: true, beneficiaire: true, statut: true, dateTraitementTechnique: true },
  });
  for (const d of r2) {
    const j = diffD(NOW, d.dateTraitementTechnique!);
    if (j > 10) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: j - 10, serviceEnCause: "TECHNIQUE" });
  }

  // VALIDE > 5j
  const r3 = await db.dossier.findMany({
    where: { statut: "VALIDE", dateTraitementTechnique: { lt: new Date(NOW.getTime() - 4 * MS_DAY) } },
    select: { numeroDossier: true, beneficiaire: true, statut: true, dateTraitementTechnique: true },
  });
  for (const d of r3) {
    const j = diffD(NOW, d.dateTraitementTechnique!);
    if (j > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: j - 5, serviceEnCause: "TECHNIQUE" });
  }

  // EN_PAIEMENT > 5j
  const r4 = await db.dossier.findMany({
    where: { statut: "EN_PAIEMENT", dateReceptionDecompte: { lt: new Date(NOW.getTime() - 4 * MS_DAY) } },
    select: { numeroDossier: true, beneficiaire: true, statut: true, dateReceptionDecompte: true },
  });
  for (const d of r4) {
    const j = diffD(NOW, d.dateReceptionDecompte!);
    if (j > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: j - 5, serviceEnCause: "COMPTABILITE" });
  }

  retards.sort((a, b) => b.joursRetard - a.joursRetard);
  return retards;
}

/* ──────────────────────────────────────────────────────────────
   9. Anomalies  (1 targeted findMany)
   ────────────────────────────────────────────────────────────── */

export async function findAnomalies() {
  const NOW = new Date();
  const diffD = (a: Date, b: Date) =>
    Math.round((a.getTime() - b.getTime()) / MS_DAY);
  const seuilDecompte = new Date(NOW.getTime() - 14 * MS_DAY);

  const anomalies: { numeroDossier: string; typeAnomalie: string; details: string }[] = [];

  const candidates = await db.dossier.findMany({
    where: {
      OR: [
        { montantValide: { gt: 0 }, montantPaye: { not: null } },
        { statut: "VALIDE", dateReceptionDecompte: null, dateTraitementTechnique: { not: null, lt: seuilDecompte } },
        { montantReclame: { lt: 0 } },
        { montantValide: { lt: 0 } },
        { montantPaye: { lt: 0 } },
      ],
    },
    select: {
      numeroDossier: true, montantReclame: true, montantValide: true, montantPaye: true,
      statut: true, dateTraitementTechnique: true, dateReceptionDecompte: true,
    },
  });

  for (const d of candidates) {
    if (d.montantValide && d.montantValide > 0 && d.montantPaye != null) {
      const ecart = Math.abs(d.montantPaye - d.montantValide) / d.montantValide;
      if (ecart > 0.1)
        anomalies.push({
          numeroDossier: d.numeroDossier, typeAnomalie: "ECART_MONTANT",
          details: `Montant valid\u00e9: ${d.montantValide} Ar, pay\u00e9: ${d.montantPaye} Ar (\u00e9cart ${Math.round(ecart * 100)}%)`,
        });
    }
    if (d.statut === "VALIDE" && !d.dateReceptionDecompte && d.dateTraitementTechnique) {
      const jours = diffD(NOW, d.dateTraitementTechnique);
      if (jours > 15)
        anomalies.push({
          numeroDossier: d.numeroDossier, typeAnomalie: "DECOMPTE_MANQUANT",
          details: `Valid\u00e9 depuis ${jours} jours sans d\u00e9compte.`,
        });
    }
    if (d.montantReclame < 0)
      anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant r\u00e9clam\u00e9 n\u00e9gatif: ${d.montantReclame} Ar` });
    if (d.montantValide != null && d.montantValide < 0)
      anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant valid\u00e9 n\u00e9gatif: ${d.montantValide} Ar` });
    if (d.montantPaye != null && d.montantPaye < 0)
      anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant pay\u00e9 n\u00e9gatif: ${d.montantPaye} Ar` });
  }

  return anomalies;
}

/* ──────────────────────────────────────────────────────────────
   10. Incohérences  (5 targeted findMany in parallel)
   ────────────────────────────────────────────────────────────── */

export async function findIncoherences() {
  const incoherences: { numeroDossier: string; typeIncoherence: string; description: string }[] = [];

  const [a, b, c, d, e] = await Promise.all([
    db.dossier.findMany({ where: { statut: "PAYE", OR: [{ montantPaye: null }, { montantPaye: 0 }] }, select: { numeroDossier: true } }),
    db.dossier.findMany({ where: { statut: "EN_PAIEMENT", dateReceptionDecompte: null }, select: { numeroDossier: true } }),
    db.dossier.findMany({ where: { statut: "VALIDE", OR: [{ montantValide: null }, { montantValide: 0 }] }, select: { numeroDossier: true } }),
    db.dossier.findMany({ where: { statut: "REJETE", OR: [{ motifRejet: null }, { motifRejet: "" }] }, select: { numeroDossier: true } }),
    db.dossier.findMany({ where: { datePaiement: { not: null as unknown as Date }, dateReception: { not: null as unknown as Date } }, select: { numeroDossier: true, datePaiement: true, dateReception: true } }),
  ]);

  for (const r of a) incoherences.push({ numeroDossier: r.numeroDossier, typeIncoherence: "PAYE_SANS_MONTANT", description: "Pay\u00e9 sans montant" });
  for (const r of b) incoherences.push({ numeroDossier: r.numeroDossier, typeIncoherence: "PAIEMENT_SANS_DECOMPTE", description: "En paiement sans d\u00e9compte" });
  for (const r of c) incoherences.push({ numeroDossier: r.numeroDossier, typeIncoherence: "VALIDE_SANS_MONTANT", description: "Valid\u00e9 sans montant" });
  for (const r of d) incoherences.push({ numeroDossier: r.numeroDossier, typeIncoherence: "REJET_SANS_MOTIF", description: "Rejet\u00e9 sans motif" });
  for (const r of e) {
    if (r.datePaiement! < r.dateReception!)
      incoherences.push({ numeroDossier: r.numeroDossier, typeIncoherence: "DATE_INCOHERENTE", description: "Date paiement ant\u00e9rieure \u00e0 la r\u00e9ception" });
  }

  incoherences.sort((a, b) => a.typeIncoherence.localeCompare(b.typeIncoherence) || a.numeroDossier.localeCompare(b.numeroDossier));
  return incoherences;
}

/* ──────────────────────────────────────────────────────────────
   11. Pièces justificatives manquantes  (1 findMany)
   ────────────────────────────────────────────────────────────── */

export async function findPiecesManquantes() {
  const NOW = new Date();
  const diffD = (a: Date, b: Date) =>
    Math.round((a.getTime() - b.getTime()) / MS_DAY);

  const dossiers = await db.dossier.findMany({
    where: {
      statut: "EN_ANALYSE",
      dateTraitementTechnique: { lt: new Date(NOW.getTime() - 2 * MS_DAY) },
      justificatifs: { none: {} },
    },
    select: { numeroDossier: true, beneficiaire: true, societeId: true, dateTraitementTechnique: true },
  });

  const ids = [...new Set(dossiers.map((d) => d.societeId))];
  const societes =
    ids.length > 0
      ? await db.societe.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
      : [];
  const sMap = new Map(societes.map((s) => [s.id, s.nom]));

  return dossiers
    .map((d) => {
      const jours = diffD(NOW, d.dateTraitementTechnique!);
      if (jours <= 3) return null;
      return {
        numeroDossier: d.numeroDossier,
        beneficiaire: d.beneficiaire,
        societeNom: sMap.get(d.societeId) || "Inconnu",
        joursEnAnalyse: jours,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.joursEnAnalyse - a.joursEnAnalyse);
}

/* ──────────────────────────────────────────────────────────────
   12. Gestionnaire charge (active dossiers)  (1 raw SQL)
   ────────────────────────────────────────────────────────────── */

interface ChargeRow {
  nom: string;
  service: string;
  dossiers_actifs: bigint;
}

export async function getGestionnaireCharge() {
  const rows: ChargeRow[] = await db.$queryRaw`
    SELECT sub.nom, sub.service, COUNT(*)::bigint AS dossiers_actifs
    FROM (
      SELECT d."gestionnaireAccueilId" AS gid, g.nom, 'RECEPTION' AS service
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireAccueilId" = g.id
      WHERE d."statut" NOT IN ('PAYE','REJETE')
      UNION ALL
      SELECT d."gestionnaireTechniqueId" AS gid, g.nom, 'TECHNIQUE' AS service
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireTechniqueId" = g.id
      WHERE d."statut" NOT IN ('PAYE','REJETE')
      UNION ALL
      SELECT d."gestionnaireComptaId" AS gid, g.nom, 'COMPTABILITE' AS service
      FROM "Dossier" d JOIN "Gestionnaire" g ON d."gestionnaireComptaId" = g.id
      WHERE d."statut" NOT IN ('PAYE','REJETE')
    ) sub
    GROUP BY sub.nom, sub.service
    ORDER BY sub.service
  `;

  return rows.map((r) => ({
    nom: r.nom,
    service: r.service,
    dossiersActifs: Number(r.dossiers_actifs),
  }));
}