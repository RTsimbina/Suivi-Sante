import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

const VALID_STATUTS = [
  "RECU",
  "EN_ANALYSE",
  "VALIDE",
  "EN_COMPTABILITE",
  "EN_PAIEMENT",
  "PAYE",
  "REJETE",
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  RECU: ["EN_ANALYSE", "REJETE"],
  EN_ANALYSE: ["VALIDE", "REJETE"],
  VALIDE: ["EN_COMPTABILITE", "REJETE"],
  EN_COMPTABILITE: ["EN_PAIEMENT", "REJETE"],
  EN_PAIEMENT: ["PAYE", "REJETE"],
  PAYE: [],
  REJETE: [],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    const body = await request.json();
    const { statut } = body;

    if (!statut || !VALID_STATUTS.includes(statut)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs autorisées : ${VALID_STATUTS.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await db.dossier.findUnique({
      where: { id },
      include: { societe: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Dossier introuvable" },
        { status: 404 }
      );
    }

    if (existing.statut === statut) {
      return NextResponse.json(
        { error: `Le dossier est déjà dans le statut "${statut}"` },
        { status: 400 }
      );
    }

    const allowed = VALID_TRANSITIONS[existing.statut] || [];
    if (!allowed.includes(statut)) {
      return NextResponse.json(
        { error: `Transition non autorisée de "${existing.statut}" vers "${statut}"` },
        { status: 400 }
      );
    }

    const historiqueEntry = {
      date: new Date().toISOString(),
      statut: statut,
      statutPrecedent: existing.statut,
      commentaire: "Changement via Kanban",
    };

    const currentHistorique: unknown[] = (() => {
      try {
        return JSON.parse(existing.historique || "[]");
      } catch {
        return [];
      }
    })();

    const newHistorique = [...currentHistorique, historiqueEntry];

    const updated = await db.dossier.update({
      where: { id },
      data: {
        statut,
        historique: JSON.stringify(newHistorique),
      },
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating dossier:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du dossier" },
      { status: 500 }
    );
  }
}