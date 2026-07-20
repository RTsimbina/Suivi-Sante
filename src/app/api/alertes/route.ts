import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { findRetards, findAnomalies, detectDoublons, findIncoherences } from "@/lib/kpi-queries";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const [retards, anomalies, doublons, incoherences] = await Promise.all([
      findRetards(),
      findAnomalies(),
      detectDoublons(),
      findIncoherences(),
    ]);

    return NextResponse.json({
      retards,
      anomalies,
      doublons,
      incoherences,
      totalAlertes: retards.length + anomalies.length + doublons.length + incoherences.length,
    });
  } catch (error) {
    console.error("Error fetching alertes:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des alertes" },
      { status: 500 }
    );
  }
}