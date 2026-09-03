import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { appelFondsUpdateSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Validation Zod centralisée (statut enum, montant ≥ 0, dates) ──────
    const parsed = await parseJsonBody(request, appelFondsUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { statut, datePaiement, reference, montant } = parsed.data;

    // Vérifier que l'appel existe
    const existing = await db.appelDeFonds.findUnique({
      where: { id },
      include: { contrat: true },
    });
    if (!existing) {
      return NextResponse.json({ erreur: "Appel de fonds introuvable" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Le schéma Zod garantit statut ∈ [EN_ATTENTE, REGLE, ANNULE]
    if (statut !== undefined) {
      updateData.statut = statut;
    }

    if (datePaiement !== undefined && datePaiement !== null) updateData.datePaiement = datePaiement;
    if (reference) updateData.reference = reference;

    // Si le montant est modifié, recalculer le budgetUtilise du contrat
    // (type number et non-négativité garantis par le schéma Zod)
    if (montant !== undefined && existing.montant !== montant) {
      updateData.montant = montant;

      // Ajuster le budgetUtilise : soustraire l'ancien, ajouter le nouveau
      const diff = montant - existing.montant;
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
