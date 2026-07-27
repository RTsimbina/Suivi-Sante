import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const userRole = request.headers.get('x-user-role') || '';

    // ─── Isolation : les commentaires privés ne sont visibles que par l'équipe interne ───
    const whereCommentaire: Record<string, unknown> = { dossierId: id };
    if (userRole === 'UTILISATEUR') {
      whereCommentaire.prive = false;
    }

    const commentaires = await db.commentaire.findMany({
      where: whereCommentaire,
      orderBy: { createdAt: "desc" },
      include: { auteur: { select: { id: true, nom: true, role: true } } },
    });
    return NextResponse.json(commentaires);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const body = await request.json();
    const { contenu, prive } = body;

    if (!contenu || typeof contenu !== "string" || !contenu.trim()) {
      return NextResponse.json({ error: "Le contenu est requis" }, { status: 400 });
    }

    // Vérifier que le dossier existe
    const dossier = await db.dossier.findUnique({ where: { id } });
    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    // Seuls les rôles internes peuvent créer des commentaires privés
    const userRole = request.headers.get('x-user-role') || '';
    if (prive === true && userRole === 'UTILISATEUR') {
      return NextResponse.json({ erreur: 'Les commentaires privés sont réservés à l\'équipe interne' }, { status: 403 });
    }

    const userId = request.headers.get('x-user-id') || '';

    const commentaire = await db.commentaire.create({
      data: {
        dossierId: id,
        contenu: contenu.trim(),
        prive: prive === true,
        auteurId: userId,
      },
      include: { auteur: { select: { id: true, nom: true, role: true } } },
    });

    return NextResponse.json(commentaire, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}