import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

const VALID_STATUTS_APPEL = ["EN_ATTENTE", "REGLE", "ANNULE"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const body = await request.json();
    const { statut, datePaiement, reference, montant } = body;

    // Vérifier que l'appel existe
    const existing = await db.appelDeFonds.findUnique({
      where: { id },
      include: { contrat: true },
    });
    if (!existing) {
      return NextResponse.json({ erreur: "Appel de fonds introuvable" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Validation du statut
    if (statut !== undefined) {
      if (!VALID_STATUTS_APPEL.includes(statut)) {
        return NextResponse.json(
          { erreur: `Statut invalide. Valeurs autorisées : ${VALID_STATUTS_APPEL.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.statut = statut;
    }

    if (datePaiement) updateData.datePaiement = new Date(datePaiement);
    if (reference) updateData.reference = String(reference).trim();

    // Si le montant est modifié, recalculer le budgetUtilise du contrat
    if (montant !== undefined && existing.montant !== Number(montant)) {
      const oldMontant = existing.montant;
      const newMontant = Number(montant);
      if (isNaN(newMontant) || newMontant < 0) {
        return NextResponse.json({ erreur: "Montant invalide" }, { status: 400 });
      }
      updateData.montant = newMontant;

      // Ajuster le budgetUtilise : soustraire l'ancien, ajouter le nouveau
      const diff = newMontant - oldMontant;
      await db.contrat.update({
        where: { id: existing.contratId },
        data: { budgetUtilise: { increment: diff } },
      });
    }

    const appel = await db.appelDeFonds.update({
      where: { id },
      data: updateData,
      include: { contrat: { include: { societe: true } } },
    });

    return NextResponse.json(appel);
  } catch (error) {
    console.error("Error updating appel de fonds:", error);
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
