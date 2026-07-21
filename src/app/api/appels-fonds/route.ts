import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

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
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const body = await request.json();
    const { contratId, montant, dateAppel, observations } = body;

    if (!contratId || !montant || !dateAppel) {
      return NextResponse.json({ error: "contratId, montant et dateAppel sont requis" }, { status: 400 });
    }

    const contrat = await db.contrat.findUnique({ where: { id: contratId } });
    if (!contrat) {
      return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
    }

    const appel = await db.appelDeFonds.create({
      data: {
        contratId,
        montant: parseFloat(montant),
        dateAppel: new Date(dateAppel),
        observations: observations || null,
        statut: "EN_ATTENTE",
      },
      include: { contrat: { include: { societe: true } } },
    });

    // Synchroniser le budgetUtilise du contrat (champ cache)
    await db.contrat.update({
      where: { id: contratId },
      data: { budgetUtilise: { increment: parseFloat(montant) } },
    });

    return NextResponse.json(appel, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}