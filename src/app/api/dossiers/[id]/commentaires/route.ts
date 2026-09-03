import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { commentaireCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const userRole = request.headers.get('x-user-role') || '';

    // ─── Isolation : les commentaires privés ne sont visibles que par l'équipe interne ───
    const whereCommentaire: Record<string, unknown> = { dossierId: id };
    const INTERNAL = ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'];
    if (!INTERNAL.includes(userRole)) {
      whereCommentaire.prive = false;
    }

    const commentaires = await db.commentaire.findMany({
      where: whereCommentaire,
      orderBy: { createdAt: "desc" },
      include: { auteur: { select: { id: true, nom: true, role: true } } },
    });
    return NextResponse.json(commentaires);
  } catch (error) {
    console.error('[COMMENTAIRES] Erreur GET:', error);
    return NextResponse.json({ erreur: "Erreur lors du chargement des commentaires." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Validation Zod centralisée (contenu requis, prive booléen) ─────────
    const parsed = await parseJsonBody(request, commentaireCreateSchema);
    if (!parsed.success) return parsed.response;
    const { contenu, prive } = parsed.data;

    // Vérifier que le dossier existe
    const dossier = await db.dossier.findUnique({ where: { id } });
    if (!dossier) {
      return NextResponse.json({ erreur: "Dossier introuvable" }, { status: 404 });
    }

    // Seuls les rôles internes peuvent créer des commentaires privés
    const userRole = request.headers.get('x-user-role') || '';
    const INTERNAL = ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'];
    if (prive === true && !INTERNAL.includes(userRole)) {
      return NextResponse.json({ erreur: 'Les commentaires privés sont réservés à l\'équipe interne' }, { status: 403 });
    }

    const userId = request.headers.get('x-user-id') || '';

    const commentaire = await db.commentaire.create({
      data: {
        dossierId: id,
        contenu,
        prive,
        auteurId: userId,
      },
      include: { auteur: { select: { id: true, nom: true, role: true } } },
    });

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error('[COMMENTAIRES] Erreur POST:', error);
    return NextResponse.json({ erreur: "Erreur lors de la creation du commentaire." }, { status: 500 });
  }
}