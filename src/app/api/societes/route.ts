import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logParametreChange, getUserIdFromRequest } from "@/lib/audit-log";

// GET — Lister toutes les sociétés
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const societes = await db.societe.findMany({
      orderBy: { nom: "asc" },
      include: {
        _count: { select: { dossiers: true, contrats: true, baremes: true } },
      },
    });
    return NextResponse.json({ societes });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

// POST — Créer une société
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { nom } = body;

    if (!nom || typeof nom !== "string" || nom.trim().length < 2) {
      return NextResponse.json({ error: "Nom de société requis (min 2 caractères)" }, { status: 400 });
    }

    // Vérifier doublon
    const existing = await db.societe.findFirst({ where: { nom: nom.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Une société avec ce nom existe déjà" }, { status: 409 });
    }

    const societe = await db.societe.create({
      data: { nom: nom.trim() },
    });

    // Audit log : création
    await logParametreChange({
      entite: 'Societe', entiteId: societe.id, champ: 'CREATION',
      ancienneValeur: null, nouvelleValeur: nom.trim(), modifiePar: userId,
    });

    return NextResponse.json({ societe }, { status: 201 });
  } catch (error) {
    console.error("Erreur création société:", error);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}

// DELETE — Supprimer une société (si elle n'a pas de dossiers)
export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID de société requis" }, { status: 400 });
    }

    // Vérifier s'il y a des dossiers liés
    const dossierCount = await db.dossier.count({ where: { societeId: id } });
    if (dossierCount > 0) {
      return NextResponse.json(
        { error: `Impossible de supprimer : ${dossierCount} dossier(s) lié(s)` },
        { status: 409 }
      );
    }

    // Récupérer la société pour l'audit
    const societe = await db.societe.findUnique({ where: { id } });

    // Supprimer les barèmes d'abord
    await db.bareme.deleteMany({ where: { societeId: id } });
    // Supprimer les contrats
    await db.contrat.deleteMany({ where: { societeId: id } });

    await db.societe.delete({ where: { id } });

    // Audit log : suppression
    if (societe) {
      await logParametreChange({
        entite: 'Societe', entiteId: id, champ: 'SUPPRESSION',
        ancienneValeur: societe.nom, nouvelleValeur: null, modifiePar: userId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression société:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}