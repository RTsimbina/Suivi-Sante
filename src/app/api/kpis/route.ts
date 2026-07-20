import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import {
  getStatutCounts, getTotalSums, getSocieteBreakdown, getMonthlyVolume,
  getAvgDelaiPaiement, getAvgDelaiTransfert, getAvgDelaiAnalyse,
  getGestionnaireProductivite, round2,
} from "@/lib/kpi-queries";

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

    const [statuts, sums, parSociete, volumeMensuel, delaiPaiement, delaiTransfert, delaiAnalyse, productivite] =
      await Promise.all([
        safe("getStatutCounts", () => getStatutCounts(), emptyStatuts),
        safe("getTotalSums", () => getTotalSums(), emptySums),
        safe("getSocieteBreakdown", () => getSocieteBreakdown(), emptySociete),
        safe("getMonthlyVolume", () => getMonthlyVolume(2026), emptyMonthly),
        safe("getAvgDelaiPaiement", () => getAvgDelaiPaiement(), 0),
        safe("getAvgDelaiTransfert", () => getAvgDelaiTransfert(), 0),
        safe("getAvgDelaiAnalyse", () => getAvgDelaiAnalyse(), 0),
        safe("getGestionnaireProductivite", () => getGestionnaireProductivite(), emptyProductivite),
      ]);

    const c = (s: string) => statuts[s] || 0;
    const totalRecus = c("RECU");
    const totalTraites = c("VALIDE") + c("REJETE") + c("PAYE");
    const totalPayes = c("PAYE");
    const totalRejetes = c("REJETE");
    const tauxRejet = sums.total > 0 ? round2((totalRejetes / sums.total) * 100) : 0;

    const [validSums, payeSums] = await Promise.all([
      safe("getTotalSums(VALIDE)", () => getTotalSums({ statut: "VALIDE" }), emptySums),
      safe("getTotalSums(PAYE)", () => getTotalSums({ statut: "PAYE" }), emptySums),
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
    return NextResponse.json(
      { error: "Erreur lors de la récupération des KPIs" },
      { status: 500 }
    );
  }
}