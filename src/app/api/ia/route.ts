import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import {
  findRetards, findAnomalies, detectDoublons, findIncoherences,
  findPiecesManquantes, getMonthlyVolume, getGestionnaireCharge,
  getStatutCounts,
} from "@/lib/kpi-queries";

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (err) { console.error(`[IA] ${label} failed:`, err); return fallback; }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const [retards, anomalies, doublons, incoherences, piecesManquantes, monthlyVolume, chargeParGestionnaire, statuts] =
      await Promise.all([
        safe("findRetards", () => findRetards(), []),
        safe("findAnomalies", () => findAnomalies(), []),
        safe("detectDoublons", () => detectDoublons(), []),
        safe("findIncoherences", () => findIncoherences(), []),
        safe("findPiecesManquantes", () => findPiecesManquantes(), []),
        safe("getMonthlyVolume", () => getMonthlyVolume(2026), []),
        safe("getGestionnaireCharge", () => getGestionnaireCharge(), []),
        safe("getStatutCounts", () => getStatutCounts(), {}),
      ]);

    const firstHalf = monthlyVolume.filter((m) => {
      const monthNum = parseInt(m.mois.split("-")[1], 10);
      return monthNum >= 1 && monthNum <= 6;
    });
    const monthsWithData = firstHalf.filter((m) => m.nbDossiers > 0);
    const totalSoFar = firstHalf.reduce((s, m) => s + m.nbDossiers, 0);
    const volumeMoyenMensuel = monthsWithData.length > 0 ? Math.round(totalSoFar / monthsWithData.length) : 0;

    const totalNonTerminal = Object.entries(statuts)
      .filter(([s]) => s !== "PAYE" && s !== "REJETE")
      .reduce((sum, [, v]) => sum + v, 0);
    const risqueRetard = totalNonTerminal > 0 ? Math.round((retards.length / totalNonTerminal) * 100) : 0;

    return NextResponse.json({
      retards,
      anomalies,
      doublons,
      piecesManquantes,
      incoherences,
      previsions: {
        volumeAttendu: volumeMoyenMensuel,
        chargeParGestionnaire: chargeParGestionnaire.map((g) => ({
          nom: g.nom,
          service: g.service,
          dossiersActifs: g.dossiersActifs,
          chargeEstimee: g.dossiersActifs + volumeMoyenMensuel,
        })),
        risqueRetard,
      },
    });
  } catch (error) {
    console.error("Error fetching IA analysis:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'analyse IA" },
      { status: 500 }
    );
  }
}