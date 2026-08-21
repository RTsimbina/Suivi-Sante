import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { verifierPlafondAnnuel } from "@/lib/plafond-check";

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
  'RECU_REJETE': ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE'],
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
    const {
      statut,
      gestionnaireAccueilId,
      gestionnaireTechniqueId,
      gestionnaireComptaId,
      assureId,
      montantValide,
      ticketModerateur,
      nSS,
      prestataireId,
      dateSoins,
      moyenPaiement,
      observations,
      motifRejet,
    } = body;

    const existing = await db.dossier.findUnique({
      where: { id },
      include: { societe: true },
    });

    if (!existing) {
      return NextResponse.json({ erreur: "Dossier introuvable" }, { status: 404 });
    }

    // ─── Partie 1 : Changement de statut ─────────────────────────────────
    if (statut) {
      if (!VALID_STATUTS.includes(statut)) {
        return NextResponse.json({ erreur: `Statut invalide. Valeurs autorisées : ${VALID_STATUTS.join(", ")}` },
          { status: 400 }
        );
      }

      if (existing.statut === statut) {
        return NextResponse.json({ erreur: `Le dossier est déjà dans le statut "${statut}"` },
          { status: 400 }
        );
      }

      const allowed = VALID_TRANSITIONS[existing.statut] || [];
      if (!allowed.includes(statut)) {
        return NextResponse.json({ erreur: `Transition non autorisée de "${existing.statut}" vers "${statut}"` },
          { status: 400 }
        );
      }

      const transitionKey = `${existing.statut}_${statut}`;
      const allowedRoles = ROLE_TRANSITIONS[transitionKey];

      if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
        return NextResponse.json({ erreur: `Le rôle '${userRole}' n'est pas autorisé à effectuer la transition de "${existing.statut}" vers "${statut}"` },
          { status: 403 }
        );
      }

      // ─── Vérification du plafond à la transition EN_ANALYSE → VALIDE ──
      if (existing.statut === 'EN_ANALYSE' && statut === 'VALIDE') {
        const dossierAssureId = assureId || existing.assureId;
        if (dossierAssureId) {
          const plafondResult = await verifierPlafondAnnuel({
            assureId: dossierAssureId,
            societeId: existing.societeId,
            typeActe: existing.typeDossier,
            montantDemande: existing.montantReclame,
            prestataireId: prestataireId || existing.prestataireId || undefined,
            excludeDossierId: id,
          });

          // Bloquer si plafond épuisé
          if (!plafondResult.autorise &&
              ['ASSURE_INACTIF', 'PLAFOND_ACTE_ATTEINT', 'PLAFOND_GLOBAL_ATTEINT', 'PRESTATAIRE_INACTIF'].includes(plafondResult.raison)) {
            return NextResponse.json({ erreur: `Transition bloquée : ${plafondResult.message}`,
                plafondAtteint: true,
                plafondDetails: plafondResult.details,
                raison: plafondResult.raison,
              },
              { status: 422 }
            );
          }
        }
      }
    }

    // ─── Partie 2 : Champs modifiables ────────────────────────────────────
    const updateData: Record<string, unknown> = {};
    const assignComments: string[] = [];

    // Gestionnaires
    if (gestionnaireAccueilId !== undefined) {
      updateData.gestionnaireAccueilId = gestionnaireAccueilId || null;
      if (gestionnaireAccueilId && !existing.gestionnaireAccueilId) {
        assignComments.push('Assigné à un gestionnaire Accueil');
      }
    }
    if (gestionnaireTechniqueId !== undefined) {
      updateData.gestionnaireTechniqueId = gestionnaireTechniqueId || null;
      if (gestionnaireTechniqueId && !existing.gestionnaireTechniqueId) {
        assignComments.push('Assigné à un gestionnaire Technique');
      }
    }
    if (gestionnaireComptaId !== undefined) {
      updateData.gestionnaireComptaId = gestionnaireComptaId || null;
      if (gestionnaireComptaId && !existing.gestionnaireComptaId) {
        assignComments.push('Assigné à un gestionnaire Comptabilité');
      }
    }

    // Assuré
    if (assureId !== undefined) {
      updateData.assureId = assureId || null;
    }

    // Prestataire
    if (prestataireId !== undefined) {
      updateData.prestataireId = prestataireId || null;
    }

    // Champs financiers et administratifs
    if (montantValide !== undefined) {
      const newMontantValide = montantValide || null;
      // Re-vérifier le plafond si le montant validé change et que le dossier est validé
      if (newMontantValide !== null && newMontantValide !== existing.montantValide
          && ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(existing.statut)
          && existing.assureId) {
        const plafondRecheck = await verifierPlafondAnnuel({
          assureId: existing.assureId,
          societeId: existing.societeId,
          typeActe: existing.typeDossier,
          montantDemande: newMontantValide,
          excludeDossierId: id,
        });
        if (!plafondRecheck.autorise &&
            ['PLAFOND_ACTE_ATTEINT', 'PLAFOND_GLOBAL_ATTEINT'].includes(plafondRecheck.raison)) {
          return NextResponse.json(
            { erreur: `Modification bloquée : ${plafondRecheck.message}`, plafondAtteint: true, plafondDetails: plafondRecheck.details },
            { status: 422 }
          );
        }
      }
      updateData.montantValide = newMontantValide;
    }
    if (ticketModerateur !== undefined) updateData.ticketModerateur = ticketModerateur || null;
    if (nSS !== undefined) updateData.nSS = nSS || null;
    if (dateSoins !== undefined) updateData.dateSoins = dateSoins ? new Date(dateSoins) : null;
    if (moyenPaiement !== undefined) updateData.moyenPaiement = moyenPaiement || null;
    if (observations !== undefined) updateData.observations = observations || null;
    if (motifRejet !== undefined) updateData.motifRejet = motifRejet || null;

    // Auto-set dateTraitementTechnique si transition vers EN_ANALYSE
    if (statut === 'EN_ANALYSE' && !existing.dateTraitementTechnique) {
      updateData.dateTraitementTechnique = new Date();
    }

    // Si ni statut ni gestionnaire ni autre champ à modifier
    if (!statut && Object.keys(updateData).length === 0) {
      return NextResponse.json({ erreur: "Aucune modification demandée" },
        { status: 400 }
      );
    }

    // ─── Historique ────────────────────────────────────────────────────────
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

    // ─── Mise à jour ──────────────────────────────────────────────────────
    const updated = await db.dossier.update({
      where: { id },
      data: {
        ...(statut ? { statut } : {}),
        ...updateData,
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
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour du dossier" },
      { status: 500 }
    );
  }
}
