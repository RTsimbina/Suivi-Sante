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

// Seuls certains rôles peuvent effectuer certaines transitions
const ROLE_TRANSITIONS: Record<string, string[]> = {
  'RECU_EN_ANALYSE': ['ADMINISTRATEUR', 'ACCUEIL'],
  'RECU_REJETE': ['ADMINISTRATEUR', 'TECHNIQUE'],
  'EN_ANALYSE_VALIDE': ['ADMINISTRATEUR', 'TECHNIQUE'],
  'EN_ANALYSE_REJETE': ['ADMINISTRATEUR', 'TECHNIQUE'],
  'VALIDE_EN_COMPTABILITE': ['ADMINISTRATEUR', 'TECHNIQUE'],
  'VALIDE_REJETE': ['ADMINISTRATEUR', 'TECHNIQUE'],
  'EN_COMPTABILITE_EN_PAIEMENT': ['ADMINISTRATEUR', 'COMPTABILITE'],
  'EN_COMPTABILITE_REJETE': ['ADMINISTRATEUR', 'COMPTABILITE'],
  'EN_PAIEMENT_PAYE': ['ADMINISTRATEUR', 'COMPTABILITE'],
  'EN_PAIEMENT_REJETE': ['ADMINISTRATEUR', 'COMPTABILITE'],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Isolation : UTILISATEUR ne peut modifier que ses propres dossiers ───
    const userRole = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');
    if (userRole === 'UTILISATEUR') {
      const dossier = await db.dossier.findFirst({
        where: { id, createurId: userId },
        select: { id: true },
      });
      if (!dossier) {
        return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });
      }
    }

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

    // Vérification du rôle pour cette transition
    const roleTransition = request.headers.get('x-user-role');
    const transitionKey = `${existing.statut}_${statut}`;
    const allowedRoles = ROLE_TRANSITIONS[transitionKey];

    if (allowedRoles && roleTransition && !allowedRoles.includes(roleTransition)) {
      return NextResponse.json(
        { error: `Le rôle '${roleTransition}' n'est pas autorisé à effectuer la transition de "${existing.statut}" vers "${statut}"` },
        { status: 403 }
      );
    }

    const historiqueEntry = {
      date: new Date().toISOString(),
      statut: statut,
      statutPrecedent: existing.statut,
      commentaire: "Changement via Kanban",
      ...(userId ? { userId } : {}),
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