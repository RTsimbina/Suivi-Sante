import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSocieteCourante,
} from "@/lib/data-isolation";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Isolation des données (RLS applicatif, voir data-isolation.ts) ────
    // Rôles externes : uniquement LEUR société (JWT).
    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    const societes = await db.societe.findMany({
      where: avecPerimetreSocieteCourante({}, perimetre),
      orderBy: { nom: "asc" },
    });
    return NextResponse.json(societes);
  } catch (error) {
    console.error('[DOSSIERS_SOCIETES] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur lors de l'opération." }, { status: 500 });
  }
}