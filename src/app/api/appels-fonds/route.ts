import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { appelFondsCreateSchema } from "@/lib/validation";
import { plageDepuisParams, filtreDateChamp } from "@/lib/periodes";

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

    // Filtre de période réutilisable (date de référence : AppelDeFonds.dateAppel)
    Object.assign(where, filtreDateChamp("dateAppel", plageDepuisParams(searchParams)));

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
  // Erreur sentinelle : contrat introuvable (dans la transaction)
  class ContratIntrouvable extends Error {}

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

    // FIX audit P2 : création de l'appel ET synchronisation du budgetUtilise
    // dans UNE SEULE transaction — avant, un échec entre les deux écrivait
    // un appel sans budget synchronisé (budgetUtilise faux → plafonds faux).
    const appel = await db.$transaction(async (tx) => {
      const contrat = await tx.contrat.findUnique({ where: { id: contratId } });
      if (!contrat) throw new ContratIntrouvable();

      const nouvelAppel = await tx.appelDeFonds.create({
        data: {
          contratId,
          montant,
          dateAppel,
          observations: observations ?? null,
          statut: "EN_ATTENTE",
        },
        include: { contrat: { include: { societe: true } } },
      });

      // Synchroniser le budgetUtilise du contrat (champ cache) — même transaction
      await tx.contrat.update({
        where: { id: contratId },
        data: { budgetUtilise: { increment: montant } },
      });

      return nouvelAppel;
    });

    return NextResponse.json(appel, { status: 201 });
  } catch (error) {
    if (error instanceof ContratIntrouvable) {
      return NextResponse.json({ erreur: "Contrat introuvable" }, { status: 404 });
    }
    console.error('[APPELS_FONDS] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}