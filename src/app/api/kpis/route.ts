import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import {
  getStatutCounts, getTotalSums, getSocieteBreakdown, getMonthlyVolume,
  getAvgDelaiPaiement, getAvgDelaiTransfert, getAvgDelaiAnalyse,
  getGestionnaireProductivite, round2,
} from "@/lib/kpi-queries";
import { plageDepuisParams, filtreDateChamp } from "@/lib/periodes";
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSociete,
} from "@/lib/data-isolation";
import type { Prisma } from "@prisma/client";

/** Fusionne plusieurs `where` en un seul (AND). Les objets vides sont ignorés. */
function combinerWhere(...wheres: Prisma.DossierWhereInput[]): Prisma.DossierWhereInput {
  const nonVides = wheres.filter((w) => w && Object.keys(w).length > 0);
  if (nonVides.length === 0) return {};
  if (nonVides.length === 1) return nonVides[0];
  return { AND: nonVides };
}

/** Wrap an async call so one failure doesn't kill the whole response */
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[KPI] ${label} failed:`, err);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const emptyStatuts: Record<string, number> = {};
    const emptySums = { total: 0, montantReclame: 0, montantPaye: 0, montantValide: 0 };
    const emptySociete: { societeId: string; societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[] = [];
    const emptyMonthly: { mois: string; nbDossiers: number }[] = [];
    const emptyProductivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[] = [];

    const currentYear = new Date().getFullYear();
    const yearParam = request.nextUrl.searchParams.get('annee');
    const annee = yearParam ? parseInt(yearParam, 10) : currentYear;

    // ─── Isolation des données : périmètre société forcé depuis le JWT ────
    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    // ─── Filtre de période réutilisable (date de référence : Dossier.dateReception) ───
    // Fusionné avec le périmètre : la période ne peut jamais élargir l'accès aux données.
    const plage = plageDepuisParams(request.nextUrl.searchParams);
    const where = avecPerimetreSociete(filtreDateChamp('dateReception', plage), perimetre);

    const [statuts, sums, parSociete, volumeMensuel, delaiPaiement, delaiTransfert, delaiAnalyse, productivite] =
      await Promise.all([
        safe("getStatutCounts", () => getStatutCounts(where), emptyStatuts),
        safe("getTotalSums", () => getTotalSums(where), emptySums),
        safe("getSocieteBreakdown", () => getSocieteBreakdown(where), emptySociete),
        safe("getMonthlyVolume", () => getMonthlyVolume(annee, plage), emptyMonthly),
        safe("getAvgDelaiPaiement", () => getAvgDelaiPaiement(plage), 0),
        safe("getAvgDelaiTransfert", () => getAvgDelaiTransfert(plage), 0),
        safe("getAvgDelaiAnalyse", () => getAvgDelaiAnalyse(plage), 0),
        safe("getGestionnaireProductivite", () => getGestionnaireProductivite(where), emptyProductivite),
      ]);

    const c = (s: string) => statuts[s] || 0;
    const totalRecus = c("RECU");
    const totalTraites = c("VALIDE") + c("PAYE");
    const totalPayes = c("PAYE");
    const totalRejetes = c("REJETE");
    const tauxRejet = sums.total > 0 ? round2((totalRejetes / sums.total) * 100) : 0;

    const [validSums, payeSums] = await Promise.all([
      safe("getTotalSums(VALIDE)", () => getTotalSums(combinerWhere({ statut: "VALIDE" }, where)), emptySums),
      safe("getTotalSums(PAYE)", () => getTotalSums(combinerWhere({ statut: "PAYE" }, where)), emptySums),
    ]);

    return NextResponse.json({
      direction: {
        totalRecus,
        totalTraites,
        totalPayes,
        totalRejetes,
        delaiMoyenGlobal: delaiPaiement,
        montantTotalReclame: sums.montantReclame,
        montantTotalPaye: sums.montantPaye,
        tauxRejet,
      },
      reception: {
        totalEnregistres: sums.total,
        tempsMoyenAvantTransfert: delaiTransfert,
        enAttente: totalRecus,
      },
      technique: {
        totalAnalyses: c("EN_ANALYSE") + c("VALIDE") + c("REJETE"),
        totalValides: c("VALIDE"),
        totalRejetes,
        delaiMoyenAnalyse: delaiAnalyse,
        montantTotalValide: validSums.montantValide,
        enCours: c("EN_ANALYSE"),
      },
      comptabilite: {
        decomptesRecus: c("EN_PAIEMENT") + c("PAYE"),
        paiementsEffectues: totalPayes,
        montantTotalPaye: payeSums.montantPaye,
        enCoursPaiement: c("EN_PAIEMENT"),
      },
      productivite,
      parSociete,
      volumeMensuel,
    });
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return NextResponse.json({ erreur: "Erreur lors de la récupération des KPIs" },
      { status: 500 }
    );
  }
}