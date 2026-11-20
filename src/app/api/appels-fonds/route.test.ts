/**
 * Tests de la route POST /api/appels-fonds — atomicité budget + garde-fous.
 *
 * Correctifs :
 *   - audit P2 : la création de l'appel et l'incrément du budgetUtilise du
 *     contrat doivent s'exécuter dans la MÊME transaction ;
 *   - BIZ-6 : verrou FOR UPDATE sur le contrat, statut ACTIF exigé, date
 *     d'appel dans la période contractuelle, refus du dépassement du budget
 *     annuel (avant : incrément aveugle, solde > 100 % sans erreur).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn().mockResolvedValue([]),
  contratFindUnique: vi.fn(),
  contratUpdate: vi.fn(),
  appelCreate: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { $transaction: dbMocks.transaction },
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

import { POST } from './route';

function requetePost(body: unknown): NextRequest {
  return new Request('http://localhost/api/appels-fonds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const PAYLOAD_VALIDE = {
  contratId: 'clx-contrat-1',
  montant: 150000,
  dateAppel: '2026-09-11',
  observations: 'T3 2026',
};

/** Contrat actif, période 2026, budget 1 000 000 Ar, 1000 Ar déjà utilisés. */
function contratValide() {
  return {
    id: 'clx-contrat-1',
    statut: 'ACTIF',
    dateDebut: new Date('2026-01-01'),
    dateFin: new Date('2026-12-31'),
    budgetAnnuel: 1000000,
    budgetUtilise: 1000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMocks.queryRaw.mockResolvedValue([]);
  // $transaction(fn) → exécute fn avec un faux client tx
  dbMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txMocks.queryRaw,
      contrat: {
        findUnique: txMocks.contratFindUnique,
        update: txMocks.contratUpdate,
      },
      appelDeFonds: { create: txMocks.appelCreate },
    })
  );
});

describe('POST /api/appels-fonds', () => {
  it('crée l’appel et incrémente le budgetUtilise dans la même transaction', async () => {
    txMocks.contratFindUnique.mockResolvedValue(contratValide());
    const appelCree = { id: 'appel-1', montant: 150000, statut: 'EN_ATTENTE' };
    txMocks.appelCreate.mockResolvedValue(appelCree);
    txMocks.contratUpdate.mockResolvedValue({});

    const res = await POST(requetePost(PAYLOAD_VALIDE));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('appel-1');

    // create appelé avec statut EN_ATTENTE
    expect(txMocks.appelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contratId: 'clx-contrat-1',
          montant: 150000,
          statut: 'EN_ATTENTE',
        }),
      })
    );
    // budgetUtilise incrémenté du montant, sur le même tx
    expect(txMocks.contratUpdate).toHaveBeenCalledWith({
      where: { id: 'clx-contrat-1' },
      data: { budgetUtilise: { increment: 150000 } },
    });
    // les deux écritures sont passées par la transaction
    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('BIZ-6 : verrouille la ligne du contrat (FOR UPDATE) AVANT la lecture du budget', async () => {
    txMocks.contratFindUnique.mockResolvedValue(contratValide());
    txMocks.appelCreate.mockResolvedValue({ id: 'appel-1' });
    txMocks.contratUpdate.mockResolvedValue({});

    await POST(requetePost(PAYLOAD_VALIDE));

    expect(txMocks.queryRaw).toHaveBeenCalled();
    expect(String(txMocks.queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    // le verrou précède la lecture du contrat
    expect(txMocks.contratFindUnique).toHaveBeenCalledAfter(txMocks.queryRaw);
  });

  it('BIZ-6 : contrat non ACTIF → 422, aucune écriture', async () => {
    txMocks.contratFindUnique.mockResolvedValue({ ...contratValide(), statut: 'RESILIE' });

    const res = await POST(requetePost(PAYLOAD_VALIDE));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('non actif');
    expect(body.erreur).toContain('RESILIE');
    expect(txMocks.appelCreate).not.toHaveBeenCalled();
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
  });

  it('BIZ-6 : date d’appel hors période contractuelle → 422, aucune écriture', async () => {
    txMocks.contratFindUnique.mockResolvedValue(contratValide());

    const res = await POST(requetePost({ ...PAYLOAD_VALIDE, dateAppel: '2027-03-15' }));

    expect(res.status).toBe(422);
    expect((await res.json()).erreur).toContain('période contractuelle');
    expect(txMocks.appelCreate).not.toHaveBeenCalled();
  });

  it('BIZ-6 : dépassement du budget annuel → 422 détaillé, aucune écriture', async () => {
    txMocks.contratFindUnique.mockResolvedValue({ ...contratValide(), budgetUtilise: 900000 });

    const res = await POST(requetePost(PAYLOAD_VALIDE)); // 900 000 + 150 000 > 1 000 000

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('Budget annuel insuffisant');
    expect(body.soldeDisponible).toBeDefined();
    expect(body.montantDemande).toBeDefined();
    expect(txMocks.appelCreate).not.toHaveBeenCalled();
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
  });

  it('BIZ-6 : montant exactement égal au solde disponible → accepté (borne incluse)', async () => {
    txMocks.contratFindUnique.mockResolvedValue({ ...contratValide(), budgetUtilise: 850000 });
    txMocks.appelCreate.mockResolvedValue({ id: 'appel-2' });
    txMocks.contratUpdate.mockResolvedValue({});

    const res = await POST(requetePost(PAYLOAD_VALIDE)); // 850 000 + 150 000 = 1 000 000

    expect(res.status).toBe(201);
    expect(txMocks.contratUpdate).toHaveBeenCalledTimes(1);
  });

  it('renvoie 404 si le contrat est introuvable (et ne crée rien)', async () => {
    txMocks.contratFindUnique.mockResolvedValue(null);

    const res = await POST(requetePost(PAYLOAD_VALIDE));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.erreur).toBe('Contrat introuvable');
    expect(txMocks.appelCreate).not.toHaveBeenCalled();
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
  });

  it('refuse un montant négatif ou nul (validation Zod, aucune écriture)', async () => {
    const res = await POST(requetePost({ ...PAYLOAD_VALIDE, montant: -500 }));

    expect([400, 422]).toContain(res.status);
    expect(dbMocks.transaction).not.toHaveBeenCalled();
    expect(txMocks.appelCreate).not.toHaveBeenCalled();
  });

  it('renvoie 500 si l’incrément budget échoue (la transaction avorte la création)', async () => {
    txMocks.contratFindUnique.mockResolvedValue(contratValide());
    txMocks.appelCreate.mockResolvedValue({ id: 'appel-1' });
    txMocks.contratUpdate.mockRejectedValue(new Error('write conflict'));

    const res = await POST(requetePost(PAYLOAD_VALIDE));

    expect(res.status).toBe(500);
    // les deux opérations ont bien été tentées DANS la même transaction :
    // en base réelle, l'échec du update annulerait le create (rollback).
    expect(txMocks.appelCreate).toHaveBeenCalledTimes(1);
    expect(txMocks.contratUpdate).toHaveBeenCalledTimes(1);
  });
});
