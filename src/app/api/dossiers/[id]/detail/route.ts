import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const dossier = await db.dossier.findUnique({
      where: { id },
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
        createur: { select: { id: true, nom: true, email: true, role: true } },
        commentaires: {
          orderBy: { createdAt: "desc" },
          include: { auteur: { select: { id: true, nom: true, role: true } } },
        },
        justificatifs: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    // Parser l'historique JSON
    let historiqueParsed: { date: string; statut: string; commentaire: string }[] = [];
    try {
      historiqueParsed = JSON.parse(dossier.historique);
    } catch {
      historiqueParsed = [];
    }

    return NextResponse.json({ ...dossier, historiqueParsed });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}