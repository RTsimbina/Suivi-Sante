import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { getToken } from 'next-auth/jwt';
import {
  detecterTypeReel,
  extensionAutorisee,
  resoudreMimeType,
  stockerJustificatif,
  lireContenuJustificatif,
  MAX_TAILLE_OCTETS,
} from '@/lib/storage';

// ─── POST : Upload d'un justificatif ────────────────────────────────────────
// Plan P3 Vague 1 : validation du CONTENU (magic bytes) + stockage objet
// (Vercel Blob) dès que BLOB_READ_WRITE_TOKEN est configuré, fallback DB.
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
    if (file.size > MAX_TAILLE_OCTETS) {
      return NextResponse.json(
        { erreur: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : 10 Mo` },
        { status: 400 }
      );
    }

    // Vérification extension
    if (!extensionAutorisee(file.name)) {
      return NextResponse.json(
        { erreur: 'Extension non autorisée. Extensions acceptées : .pdf, .jpg, .jpeg, .png, .webp' },
        { status: 400 }
      );
    }

    // MIME final : déclaré s'il est whitelisté, sinon déduit de l'extension
    const mimeType = resoudreMimeType(file.name, file.type);
    if (!mimeType) {
      return NextResponse.json(
        { erreur: 'Type de fichier non supporté. Formats acceptés : PDF, JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    // ─── Validation du CONTENU (magic bytes) — plan P3 ─────────────────────
    // Le MIME déclaré et l'extension viennent du client et peuvent mentir.
    // On refuse tout contenu qui n'est pas un vrai PDF/JPEG/PNG/WebP
    // (ex : script HTML renommé .pdf, polyglottes).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const typeReel = detecterTypeReel(bytes);
    if (!typeReel) {
      return NextResponse.json(
        { erreur: 'Le contenu du fichier ne correspond à aucun format autorisé (PDF, JPEG, PNG, WebP). Il est peut-être corrompu ou déguisé.' },
        { status: 400 }
      );
    }
    if (typeReel !== mimeType) {
      return NextResponse.json(
        { erreur: `Le contenu du fichier (${typeReel}) ne correspond pas à son format déclaré (${mimeType}).` },
        { status: 400 }
      );
    }

    // Vérifier que le dossier existe
    const dossier = await db.dossier.findUnique({ where: { id: dossierId }, select: { id: true } });
    if (!dossier) {
      return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });
    }

    // Récupérer l'utilisateur qui upload
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const uploadedBy = token?.id || null;

    // ─── Stockage : objet (Vercel Blob) si configuré, sinon DB (fallback) ──
    // Plan P3 : les nouveaux justificatifs vont en stockage objet dès que
    // BLOB_READ_WRITE_TOKEN est défini ; la DB ne conserve que la clé/URL.
    const resultat = await stockerJustificatif(bytes, {
      dossierId,
      nomFichier: file.name,
      mimeType,
    });

    // Créer l'entrée Justificatif en base (chemin = clé/URL en mode BLOB,
    // data URI en mode DB fallback)
    const justificatif = await db.justificatif.create({
      data: {
        dossierId,
        type,
        nomFichier: file.name,
        chemin: resultat.chemin,
        tailleKo: resultat.tailleKo,
        uploadedBy,
      },
    });

    return NextResponse.json({
      id: justificatif.id,
      nomFichier: justificatif.nomFichier,
      type: justificatif.type,
      tailleKo: justificatif.tailleKo,
      stockage: resultat.mode,
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
// Gère les deux modes : data URI (justificatifs historiques) et URL blob
// (stockage objet — le binaire est proxifié serveur, l'URL du stockage
// n'est JAMAIS exposée au client).
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

    let bytes: Buffer<ArrayBuffer>;
    let mimeType: string | null;
    try {
      const contenu = await lireContenuJustificatif(justificatif.chemin);
      bytes = contenu.bytes;
      mimeType = contenu.mimeType;
    } catch (e) {
      console.error('[UPLOAD] Lecture justificatif:', e);
      return NextResponse.json({ erreur: 'Fichier inaccessible ou corrompu' }, { status: 500 });
    }

    // Déterminer le nom de fichier avec le bon Content-Disposition
    const filename = justificatif.nomFichier || 'justificatif';
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': bytes.length.toString(),
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
