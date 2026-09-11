/**
 * Tests du module de stockage des justificatifs (plan P3 Vague 1) :
 * magic bytes, whitelist MIME, mode BLOB / fallback DB, lecture proxy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const blobMocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: blobMocks.put,
}));

import {
  detecterTypeReel,
  resoudreMimeType,
  extensionAutorisee,
  stockerJustificatif,
  lireContenuJustificatif,
  ErreurStockage,
} from './storage';

// ─── Fixtures binaires réelles ──────────────────────────────────────────────
const PDF_VALIDE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const JPEG_VALIDE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_VALIDE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP_VALIDE = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const HTML_DEGUISE = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>');
const SVG_DEGUISE = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe('detecterTypeReel (magic bytes — plan P3)', () => {
  it('reconnaît les vrais formats autorisés', () => {
    expect(detecterTypeReel(PDF_VALIDE)).toBe('application/pdf');
    expect(detecterTypeReel(JPEG_VALIDE)).toBe('image/jpeg');
    expect(detecterTypeReel(PNG_VALIDE)).toBe('image/png');
    expect(detecterTypeReel(WEBP_VALIDE)).toBe('image/webp');
  });

  it('renvoie null pour un contenu non reconnu : HTML/SVG déguisés, buffer vide', () => {
    expect(detecterTypeReel(HTML_DEGUISE)).toBeNull();
    expect(detecterTypeReel(SVG_DEGUISE)).toBeNull();
    expect(detecterTypeReel(new Uint8Array(0))).toBeNull();
  });

  it('renvoie null si la signature est incomplète (polyglotte tronqué)', () => {
    // "RIF" seul — signature WebP incomplète
    expect(detecterTypeReel(new Uint8Array([0x52, 0x49, 0x46]))).toBeNull();
  });
});

describe('resoudreMimeType / extensionAutorisee', () => {
  it('fait confiance au MIME déclaré s\u2019il est whitelisté', () => {
    expect(resoudreMimeType('facture.PDF', 'application/pdf')).toBe('application/pdf');
  });

  it('déduit le MIME de l\u2019extension sinon', () => {
    expect(resoudreMimeType('photo.jpg', '')).toBe('image/jpeg');
    expect(resoudreMimeType('doc.pdf', 'text/html')).toBe('application/pdf');
  });

  it('renvoie null pour un type inconnu (refus par défaut)', () => {
    expect(resoudreMimeType('malware.exe', 'application/x-msdownload')).toBeNull();
    expect(resoudreMimeType('page.html', 'text/html')).toBeNull();
  });

  it('refuse les extensions non whitelistées', () => {
    expect(extensionAutorisee('ok.pdf')).toBe(true);
    expect(extensionAutorisee('ok.JPEG')).toBe(true);
    expect(extensionAutorisee('ko.exe')).toBe(false);
    expect(extensionAutorisee('ko.svg')).toBe(false);
    expect(extensionAutorisee('sans-extension')).toBe(false);
  });
});

describe('stockerJustificatif', () => {
  it('mode DB (fallback) : stocke un data URI tant que le Blob n\u2019est pas configuré', async () => {
    const res = await stockerJustificatif(PDF_VALIDE, {
      dossierId: 'dos-1',
      nomFichier: 'facture.pdf',
      mimeType: 'application/pdf',
    });

    expect(res.mode).toBe('DB');
    expect(res.chemin.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(res.tailleKo).toBeGreaterThanOrEqual(1);
    expect(blobMocks.put).not.toHaveBeenCalled();
  });

  it('mode BLOB dès que BLOB_READ_WRITE_TOKEN est défini : la DB ne garde que la clé', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    blobMocks.put.mockResolvedValue({ url: 'https://abc.public.blob.vercel-storage.com/justificatifs/x/facture.pdf' });

    const res = await stockerJustificatif(PDF_VALIDE, {
      dossierId: 'dos-1',
      nomFichier: 'facture.pdf',
      mimeType: 'application/pdf',
    });

    expect(res.mode).toBe('BLOB');
    // La clé demandée au stockage est hiérarchique et contient le dossier
    expect(blobMocks.put.mock.calls[0][0]).toContain('justificatifs/dos-1/');
    // Ce que la DB conservera = l'URL renvoyée par le stockage (clé vers le binaire)
    expect(res.chemin).toBe('https://abc.public.blob.vercel-storage.com/justificatifs/x/facture.pdf');
    expect(res.chemin).not.toContain('base64');
    expect(blobMocks.put).toHaveBeenCalledTimes(1);
    expect(blobMocks.put.mock.calls[0][2]).toEqual(
      expect.objectContaining({ contentType: 'application/pdf', access: 'public', addRandomSuffix: false })
    );
  });
});

describe('lireContenuJustificatif', () => {
  it('lit un data URI historique (justificatifs existants)', async () => {
    const chemin = `data:application/pdf;base64,${Buffer.from(PDF_VALIDE).toString('base64')}`;
    const { bytes, mimeType } = await lireContenuJustificatif(chemin);
    expect(mimeType).toBe('application/pdf');
    expect(bytes.equals(Buffer.from(PDF_VALIDE))).toBe(true);
  });

  it('proxy un justificatif stocké en BLOB sans exposer l\u2019URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from(PDF_VALIDE), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { bytes, mimeType } = await lireContenuJustificatif('https://abc.public.blob.vercel-storage.com/f.pdf');
    expect(mimeType).toBe('application/pdf');
    expect(bytes.equals(Buffer.from(PDF_VALIDE))).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://abc.public.blob.vercel-storage.com/f.pdf');
    vi.unstubAllGlobals();
  });

  it('lève FICHIER_DISTANT_INACCESSIBLE si le stockage objet répond en erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })));
    await expect(lireContenuJustificatif('https://abc.public.blob.vercel-storage.com/f.pdf'))
      .rejects.toThrow(ErreurStockage);
    vi.unstubAllGlobals();
  });

  it('lève FORMAT_INVALIDE pour un chemin non reconnu', async () => {
    await expect(lireContenuJustificatif('/tmp/fichier-local.pdf')).rejects.toThrow(ErreurStockage);
  });
});
