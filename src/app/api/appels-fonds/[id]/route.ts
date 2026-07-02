import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const body = await request.json();
    const { statut, datePaiement, reference } = body;

    const updateData: Record<string, unknown> = {};
    if (statut) updateData.statut = statut;
    if (datePaiement) updateData.datePaiement = new Date(datePaiement);
    if (reference) updateData.reference = reference;

    const appel = await db.appelDeFonds.update({
      where: { id },
      data: updateData,
      include: { contrat: { include: { societe: true } } },
    });

    // Mettre à jour le budget utilisé du contrat si réglé
    if (statut === 'REGLE') {
      await db.contrat.update({
        where: { id: appel.contratId },
        data: { budgetUtilise: { increment: appel.montant } },
      });
    }

    return NextResponse.json(appel);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}