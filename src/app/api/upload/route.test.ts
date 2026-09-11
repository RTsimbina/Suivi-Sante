/**
 * Tests de la route /api/upload — plan P3 Vague 1 :
 * - refus des fichiers déguisés (magic bytes ≠ format déclaré) ;
 * - stockage DB (fallback) et BLOB selon BLOB_READ_WRITE_TOKEN ;
 * - GET qui proxy le binaire sans exposer l'URL de stockage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  dossierFindUnique: vi.fn(),
  justificatifCreate: vi.fn(),
  justificatifFindUnique: vi.fn(),
}));

const blobMocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    dossier: { findUnique: dbMocks.dossierFindUnique },
    justificatif: { create: dbMocks.justificatifCreate, findUnique: dbMocks.justificatifFindUnique },
  },
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue({ id: 'user-1' }),
}));

vi.mock('@vercel/blob', () => ({
  put: blobMocks.put,
}));

import { POST, GET } from './route';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PDF_VALIDE: Uint8Array<ArrayBuffer> = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const HTML_DEGUISE: Uint8Array<ArrayBuffer> = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>') as Uint8Array<ArrayBuffer>;

function requeteUpload(fichier: File, dossierId = 'dos-1'): NextRequest {
  const fd = new FormData();
  fd.set('file', fichier);
  fd.set('dossierId', dossierId);
  fd.set('type', 'FACTURE');
  return new NextRequest(new URL('http://localhost/api/upload'), { method: 'POST', body: fd });
}

function fichierPdf(contenu: Uint8Array<ArrayBuffer>, nom = 'facture.pdf'): File {
  return new File([new Blob([contenu], { type: 'application/pdf' })], nom, { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  dbMocks.dossierFindUnique.mockResolvedValue({ id: 'dos-1' });
  dbMocks.justificatifCreate.mockImplementation(async ({ data }) => ({ id: 'just-1', ...data }));
  dbMocks.justificatifFindUnique.mockResolvedValue({
    id: 'just-1',
    nomFichier: 'facture.pdf',
    chemin: `data:application/pdf;base64,${Buffer.from(PDF_VALIDE).toString('base64')}`,
  });
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe('POST /api/upload — validation du contenu (plan P3)', () => {
  it('REFUSE un fichier HTML déguisé en .pdf (magic bytes ne mentent pas)', async () => {
    const res = await POST(requeteUpload(fichierPdf(HTML_DEGUISE)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.erreur).toContain('ne correspond');
    expect(dbMocks.justificatifCreate).not.toHaveBeenCalled();
  });

  it('REFUSE un MIME non résolvable (extension inconnue)', async () => {
    const file = new File([new Blob([HTML_DEGUISE], { type: 'text/html' })], 'page.html', { type: 'text/html' });
    const res = await POST(requeteUpload(file));
    expect(res.status).toBe(400);
    expect(dbMocks.justificatifCreate).not.toHaveBeenCalled();
  });

  it('REFUSE un fichier trop volumineux (> 10 Mo)', async () => {
    // Vrai blob de 11 Mo (la taille est vérifiée avant les magic bytes)
    const gros = new File([new ArrayBuffer(11 * 1024 * 1024)], 'gros.pdf', { type: 'application/pdf' });
    const res = await POST(requeteUpload(gros));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.erreur).toContain('trop volumineux');
  });

  it('renvoie 404 si le dossier n\u2019existe pas', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(null);
    const res = await POST(requeteUpload(fichierPdf(PDF_VALIDE)));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/upload — mode de stockage', () => {
  it('mode DB (fallback) : un vrai PDF est stocké en data URI tant que le Blob n\u2019est pas configuré', async () => {
    const res = await POST(requeteUpload(fichierPdf(PDF_VALIDE)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stockage).toBe('DB');
    const data = dbMocks.justificatifCreate.mock.calls[0][0].data;
    expect(data.chemin.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(data.uploadedBy).toBe('user-1');
  });

  it('mode BLOB : dès que BLOB_READ_WRITE_TOKEN existe, la DB ne conserve que la clé/URL', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    blobMocks.put.mockResolvedValue({ url: 'https://abc.public.blob.vercel-storage.com/justificatifs/dos-1/x-facture.pdf' });

    const res = await POST(requeteUpload(fichierPdf(PDF_VALIDE)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stockage).toBe('BLOB');
    const data = dbMocks.justificatifCreate.mock.calls[0][0].data;
    expect(data.chemin).toBe('https://abc.public.blob.vercel-storage.com/justificatifs/dos-1/x-facture.pdf');
    expect(data.chemin).not.toContain('base64');
    expect(blobMocks.put).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/upload — téléchargement multi-modes', () => {
  it('sert un justificatif historique (data URI) avec Content-Disposition', async () => {
    const res = await GET(new NextRequest(new URL('http://localhost/api/upload?id=just-1')));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('facture.pdf');
  });

  it('proxy un justificatif BLOB sans jamais exposer l\u2019URL de stockage', async () => {
    dbMocks.justificatifFindUnique.mockResolvedValue({
      id: 'just-2',
      nomFichier: 'ordonnance.pdf',
      chemin: 'https://abc.public.blob.vercel-storage.com/justificatifs/dos-1/ordonnance.pdf',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from(PDF_VALIDE), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(new NextRequest(new URL('http://localhost/api/upload?id=just-2')));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('ordonnance.pdf');
    expect(fetchMock).toHaveBeenCalledWith('https://abc.public.blob.vercel-storage.com/justificatifs/dos-1/ordonnance.pdf');
    vi.unstubAllGlobals();
  });

  it('renvoie 404 pour un justificatif inconnu', async () => {
    dbMocks.justificatifFindUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest(new URL('http://localhost/api/upload?id=ghost')));
    expect(res.status).toBe(404);
  });
});
