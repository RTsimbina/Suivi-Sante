import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { getToken } from 'next-auth/jwt';

// ─── Types MIME autorisés ───────────────────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function getMimeType(filename: string, fileMime: string): string {
  // Faire confiance au MIME du fichier si valide, sinon déduire de l'extension
  if (ALLOWED_TYPES.has(fileMime)) return fileMime;
  const ext = getExtension(filename);
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return map[ext] || fileMime;
}

// ─── POST : Upload d'un justificatif ────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Vérification auth + autorisation
  const authErr = await checkAuth(request);
  if (authErr) return authErr;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dossierId = formData.get('dossierId') as string | null;
    const type = formData.get('type') as string | null;

    // Validations
    if (!file) {
      return NextResponse.json({ erreur: 'Fichier manquant' }, { status: 400 });
    }
    if (!dossierId) {
      return NextResponse.json({ erreur: 'Dossier ID manquant' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ erreur: 'Type de justificatif manquant' }, { status: 400 });
    }

    const typesAutorises = ['FACTURE', 'ORDONNANCE', 'RIB', 'CARNET_SOINS', 'DECOMPTE', 'AUTRE'];
    if (!typesAutorises.includes(type)) {
      return NextResponse.json({ erreur: 'Type de justificatif invalide' }, { status: 400 });
    }

    // Vérification taille
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { erreur: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : 10 Mo` },
        { status: 400 }
      );
    }

    // Vérification extension
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { erreur: `Extension non autorisée. Extensions acceptées : ${[...ALLOWED_EXTENSIONS].join(', ')}` },
        { status: 400 }
      );
    }

    // Vérifier que le dossier existe
    const dossier = await db.dossier.findUnique({ where: { id: dossierId }, select: { id: true } });
    if (!dossier) {
      return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });
    }

    // Convertir le fichier en base64 pour le stockage en BDD
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    // Récupérer l'utilisateur qui upload
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const uploadedBy = token?.id || null;

    // Créer l'entrée Justificatif en base
    const justificatif = await db.justificatif.create({
      data: {
        dossierId,
        type,
        nomFichier: file.name,
        chemin: `data:${getMimeType(file.name, file.type)};base64,${base64}`, // préfixe data URI
        tailleKo: Math.round(file.size / 1024),
        uploadedBy,
      },
    });

    return NextResponse.json({
      id: justificatif.id,
      nomFichier: justificatif.nomFichier,
      type: justificatif.type,
      tailleKo: justificatif.tailleKo,
    });
  } catch (error) {
    console.error('[UPLOAD] Erreur:', error);
    return NextResponse.json(
      { erreur: "Erreur serveur lors de l'upload" },
      { status: 500 }
    );
  }
}

// ─── GET : Téléchargement d'un justificatif ─────────────────────────────────
export async function GET(request: NextRequest) {
  // Vérification auth + autorisation
  const authErr = await checkAuth(request);
  if (authErr) return authErr;

  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ erreur: 'ID du justificatif manquant' }, { status: 400 });
    }

    // Récupérer le justificatif
    const justificatif = await db.justificatif.findUnique({
      where: { id },
      select: { id: true, nomFichier: true, chemin: true },
    });

    if (!justificatif) {
      return NextResponse.json({ erreur: 'Justificatif introuvable' }, { status: 404 });
    }

    // Le chemin stocke un data URI complet (data:mime;base64,...)
    const dataUri = justificatif.chemin;
    if (!dataUri || !dataUri.startsWith('data:')) {
      return NextResponse.json({ erreur: 'Fichier corrompu ou format non supporté' }, { status: 500 });
    }

    // Parser le data URI
    const mimeMatch = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!mimeMatch) {
      return NextResponse.json({ erreur: 'Format de fichier invalide' }, { status: 500 });
    }

    const mimeType = mimeMatch[1];
    const base64Data = mimeMatch[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Déterminer le nom de fichier avec le bon Content-Disposition
    const filename = justificatif.nomFichier || 'justificatif';
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[UPLOAD] Erreur téléchargement:', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du téléchargement' },
      { status: 500 }
    );
  }
}
