/**
 * Tests de la route PATCH /api/appels-fonds/[id] — verrou de ligne + budget.
 * Correctif audit P2 : le montant était lu hors transaction → deux PATCH
 * simultanés appliquaient deux fois le même diff (double incrément du
 * budgetUtilise). Désormais : SELECT … FOR UPDATE puis re-lecture et
 * écritures dans la même transaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  appelFindUnique: vi.fn(),
  appelUpdate: vi.fn(),
  contratUpdate: vi.fn(),
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

import { PATCH } from './route';

function requetePatch(body: unknown): NextRequest {
  return new Request('http://localhost/api/appels-fonds/appel-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const CONTEXTE = { params: Promise.resolve({ id: 'appel-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txMocks.queryRaw,
      contrat: { update: txMocks.contratUpdate },
      appelDeFonds: {
        findUnique: txMocks.appelFindUnique,
        update: txMocks.appelUpdate,
      },
    })
  );
  // SELECT … FOR UPDATE : retourne la ligne verrouillée
  txMocks.queryRaw.mockResolvedValue([{ id: 'appel-1' }]);
});

describe('PATCH /api/appels-fonds/[id]', () => {
  it('verrouille la ligne (FOR UPDATE) AVANT de lire l’appel', async () => {
    txMocks.appelFindUnique.mockResolvedValue({
      id: 'appel-1',
      montant: 100000,
      contratId: 'clx-contrat-1',
      contrat: { id: 'clx-contrat-1' },
    });
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', statut: 'REGLE' });

    const res = await PATCH(requetePatch({ statut: 'REGLE' }), CONTEXTE);

    expect(res.status).toBe(200);
    // le verrou a été pris avant la lecture de l'appel (ordre d'invocation)
    expect(txMocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(txMocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      txMocks.appelFindUnique.mock.invocationCallOrder[0]
    );
  });

  it('ajuste budgetUtilise du diff ancien → nouveau dans la même transaction', async () => {
    txMocks.appelFindUnique.mockResolvedValue({
      id: 'appel-1',
      montant: 100000,
      contratId: 'clx-contrat-1',
      contrat: { id: 'clx-contrat-1' },
    });
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', montant: 120000 });

    const res = await PATCH(requetePatch({ montant: 120000 }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.contratUpdate).toHaveBeenCalledWith({
      where: { id: 'clx-contrat-1' },
      data: { budgetUtilise: { increment: 20000 } },
    });
    expect(txMocks.appelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appel-1' },
        data: expect.objectContaining({ montant: 120000 }),
      })
    );
  });

  it('ne touche pas au budget si le montant est inchangé', async () => {
    txMocks.appelFindUnique.mockResolvedValue({
      id: 'appel-1',
      montant: 100000,
      contratId: 'clx-contrat-1',
      contrat: { id: 'clx-contrat-1' },
    });
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', statut: 'REGLE' });

    const res = await PATCH(requetePatch({ statut: 'REGLE' }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
  });

  it('renvoie 404 si l’appel est introuvable (après verrou)', async () => {
    txMocks.appelFindUnique.mockResolvedValue(null);

    const res = await PATCH(requetePatch({ statut: 'REGLE' }), CONTEXTE);

    expect(res.status).toBe(404);
    expect(txMocks.appelUpdate).not.toHaveBeenCalled();
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
  });

  it('refuse un montant négatif (validation Zod, aucune écriture)', async () => {
    const res = await PATCH(requetePatch({ montant: -1000 }), CONTEXTE);

    expect([400, 422]).toContain(res.status);
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });
});
