import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { appelFondsCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const contratId = searchParams.get("contratId") || undefined;
    const statut = searchParams.get("statut") || undefined;

    const where: Record<string, unknown> = {};
    if (contratId) where.contratId = contratId;
    if (statut) where.statut = statut;

    const appels = await db.appelDeFonds.findMany({
      where,
      include: {
        contrat: {
          include: { societe: { select: { id: true, nom: true } } },
        },
      },
      orderBy: { dateAppel: "desc" },
    });

    return NextResponse.json(appels);
  } catch (error) {
    console.error('[APPELS_FONDS] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur lors de l'opération." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée ────────────────────────────────────────
    // FIX audit majeur : le montant n'était jamais contrôlé — un montant
    // négatif était accepté et diminuait le budget utilisé du contrat.
    // montantPositif garantit maintenant un nombre > 0 (montant strictement positif).
    const parsed = await parseJsonBody(request, appelFondsCreateSchema);
    if (!parsed.success) return parsed.response;
    const { contratId, montant, dateAppel, observations } = parsed.data;

    const contrat = await db.contrat.findUnique({ where: { id: contratId } });
    if (!contrat) {
      return NextResponse.json({ erreur: "Contrat introuvable" }, { status: 404 });
    }

    const appel = await db.appelDeFonds.create({
      data: {
        contratId,
        montant,
        dateAppel,
        observations: observations ?? null,
        statut: "EN_ATTENTE",
      },
      include: { contrat: { include: { societe: true } } },
    });

    // Synchroniser le budgetUtilise du contrat (champ cache)
    await db.contrat.update({
      where: { id: contratId },
      data: { budgetUtilise: { increment: montant } },
    });

    return NextResponse.json(appel, { status: 201 });
  } catch {
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}