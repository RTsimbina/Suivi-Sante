import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { appelFondsUpdateSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Erreur sentinelle : appel introuvable (dans la transaction)
  class AppelIntrouvable extends Error {}

  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Validation Zod centralisée (statut enum, montant ≥ 0, dates) ──────
    const parsed = await parseJsonBody(request, appelFondsUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { statut, datePaiement, reference, montant } = parsed.data;

    // FIX audit P2 : lecture verrouillée + écritures dans UNE SEULE
    // transaction. Avant : (1) montant lu hors transaction → deux PATCH
    // simultanés calculaient le même diff et l'appliquaient deux fois
    // (double incrément du budgetUtilise) ; (2) contrat.update puis
    // appel.update séparés → un échec intermédiaire désynchronisait le
    // budget du contrat.
    const appel = await db.$transaction(async (tx) => {
      // Verrou de ligne : sérialise les PATCH concurrents sur LE MÊME appel
      await tx.$queryRaw`SELECT "id" FROM "AppelDeFonds" WHERE "id" = ${id} FOR UPDATE`;

      // Re-lecture APRÈS acquisition du verrou (snapshot frais, READ COMMITTED)
      const existing = await tx.appelDeFonds.findUnique({
        where: { id },
        include: { contrat: true },
      });
      if (!existing) throw new AppelIntrouvable();

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
        await tx.contrat.update({
          where: { id: existing.contratId },
          data: { budgetUtilise: { increment: diff } },
        });
      }

      return tx.appelDeFonds.update({
        where: { id },
        data: updateData,
        include: { contrat: { include: { societe: true } } },
      });
    });

    return NextResponse.json(appel);
  } catch (error) {
    if (error instanceof AppelIntrouvable) {
      return NextResponse.json({ erreur: "Appel de fonds introuvable" }, { status: 404 });
    }
    console.error("Error updating appel de fonds:", error);
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
