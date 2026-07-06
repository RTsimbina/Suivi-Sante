import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossierId") as string | null;
    const type = (formData.get("type") as string) || "AUTRE";

    if (!file) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (!dossierId) {
      return NextResponse.json({ error: "dossierId manquant" }, { status: 400 });
    }

    const allowedTypes = [
      "FACTURE", "ORDONNANCE", "RIB", "CARNET_SOINS", "DECOMPTE", "AUTRE",
    ];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Type de justificatif invalide" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 400 });
    }

    await mkdir(path.join(UPLOAD_DIR, dossierId), { recursive: true });

    const ext = file.name.split(".").pop() || "bin";
    const uniqueName = `${type}-${Date.now()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, dossierId, uniqueName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const justificatif = await db.justificatif.create({
      data: {
        dossierId,
        type,
        nomFichier: file.name,
        chemin: filePath,
        tailleKo: Math.round(file.size / 1024),
        uploadedBy: request.headers.get("x-user-id") || undefined,
      },
    });

    return NextResponse.json(justificatif, { status: 201 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 }
    );
  }
}