import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import {
  getStatutCounts, getTotalSums, getSocieteBreakdown, getMonthlyVolume,
  getAvgDelaiPaiement, getAvgDelaiTransfert, getAvgDelaiAnalyse,
  getGestionnaireProductivite, round2,
} from "@/lib/kpi-queries";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const [statuts, sums, parSociete, volumeMensuel, delaiPaiement, delaiTransfert, delaiAnalyse, productivite] =
      await Promise.all([
        getStatutCounts(),
        getTotalSums(),
        getSocieteBreakdown(),
        getMonthlyVolume(2026),
        getAvgDelaiPaiement(),
        getAvgDelaiTransfert(),
        getAvgDelaiAnalyse(),
        getGestionnaireProductivite(),
      ]);

    const c = (s: string) => statuts[s] || 0;
    const totalRecus = c("RECU");
    const totalTraites = c("VALIDE") + c("REJETE") + c("PAYE");
    const totalPayes = c("PAYE");
    const totalRejetes = c("REJETE");
    const tauxRejet = sums.total > 0 ? round2((totalRejetes / sums.total) * 100) : 0;

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
        montantTotalValide: round2(
          (await getTotalSums({ statut: "VALIDE" })).montantValide
        ),
        enCours: c("EN_ANALYSE"),
      },
      comptabilite: {
        decomptesRecus: c("EN_PAIEMENT") + c("PAYE"),
        paiementsEffectues: totalPayes,
        montantTotalPaye: round2(
          (await getTotalSums({ statut: "PAYE" })).montantPaye
        ),
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