import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossierId") as string | null;
    const type = (formData.get("type") as string) || "AUTRE";

    const VALID_TYPES = ["FACTURE", "ORDONNANCE", "RIB", "CARNET_SOINS", "DECOMPTE", "AUTRE"];
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Type de justificatif invalide" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }
    if (!dossierId) {
      return NextResponse.json({ error: "ID du dossier requis" }, { status: 400 });
    }

    // Vérifier que le dossier existe
    const dossier = await db.dossier.findUnique({ where: { id: dossierId } });
    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    // Taille max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 400 });
    }

    // Extensions autorisées
    const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const ext = path.extname(file.name).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: "Format non autorisé (PDF, JPG, PNG, GIF, WebP)" }, { status: 400 });
    }

    // Sauvegarder le fichier
    const uploadDir = "/home/z/my-project/uploads/justificatifs";
    await mkdir(uploadDir, { recursive: true });
    const uniqueName = `${dossierId}_${type}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Créer l'enregistrement en base
    const justificatif = await db.justificatif.create({
      data: {
        dossierId,
        type,
        nomFichier: file.name,
        chemin: `/uploads/justificatifs/${uniqueName}`,
        tailleKo: Math.round(file.size / 1024),
      },
    });

    return NextResponse.json(justificatif, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 });
  }
}