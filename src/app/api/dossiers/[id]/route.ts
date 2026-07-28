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

    const userRole = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');

    const body = await request.json();
    const { statut, gestionnaireAccueilId, gestionnaireTechniqueId, gestionnaireComptaId } = body;

    const existing = await db.dossier.findUnique({
      where: { id },
      include: { societe: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    // ─── Partie 1 : Changement de statut ───
    if (statut) {
      if (!VALID_STATUTS.includes(statut)) {
        return NextResponse.json(
          { error: `Statut invalide. Valeurs autorisées : ${VALID_STATUTS.join(", ")}` },
          { status: 400 }
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

      const transitionKey = `${existing.statut}_${statut}`;
      const allowedRoles = ROLE_TRANSITIONS[transitionKey];

      if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
        return NextResponse.json(
          { error: `Le rôle '${userRole}' n'est pas autorisé à effectuer la transition de "${existing.statut}" vers "${statut}"` },
          { status: 403 }
        );
      }
    }

    // ─── Partie 2 : Assignation de gestionnaires ───
    const assignData: Record<string, string | null> = {};
    const assignComments: string[] = [];

    if (gestionnaireAccueilId !== undefined) {
      assignData.gestionnaireAccueilId = gestionnaireAccueilId || null;
      if (gestionnaireAccueilId && !existing.gestionnaireAccueilId) {
        assignComments.push('Assigné à un gestionnaire Accueil');
      }
    }
    if (gestionnaireTechniqueId !== undefined) {
      assignData.gestionnaireTechniqueId = gestionnaireTechniqueId || null;
      if (gestionnaireTechniqueId && !existing.gestionnaireTechniqueId) {
        assignComments.push('Assigné à un gestionnaire Technique');
      }
    }
    if (gestionnaireComptaId !== undefined) {
      assignData.gestionnaireComptaId = gestionnaireComptaId || null;
      if (gestionnaireComptaId && !existing.gestionnaireComptaId) {
        assignComments.push('Assigné à un gestionnaire Comptabilité');
      }
    }

    // Si ni statut ni gestionnaire à modifier
    if (!statut && Object.keys(assignData).length === 0) {
      return NextResponse.json(
        { error: "Aucune modification demandée" },
        { status: 400 }
      );
    }

    // ─── Historique ───
    const currentHistorique: unknown[] = (() => {
      try {
        return JSON.parse(existing.historique || "[]");
      } catch {
        return [];
      }
    })();

    const newHistorique = [...currentHistorique];

    if (statut) {
      newHistorique.push({
        date: new Date().toISOString(),
        statut,
        statutPrecedent: existing.statut,
        commentaire: 'Changement via Kanban',
        ...(userId ? { userId } : {}),
      });
    }

    if (assignComments.length > 0) {
      newHistorique.push({
        date: new Date().toISOString(),
        statut: existing.statut,
        commentaire: assignComments.join('. '),
        ...(userId ? { userId } : {}),
      });
    }

    // ─── Mise à jour ───
    const updated = await db.dossier.update({
      where: { id },
      data: {
        ...(statut ? { statut } : {}),
        ...assignData,
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