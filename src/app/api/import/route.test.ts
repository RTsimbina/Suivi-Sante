/**
 * BIZ-7 — Contrôle de plafond et matrice de statuts dans POST /api/import.
 *
 * Ancien comportement :
 *   - création : le contrôle de plafond était un simple AVERTISSEMENT — un
 *     fichier erroné créait des dossiers hors plafond en les marquant en
 *     succès ;
 *   - mise à jour (ISA/SAGE) : montantValide et montantPaye étaient écrits
 *     sans AUCUN contrôle de plafond ;
 *   - le statut du fichier était appliqué tel quel, même hors matrice de
 *     transitions (RECU → PAYE directement).
 *
 * Nouveau comportement : toute ligne qui dépasserait le plafond est rejetée
 * (statutImport ERREUR, aucune écriture) ; une transition non autorisée est
 * retirée de la mise à jour (statut existant conservé) avec avertissement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks (hoistés) ─────────────────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  societeFindMany: vi.fn(),
  dossierFindUnique: vi.fn(),
  dossierUpdate: vi.fn(),
  dossierCreate: vi.fn(),
  importHistoriqueCreate: vi.fn(),
  importDossierCreate: vi.fn(),
}));

const excelMocks = vi.hoisted(() => ({
  readExcelRows: vi.fn(),
}));

const plafondMocks = vi.hoisted(() => ({
  verifierPlafondAnnuel: vi.fn(),
}));

const parseMocks = vi.hoisted(() => ({
  parseFormData: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    societe: { findMany: dbMocks.societeFindMany },
    dossier: {
      findUnique: dbMocks.dossierFindUnique,
      update: dbMocks.dossierUpdate,
      create: dbMocks.dossierCreate,
    },
    importHistorique: { create: dbMocks.importHistoriqueCreate },
    importDossier: { create: dbMocks.importDossierCreate },
  },
}));

vi.mock('@/lib/excel', () => ({
  readExcelRows: excelMocks.readExcelRows,
}));

vi.mock('@/lib/plafond-check', () => ({
  verifierPlafondAnnuel: plafondMocks.verifierPlafondAnnuel,
}));

vi.mock('@/lib/validation/parse', () => ({
  parseFormData: parseMocks.parseFormData,
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

import { POST } from './route';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function requeteImport(): NextRequest {
  return new Request('http://localhost/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as unknown as NextRequest;
}

function responder(source: 'ISA' | 'SAGE' | 'EXCEL' = 'ISA') {
  parseMocks.parseFormData.mockResolvedValue({
    success: true,
    data: {
      file: {
        type: MIME_XLSX,
        name: 'test.xlsx',
        size: 128,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      },
      source,
      categorie: '',
    },
  });
}

const SANLAM = { id: 's1', nom: 'SANLAM MADAGASCAR' };

const DOSSIER_EXISTANT = {
  id: 'd-1',
  numeroDossier: 'DOS-2026-0001',
  statut: 'EN_ANALYSE',
  assureId: 'a-1',
  societeId: 's1',
  typeDossier: 'CONSULTATION',
  dateReception: new Date('2026-05-10'),
  dateSoins: null,
  montantReclame: 100000,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.societeFindMany.mockResolvedValue([SANLAM]);
  dbMocks.dossierUpdate.mockResolvedValue({});
  dbMocks.dossierCreate.mockResolvedValue({});
  dbMocks.importHistoriqueCreate.mockResolvedValue({ id: 'imp-1' });
  dbMocks.importDossierCreate.mockResolvedValue({});
  plafondMocks.verifierPlafondAnnuel.mockResolvedValue({ autorise: true, alertes: [] });
});

// ─── Mise à jour (ISA) ───────────────────────────────────────────────────────

describe('BIZ-7 — import ISA : mise à jour de dossier existant', () => {
  const ligne = { NumeroDossier: 'DOS-2026-0001', Beneficiaire: 'Rakoto', Societe: 'SANLAM MADAGASCAR', DateReception: '2026-05-10' };

  it('dépassement de plafond sur montantValide → ligne ERREUR, AUCUNE écriture', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [{ ...ligne, MontantValide: '150000' }] });
    dbMocks.dossierFindUnique.mockResolvedValue(DOSSIER_EXISTANT);
    plafondMocks.verifierPlafondAnnuel.mockResolvedValue({
      autorise: false, raison: 'PLAFOND_ACTE_ATTEINT', message: 'Plafond CONSULTATION déjà atteint.', alertes: [],
    });

    const res = await POST(requeteImport());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nbErreurs).toBe(1);
    expect(body.anomalies.some((a: { message: string }) => a.message.includes('PLAFOND'))).toBe(true);
    expect(dbMocks.dossierUpdate).not.toHaveBeenCalled();
  });

  it('montantPaye (SAGE) est lui aussi soumis au contrôle de plafond', async () => {
    responder('SAGE');
    excelMocks.readExcelRows.mockResolvedValue({ rows: [{ ...ligne, MontantPaye: '400000', DatePaiement: '2026-09-01' }] });
    dbMocks.dossierFindUnique.mockResolvedValue(DOSSIER_EXISTANT);
    plafondMocks.verifierPlafondAnnuel.mockResolvedValue({
      autorise: false, raison: 'MONTANT_DEPASSE_RELIQUAT', message: 'Le montant demandé dépasse le reliquat.', alertes: [],
    });

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbErreurs).toBe(1);
    expect(dbMocks.dossierUpdate).not.toHaveBeenCalled();
    // le contrôle porte sur le montant EFFECTIF (payé ?? validé)
    expect(plafondMocks.verifierPlafondAnnuel).toHaveBeenCalledWith(
      expect.objectContaining({ montantDemande: 400000, excludeDossierId: 'd-1' })
    );
  });

  it('transition non autorisée (EN_ANALYSE → PAYE) → statut retiré, montant écrit quand même', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [{ ...ligne, MontantValide: '80000', StatutTechnique: 'PAYE' }] });
    dbMocks.dossierFindUnique.mockResolvedValue(DOSSIER_EXISTANT);

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbSucces).toBe(1);
    expect(dbMocks.dossierUpdate).toHaveBeenCalledTimes(1);
    const data = dbMocks.dossierUpdate.mock.calls[0][0].data;
    expect(data.statut).toBeUndefined();
    expect(data.montantValide).toBe(80000);
    expect(body.anomalies.some((a: { message: string }) => a.message.includes('non autorisée'))).toBe(true);
  });

  it('transition autorisée (EN_ANALYSE → VALIDE) et plafond OK → écriture complète', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [{ ...ligne, MontantValide: '80000', StatutTechnique: 'VALIDE' }] });
    dbMocks.dossierFindUnique.mockResolvedValue(DOSSIER_EXISTANT);

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbSucces).toBe(1);
    const data = dbMocks.dossierUpdate.mock.calls[0][0].data;
    expect(data.statut).toBe('VALIDE');
    expect(data.montantValide).toBe(80000);
  });

  it('dossier sans assureId → pas de contrôle de plafond possible, écriture autorisée', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [{ ...ligne, MontantValide: '9000000' }] });
    dbMocks.dossierFindUnique.mockResolvedValue({ ...DOSSIER_EXISTANT, assureId: null });

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbSucces).toBe(1);
    expect(plafondMocks.verifierPlafondAnnuel).not.toHaveBeenCalled();
    expect(dbMocks.dossierUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── Création ────────────────────────────────────────────────────────────────

describe('BIZ-7 — import : création de dossier', () => {
  const ligne = { NumeroDossier: 'DOS-2026-0099', Beneficiaire: 'Randria', Societe: 'SANLAM MADAGASCAR', TypeDossier: 'CONSULTATION', MontantReclame: '150000', DateReception: '2026-06-01', AssureId: 'a-1' };

  it('dépassement de plafond à la création → ligne ERREUR, AUCUNE création', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [ligne] });
    dbMocks.dossierFindUnique.mockResolvedValue(null);
    plafondMocks.verifierPlafondAnnuel.mockResolvedValue({
      autorise: false, raison: 'PLAFOND_ACTE_ATTEINT', message: 'Plafond déjà atteint.', alertes: [],
    });

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbErreurs).toBe(1);
    expect(body.nbSucces).toBe(0);
    expect(dbMocks.dossierCreate).not.toHaveBeenCalled();
  });

  it('plafond respecté à la création → dossier créé avec la fenêtre annuelle de réception', async () => {
    responder();
    excelMocks.readExcelRows.mockResolvedValue({ rows: [ligne] });
    dbMocks.dossierFindUnique.mockResolvedValue(null);

    const res = await POST(requeteImport());
    const body = await res.json();

    expect(body.nbSucces).toBe(1);
    expect(dbMocks.dossierCreate).toHaveBeenCalledTimes(1);
    // BIZ-2 : la fenêtre de consommation est ancrée sur dateReception
    expect(plafondMocks.verifierPlafondAnnuel).toHaveBeenCalledWith(
      expect.objectContaining({ dateReception: expect.any(Date) })
    );
  });
});
