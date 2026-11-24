/**
 * Tests de la route /api/upload — A-04 (route restaurée avec contrôles) :
 * - validation du contenu (magic bytes), type, taille, extension ;
 * - périmètre société (data-isolation) sur l'upload ET le téléchargement ;
 * - journal d'audit : création (POST) + consultation (GET) ;
 * - erreurs de stockage actionnables.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  dossierFindFirst: vi.fn(),
  justificatifCreate: vi.fn(),
  justificatifFindFirst: vi.fn(),
}));

const blobMocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  getUserInfoFromRequest: vi.fn(),
  logAuditOperation: vi.fn(),
  logParametreChange: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    dossier: { findFirst: dbMocks.dossierFindFirst },
    justificatif: {
      create: dbMocks.justificatifCreate,
      findFirst: dbMocks.justificatifFindFirst,
    },
  },
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit-log', () => ({
  getUserInfoFromRequest: auditMocks.getUserInfoFromRequest,
  logAuditOperation: auditMocks.logAuditOperation,
  logParametreChange: auditMocks.logParametreChange,
}));

vi.mock('@vercel/blob', () => ({
  put: blobMocks.put,
}));

import { POST, GET } from './route';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PDF_VALIDE: Uint8Array<ArrayBuffer> = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const HTML_DEGUISE: Uint8Array<ArrayBuffer> = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>') as Uint8Array<ArrayBuffer>;

const DOSSIER_PROPRE = { id: 'dos-1', numeroDossier: 'DOS-2024-001', societeId: 'soc-1' };

function enTetes(role: string, societeId?: string): Record<string, string> {
  // Simule l'injection middleware A-07 : x-user-* viennent du JWT signé.
  const h: Record<string, string> = { 'x-user-role': role };
  if (societeId !== undefined) h['x-user-societeid'] = societeId;
  return h;
}

function requeteUpload(
  fichier: File,
  dossierId = 'dos-1',
  headers: Record<string, string> = enTetes('ADMINISTRATEUR')
): NextRequest {
  const fd = new FormData();
  fd.set('file', fichier);
  fd.set('dossierId', dossierId);
  fd.set('type', 'FACTURE');
  return new NextRequest(new URL('http://localhost/api/upload'), { method: 'POST', body: fd, headers });
}

function requeteDownload(id: string, headers: Record<string, string> = enTetes('ADMINISTRATEUR')): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/upload?id=${id}`), { headers });
}

function fichierPdf(contenu: Uint8Array<ArrayBuffer>, nom = 'facture.pdf'): File {
  return new File([new Blob([contenu], { type: 'application/pdf' })], nom, { type: 'application/pdf' });
}

const CHEMIN_DATA_URI = `data:application/pdf;base64,${Buffer.from(PDF_VALIDE).toString('base64')}`;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  auditMocks.getUserInfoFromRequest.mockResolvedValue({
    nom: 'Test Utilisateur',
    id: 'usr-1',
    role: 'ADMINISTRATEUR',
  });
  auditMocks.logAuditOperation.mockResolvedValue('op-1');
  auditMocks.logParametreChange.mockResolvedValue(undefined);
  dbMocks.dossierFindFirst.mockResolvedValue(DOSSIER_PROPRE);
  dbMocks.justificatifCreate.mockImplementation(async ({ data }) => ({ id: 'just-1', ...data }));
  dbMocks.justificatifFindFirst.mockResolvedValue({
    id: 'just-1',
    nomFichier: 'facture.pdf',
    chemin: CHEMIN_DATA_URI,
    dossier: { numeroDossier: 'DOS-2024-001', societeId: 'soc-1' },
  });
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

// ─── POST : validation du contenu ────────────────────────────────────────────

describe('POST /api/upload — validation du contenu', () => {
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

  it('REFUSE un type de justificatif inconnu', async () => {
    const fd = new FormData();
    fd.set('file', fichierPdf(PDF_VALIDE));
    fd.set('dossierId', 'dos-1');
    fd.set('type', 'PIECE_IDENTITE');
    const req = new NextRequest(new URL('http://localhost/api/upload'), {
      method: 'POST',
      body: fd,
      headers: enTetes('ADMINISTRATEUR'),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── POST : périmètre société + audit ────────────────────────────────────────

describe('POST /api/upload — périmètre société et audit (A-04)', () => {
  it('REFUSE un rôle externe sans société rattachée (fail-closed 403)', async () => {
    const res = await POST(
      requeteUpload(fichierPdf(PDF_VALIDE), 'dos-1', enTetes('PORTAIL_CLIENT'))
    );
    expect(res.status).toBe(403);
    expect(dbMocks.dossierFindFirst).not.toHaveBeenCalled();
  });

  it('FORCE le societeId du JWT : un dossier d’une autre société est introuvable (404)', async () => {
    dbMocks.dossierFindFirst.mockResolvedValue(null);
    const res = await POST(
      requeteUpload(fichierPdf(PDF_VALIDE), 'dos-autre-societe', enTetes('PORTAIL_CLIENT', 'soc-1'))
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.erreur).toContain('périmètre');
    // Le where transmis à Prisma porte le societeId FORCÉ (jamais celui du client) :
    const where = dbMocks.dossierFindFirst.mock.calls[0][0].where;
    expect(where.societeId).toBe('soc-1');
    expect(where.id).toBe('dos-autre-societe');
  });

  it('Autorise un rôle interne (ACCUEIL) sur son périmètre global et trace la création', async () => {
    const res = await POST(
      requeteUpload(fichierPdf(PDF_VALIDE), 'dos-1', enTetes('ACCUEIL'))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'just-1', nomFichier: 'facture.pdf', type: 'FACTURE', stockage: 'DB' });
    // Rôle interne : pas de societeId forcé dans le where
    const where = dbMocks.dossierFindFirst.mock.calls[0][0].where;
    expect(where.societeId).toBeUndefined();
    // Audit création :
    expect(auditMocks.logAuditOperation).toHaveBeenCalledTimes(1);
    const params = auditMocks.logAuditOperation.mock.calls[0][0];
    expect(params).toMatchObject({
      entite: 'Justificatif',
      action: 'CREATION',
      societeId: 'soc-1',
      modifiePar: 'Test Utilisateur',
      modifieParId: 'usr-1',
    });
    // uploadedBy = identité validée (id du JWT), pas un header client brut
    expect(dbMocks.justificatifCreate.mock.calls[0][0].data.uploadedBy).toBe('usr-1');
  });

  it('Renvoie une erreur actionnable quand le stockage est indisponible', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token-test';
    blobMocks.put.mockRejectedValue(new Error('blob indisponible'));
    const res = await POST(requeteUpload(fichierPdf(PDF_VALIDE)));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.erreur).toContain('stockage');
    expect(dbMocks.justificatifCreate).not.toHaveBeenCalled();
    expect(auditMocks.logAuditOperation).not.toHaveBeenCalled();
  });
});

// ─── GET : téléchargement + périmètre + audit ────────────────────────────────

describe('GET /api/upload — téléchargement contrôlé (A-04)', () => {
  it('Proxy le binaire sans exposer l’URL de stockage et trace la consultation', async () => {
    const res = await GET(requeteDownload('just-1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('facture.pdf');
    const texte = Buffer.from(await res.arrayBuffer()).toString('latin1');
    expect(texte.startsWith('%PDF')).toBe(true);
    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    const params = auditMocks.logParametreChange.mock.calls[0][0];
    expect(params).toMatchObject({
      entite: 'Justificatif',
      action: 'CONSULTATION',
      societeId: 'soc-1',
      modifieParId: 'usr-1',
    });
  });

  it('Refuse le téléchargement d’une pièce hors périmètre société (404)', async () => {
    dbMocks.justificatifFindFirst.mockResolvedValue(null);
    const res = await GET(requeteDownload('just-etranger', enTetes('PORTAIL_CLIENT', 'soc-1')));
    expect(res.status).toBe(404);
    // Le périmètre est appliqué sur la RELATION dossier (jointure) :
    const where = dbMocks.justificatifFindFirst.mock.calls[0][0].where;
    expect(where.dossier.societeId).toBe('soc-1');
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('Exige un identifiant de justificatif (400)', async () => {
    const res = await GET(new NextRequest(new URL('http://localhost/api/upload'), { headers: enTetes('ADMINISTRATEUR') }));
    expect(res.status).toBe(400);
  });
});
