import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import {
  avecPerimetreSociete,
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
} from '@/lib/data-isolation';
import {
  detecterTypeReel,
  extensionAutorisee,
  nomFichierSecurise,
  resoudreMimeType,
  stockerJustificatif,
  lireContenuJustificatif,
  MAX_TAILLE_OCTETS,
} from '@/lib/storage';
import {
  getUserInfoFromRequest,
  logAuditOperation,
  logParametreChange,
} from '@/lib/audit-log';

// ─── POST : Upload d'un justificatif ────────────────────────────────────────
// A-04 — route restaurée (supprimée par erreur lors d'anciens audits) avec
// les contrôles complets exigés :
//   - authentification + permissions API (checkAuth, cf. API_PERMISSIONS) ;
//   - périmètre société (data-isolation) : un rôle restreint ne peut toucher
//     qu'aux dossiers de SA société — fail-closed ;
//   - validation du CONTENU (magic bytes) + type/taille/extension ;
//   - stockage objet (Vercel Blob) ou DB en fallback (src/lib/storage) ;
//   - traçabilité : journal d'audit (création + consultation).
export async function POST(request: NextRequest) {
  const authErr = await checkAuth(request);
  if (authErr) return authErr;

  // Isolation des données (RLS applicatif) — fail-closed si compte restreint
  // sans société (rôle inconnu / externe non rattaché).
  const perimetre = perimetreDepuisHeaders(request.headers);
  const isolationError = refuserHorsPerimetre(perimetre);
  if (isolationError) return isolationError;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dossierId = formData.get('dossierId') as string | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ erreur: 'Fichier manquant' }, { status: 400 });
    }
    if (!dossierId) {
      return NextResponse.json({ erreur: 'Dossier ID manquant' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ erreur: 'Type de justificatif manquant' }, { status: 400 });
    }

    // Nom de fichier sécurisé : le nom client ne sert JAMAIS de chemin
    // (aucune traversée de répertoires possible — un seul segment est
    // conservé) ni de vecteur d'injection (Content-Disposition, clé blob).
    const nomFichier = nomFichierSecurise(file.name);

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

    // Vérification extension (sur le nom sécurisé)
    if (!extensionAutorisee(nomFichier)) {
      return NextResponse.json(
        { erreur: 'Extension non autorisée. Extensions acceptées : .pdf, .jpg, .jpeg, .png, .webp' },
        { status: 400 }
      );
    }

    // MIME final : déclaré s'il est whitelisté, sinon déduit de l'extension
    const mimeType = resoudreMimeType(nomFichier, file.type);
    if (!mimeType) {
      return NextResponse.json(
        { erreur: 'Type de fichier non supporté. Formats acceptés : PDF, JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    // ─── Validation du CONTENU (magic bytes) ────────────────────────────────
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

    // ─── Contrôle d'accès au dossier (périmètre société) ────────────────────
    // Rôles internes (ADMIN, DG, RS…) : tous dossiers. Rôles restreints
    // (ACCUEIL, TECHNIQUE, COMPTABILITE…) : societeId FORCÉ depuis le JWT —
    // un dossier d'une autre société est simplement introuvable (404).
    const dossier = await db.dossier.findFirst({
      where: avecPerimetreSociete({ id: dossierId }, perimetre),
      select: { id: true, numeroDossier: true, societeId: true },
    });
    if (!dossier) {
      return NextResponse.json(
        { erreur: 'Dossier introuvable ou hors de votre périmètre' },
        { status: 404 }
      );
    }

    // Identité : JWT de session validé (getUserInfoFromRequest) — jamais un
    // en-tête client brut (A-07 : les x-user-* sont réinjectés par le
    // middleware depuis le token signé).
    const { nom, id, role } = await getUserInfoFromRequest(request);
    const uploadedBy = id !== 'inconnu' ? id : null;

    // ─── Stockage : objet (Vercel Blob) si configuré, sinon DB (fallback) ──
    let resultat;
    try {
      resultat = await stockerJustificatif(bytes, {
        dossierId,
        nomFichier,
        mimeType,
      });
    } catch (e) {
      // Toute erreur à ce stade est une erreur de stockage (blob indisponible,
      // quota, réseau…) : message actionnable + log complet côté serveur.
      console.error('[UPLOAD] Stockage indisponible:', e);
      return NextResponse.json(
        { erreur: 'Service de stockage momentanément indisponible, réessayez plus tard.' },
        { status: 500 }
      );
    }

    // Créer l'entrée Justificatif en base (chemin = clé/URL en mode BLOB,
    // data URI en mode DB fallback) — nom = version sécurisée
    const justificatif = await db.justificatif.create({
      data: {
        dossierId,
        type,
        nomFichier,
        chemin: resultat.chemin,
        tailleKo: resultat.tailleKo,
        uploadedBy,
      },
    });

    // ─── Journal d'audit (création) ─────────────────────────────────────────
    await logAuditOperation({
      entite: 'Justificatif',
      entiteId: justificatif.id,
      action: 'CREATION',
      resume: `Justificatif ${type} ajouté au dossier ${dossier.numeroDossier} : ${nomFichier}`,
      module: 'Dossiers',
      objet: dossier.numeroDossier,
      societeId: dossier.societeId,
      modifiePar: nom,
      modifieParId: id,
      roleUtilisateur: role,
      request,
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
// n'est JAMAIS exposée au client). A-04 : le périmètre société s'applique
// aussi à la lecture — impossible de télécharger une pièce d'un dossier
// d'une autre société (l'ancienne route ne vérifiait RIEN sur le GET).
export async function GET(request: NextRequest) {
  const authErr = await checkAuth(request);
  if (authErr) return authErr;

  const perimetre = perimetreDepuisHeaders(request.headers);
  const isolationError = refuserHorsPerimetre(perimetre);
  if (isolationError) return isolationError;

  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ erreur: 'ID du justificatif manquant' }, { status: 400 });
    }

    // Récupérer le justificatif — la jointure dossier porte le périmètre :
    // pour un rôle restreint, societeId est forcé depuis le JWT.
    const justificatif = await db.justificatif.findFirst({
      where: {
        id,
        dossier: avecPerimetreSociete({}, perimetre),
      },
      select: {
        id: true,
        nomFichier: true,
        chemin: true,
        dossier: { select: { numeroDossier: true, societeId: true } },
      },
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

    // ─── Journal d'audit (consultation / téléchargement) ────────────────────
    const { nom, id: userId, role } = await getUserInfoFromRequest(request);
    await logParametreChange({
      entite: 'Justificatif',
      entiteId: justificatif.id,
      champ: 'telechargement',
      ancienneValeur: null,
      nouvelleValeur: justificatif.nomFichier,
      action: 'CONSULTATION',
      module: 'Dossiers',
      objet: `Téléchargement — dossier ${justificatif.dossier.numeroDossier}`,
      societeId: justificatif.dossier.societeId,
      modifiePar: nom,
      modifieParId: userId,
      roleUtilisateur: role,
      request,
    });

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
