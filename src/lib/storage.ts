/**
 * Stockage des justificatifs — plan P3 Vague 1 (point 3 : "Base64 en DB").
 *
 * Architecture cible :
 *   Upload → validation magic bytes → STOCKAGE OBJET (Vercel Blob) → clé/URL en DB.
 *
 * Deux modes, choisis automatiquement :
 *   - BLOB : si BLOB_READ_WRITE_TOKEN est défini (store Vercel Blob lié au
 *     projet). Le fichier binaire vit dans le stockage objet ; la table
 *     Justificatif ne conserve que la clé (URL), le nom, le MIME et la taille.
 *     L'URL n'est JAMAIS exposée au client : GET /api/upload proxy le binaire
 *     depuis le stockage pour un client authentifié.
 *   - DB (fallback) : data URI en base — comportement historique, conservé
 *     tant que le store Blob n'est pas créé/configuré, pour ne pas casser
 *     l'upload en production. Les nouveaux data URI s'arrêtent dès que
 *     BLOB_READ_WRITE_TOKEN est défini dans Vercel.
 *
 * Les fichiers existants (data URI) restent téléchargeables : lireContenu
 * gère les deux formats (le GET ne regarde pas le mode, seulement le préfixe).
 */

import { randomUUID } from 'node:crypto';

export type ModeStockage = 'BLOB' | 'DB';

export interface ResultatStockage {
  mode: ModeStockage;
  /** URL blob (mode BLOB) ou data URI (mode DB) — stocké dans Justificatif.chemin */
  chemin: string;
  mimeType: string;
  tailleKo: number;
}

export const MAX_TAILLE_OCTETS = 10 * 1024 * 1024; // 10 Mo

// ─── Types MIME autorisés (whitelist stricte, plan P3 : "refuser les MIME dangereux") ───
export const TYPES_AUTORISES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const EXTENSIONS_AUTORISES = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const EXT_VERS_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function extensionDe(nomFichier: string): string {
  const idx = nomFichier.lastIndexOf('.');
  return idx >= 0 ? nomFichier.slice(idx).toLowerCase() : '';
}

/**
 * MIME final du fichier : celui déclaré S'il est dans la whitelist, sinon
 * déduit de l'extension. Un MIME non déductible → null (refusé).
 */
export function resoudreMimeType(nomFichier: string, mimeDeclare: string): string | null {
  if (TYPES_AUTORISES.has(mimeDeclare)) return mimeDeclare;
  return EXT_VERS_MIME[extensionDe(nomFichier)] ?? null;
}

export function extensionAutorisee(nomFichier: string): boolean {
  return EXTENSIONS_AUTORISES.has(extensionDe(nomFichier));
}

// ─── Magic bytes : le contenu réel doit correspondre au format déclaré ──────
// Empêche les fichiers déguisés (HTML/script renommé .pdf, polyglottes…) —
// le MIME déclaré et l'extension sont fournis par le client, le contenu
// lui ne ment pas.

export function detecterTypeReel(bytes: Uint8Array): string | null {
  // %PDF-
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  // FF D8 FF (JPEG SOI + marqueur)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // 89 50 4E 47 0D 0A 1A 0A (\x89PNG\r\n\x1a\n)
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  // RIFF....WEBP
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

// ─── Stockage ───────────────────────────────────────────────────────────────

export function stockageBlobDisponible(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function stockerJustificatif(
  bytes: Uint8Array,
  opts: { dossierId: string; nomFichier: string; mimeType: string },
): Promise<ResultatStockage> {
  const tailleKo = Math.max(1, Math.round(bytes.byteLength / 1024));

  if (stockageBlobDisponible()) {
    // Import dynamique : le module n'est chargé que si le stockage objet est configuré.
    const { put } = await import('@vercel/blob');
    // Nom aléatoire : empêche les collisions et les chemins prévisibles.
    const cle = `justificatifs/${opts.dossierId}/${randomUUID()}-${opts.nomFichier}`;
    const blob = await put(cle, Buffer.from(bytes), {
      contentType: opts.mimeType,
      access: 'public',
      addRandomSuffix: false,
    });
    return {
      mode: 'BLOB',
      chemin: blob.url,
      mimeType: opts.mimeType,
      tailleKo,
    };
  }

  // Fallback : data URI en base (comportement historique).
  const base64 = Buffer.from(bytes).toString('base64');
  return {
    mode: 'DB',
    chemin: `data:${opts.mimeType};base64,${base64}`,
    mimeType: opts.mimeType,
    tailleKo,
  };
}

/** Erreur de lecture stockage avec code actionnable. */
export class ErreurStockage extends Error {
  constructor(public readonly code: 'FORMAT_INVALIDE' | 'FICHIER_DISTANT_INACCESSIBLE') {
    super(code);
  }
}

/**
 * Lit le contenu d'un justificatif, quel que soit son mode de stockage
 * (data URI historique ou URL blob). Pour une URL blob, le binaire est
 * proxifié serveur : l'URL du stockage objet n'est jamais envoyée au client.
 */
export async function lireContenuJustificatif(chemin: string): Promise<{ bytes: Buffer<ArrayBuffer>; mimeType: string | null }> {
  if (chemin.startsWith('data:')) {
    const m = chemin.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new ErreurStockage('FORMAT_INVALIDE');
    return { bytes: Buffer.from(m[2], 'base64'), mimeType: m[1] };
  }

  // URL de stockage objet (Vercel Blob)
  if (chemin.startsWith('http://') || chemin.startsWith('https://')) {
    const res = await fetch(chemin);
    if (!res.ok) throw new ErreurStockage('FICHIER_DISTANT_INACCESSIBLE');
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, mimeType: res.headers.get('content-type') };
  }

  throw new ErreurStockage('FORMAT_INVALIDE');
}
