import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

const VALID_STATUTS = ["RECU", "TRAITE", "REJETE"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();

    // Vérifier que le courriel existe
    const existing = await db.courriel.findUnique({
      where: { id },
      include: { societe: true, dossier: true },
    });

    if (!existing) {
      return NextResponse.json(
        { erreur: "Courriel introuvable." },
        { status: 404 }
      );
    }

    const {
      statut,
      observations,
      dossierId,
      societeId,
      beneficiaire,
      montant,
      dateSoins,
      prestataire,
      objet,
    } = body;

    // Validation du statut
    if (statut && !VALID_STATUTS.includes(statut)) {
      return NextResponse.json(
        { erreur: `Statut invalide. Valeurs autorisées : ${VALID_STATUTS.join(", ")}` },
        { status: 400 }
      );
    }

    // Vérifier que le dossier existe si dossierId est fourni
    if (dossierId) {
      const dossier = await db.dossier.findUnique({ where: { id: dossierId } });
      if (!dossier) {
        return NextResponse.json(
          { erreur: "Dossier introuvable." },
          { status: 404 }
        );
      }
    }

    // Vérifier que la société existe si societeId est fourni
    if (societeId) {
      const societe = await db.societe.findUnique({ where: { id: societeId } });
      if (!societe) {
        return NextResponse.json(
          { erreur: "Société introuvable." },
          { status: 404 }
        );
      }
    }

    // Si le statut passe à TRAITE ou REJETE, renseigner dateTraitement et traitePar
    const updateData: Record<string, unknown> = {};
    if (statut) updateData.statut = statut;
    if (observations !== undefined) updateData.observations = observations?.trim() || null;
    if (dossierId !== undefined) updateData.dossierId = dossierId || null;
    if (societeId !== undefined) updateData.societeId = societeId || null;
    if (beneficiaire !== undefined) updateData.beneficiaire = beneficiaire?.trim() || null;
    if (montant !== undefined) updateData.montant = montant ?? null;
    if (dateSoins !== undefined) updateData.dateSoins = dateSoins ? new Date(dateSoins) : null;
    if (prestataire !== undefined) updateData.prestataire = prestataire?.trim() || null;
    if (objet !== undefined) updateData.objet = objet?.trim() || null;

    if (statut && (statut === "TRAITE" || statut === "REJETE")) {
      const userName = request.headers.get("x-user-name") || "Système";
      updateData.dateTraitement = new Date();
      updateData.traitePar = userName;
    }

    const updated = await db.courriel.update({
      where: { id },
      data: updateData,
      include: {
        societe: { select: { id: true, nom: true } },
        dossier: { select: { id: true, numeroDossier: true } },
      },
    });

    const statutLabel = statut === "TRAITE"
      ? "traité"
      : statut === "REJETE"
        ? "rejeté"
        : "mis à jour";

    return NextResponse.json({
      message: `Courriel ${statutLabel} avec succès.`,
      courriel: updated,
    });
  } catch (error) {
    console.error("Erreur PATCH /api/reception/courriels/[id]:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la mise à jour du courriel." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;

    const existing = await db.courriel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { erreur: "Courriel introuvable." },
        { status: 404 }
      );
    }

    await db.courriel.delete({ where: { id } });

    return NextResponse.json({
      message: "Courriel supprimé avec succès.",
    });
  } catch (error) {
    console.error("Erreur DELETE /api/reception/courriels/[id]:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la suppression du courriel." },
      { status: 500 }
    );
  }
}