/**
 * BIZ-1 — Transition EN_ANALYSE → VALIDE : le montant EFFECTIVEMENT consommé
 * est max(montantReclame, montantValide) et la vérification est faite dans
 * la transaction sérialisée (verrou FOR UPDATE sur le barème).
 *
 * Ancien comportement : la branche transactionnelle ne comparait que la
 * consommation EXISTANTE au plafond — un montant validé de 150 000 Ar
 * envoyé avec la transition passait sur un plafond de 100 000 Ar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

// ─── Mocks (hoistés) ─────────────────────────────────────────────────────────

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn().mockResolvedValue([]),
  baremeFindFirst: vi.fn(),
  dossierFindMany: vi.fn().mockResolvedValue([]),
  dossierUpdate: vi.fn(),
  // Traçabilité KPI (synchroniserEtapes dans la même transaction)
  etapeFindMany: vi.fn().mockResolvedValue([]),
  etapeUpdate: vi.fn().mockResolvedValue({}),
  etapeCreate: vi.fn().mockResolvedValue({}),
}));

const dbMocks = vi.hoisted(() => ({
  dossierFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

const plafondMocks = vi.hoisted(() => ({
  verifierPlafondAnnuel: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    dossier: { findUnique: dbMocks.dossierFindUnique },
    $transaction: dbMocks.transaction,
  },
}));

// Le pré-check hors transaction est neutralisé : on teste la BRANCHE
// TRANSACTIONNELLE (dernier rempart contre les courses concurrentes).
// fenetreAnnuelle reste réelle (elle est appelée dans la transaction).
vi.mock('@/lib/plafond-check', async (importOriginal) => ({
  ...(await importOriginal()),
  verifierPlafondAnnuel: plafondMocks.verifierPlafondAnnuel,
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit-log', () => ({
  logAuditOperation: vi.fn().mockResolvedValue(null),
  getUserInfoFromRequest: vi.fn().mockResolvedValue({ nom: 'Test', id: 'u-1' }),
}));

import { PATCH } from './route';

const BAREME = {
  id: 'b-1', societeId: 's-1', prestation: 'CONSULTATION', tauxCouverture: 70,
  plafond: new Prisma.Decimal(100000), description: null, active: true,
  valideDu: new Date('2025-01-01'), valideAu: null, version: 1, supprime: false,
};

function dossierExistant() {
  return {
    id: 'd-1', numeroDossier: 'DOS-2026-0001', statut: 'EN_ANALYSE',
    societeId: 's-1', societe: { id: 's-1', nom: 'SANLAM' },
    assureId: 'a-1', typeDossier: 'CONSULTATION', dateReception: new Date('2026-05-10'),
    dateSoins: null, montantReclame: new Prisma.Decimal(100000),
    montantValide: null, montantPaye: null, ticketModerateur: null,
    prestataireId: null, historique: '[]',
    gestionnaireAccueil: null, gestionnaireTechnique: null, gestionnaireCompta: null,
  };
}

function requetePatch(body: unknown): NextRequest {
  const r = new Request('http://localhost/api/dossiers/d-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'TECHNIQUE', 'x-user-id': 'u-1' },
    body: JSON.stringify(body),
  });
  Object.defineProperty(r, 'nextUrl', { value: new URL('http://localhost/api/dossiers/d-1') });
  return r as unknown as NextRequest;
}

const CONTEXTE = { params: Promise.resolve({ id: 'd-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  txMocks.queryRaw.mockResolvedValue([]);
  txMocks.baremeFindFirst.mockResolvedValue(BAREME);
  txMocks.dossierFindMany.mockResolvedValue([]); // consommation des AUTRES dossiers : 0
  dbMocks.dossierFindUnique.mockResolvedValue(dossierExistant());
  plafondMocks.verifierPlafondAnnuel.mockResolvedValue({
    autorise: true, raison: 'OK', message: '', alertes: [],
    details: { ticketModerateur: null },
  });
  dbMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txMocks.queryRaw,
      bareme: { findFirst: txMocks.baremeFindFirst },
      dossier: { findMany: txMocks.dossierFindMany, update: txMocks.dossierUpdate },
      etapeTraitement: {
        findMany: txMocks.etapeFindMany,
        update: txMocks.etapeUpdate,
        create: txMocks.etapeCreate,
      },
    })
  );
  txMocks.dossierUpdate.mockResolvedValue({ id: 'd-1', statut: 'VALIDE' });
});

describe('BIZ-1 — PATCH : transition sérialisée vers VALIDE', () => {
  it('montant validé 150 000 sur plafond 100 000 → 422 PLAFOND_ATTEINT_TRANSACTION', async () => {
    const res = await PATCH(requetePatch({ statut: 'VALIDE', montantValide: 150000 }), CONTEXTE);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.plafondAtteint).toBe(true);
    // AUCUNE écriture : la transaction a avorté
    expect(txMocks.dossierUpdate).not.toHaveBeenCalled();
  });

  it('montant validé 80 000 ≤ plafond → 200, verrou FOR UPDATE pris avant la relecture', async () => {
    // Réserve cohérente avec la règle d'entrée : le montant réclamé ne
    // consomme pas le plafond au juste (80 000 < 100 000).
    dbMocks.dossierFindUnique.mockResolvedValue({
      ...dossierExistant(),
      montantReclame: new Prisma.Decimal(80000),
    });

    const res = await PATCH(requetePatch({ statut: 'VALIDE', montantValide: 80000 }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.dossierUpdate).toHaveBeenCalledTimes(1);
    // sérialisation : le verrou précède la relecture de la consommation
    expect(String(txMocks.queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(txMocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      txMocks.dossierFindMany.mock.invocationCallOrder[0]
    );
  });

  it('montant réclamé élevé SANS montant validé : bloqué aussi (montantReclame > plafond)', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue({
      ...dossierExistant(),
      montantReclame: new Prisma.Decimal(180000),
    });

    const res = await PATCH(requetePatch({ statut: 'VALIDE' }), CONTEXTE);

    expect(res.status).toBe(422);
    expect(txMocks.dossierUpdate).not.toHaveBeenCalled();
  });
});
