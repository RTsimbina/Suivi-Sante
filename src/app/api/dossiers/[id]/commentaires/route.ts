import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const commentaires = await db.commentaire.findMany({
      where: { dossierId: id },
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

    const commentaire = await db.commentaire.create({
      data: {
        dossierId: id,
        contenu: contenu.trim(),
        prive: prive === true,
      },
      include: { auteur: { select: { id: true, nom: true, role: true } } },
    });

    return NextResponse.json(commentaire, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}