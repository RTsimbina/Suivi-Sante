/**
 * Tests de la route PATCH /api/appels-fonds/[id] — verrou de ligne + budget.
 *
 * Correctifs :
 *   - audit P2 : le montant était lu hors transaction → deux PATCH
 *     simultanés appliquaient deux fois le même diff (double incrément du
 *     budgetUtilise). Désormais : SELECT … FOR UPDATE puis re-lecture et
 *     écritures dans la même transaction.
 *   - BIZ-6 : l'annulation (→ ANNULE) DÉCRÉMENTE budgetUtilise (avant :
 *     l'appel annulé continuait de consommer le budget), la réactivation
 *     (ANNULE → EN_ATTENTE) ré-incrémente, l'augmentation de montant est
 *     bornée par le budget disponible, et un appel annulé ne touche plus au
 *     budget quand on édite son montant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  appelFindUnique: vi.fn(),
  appelUpdate: vi.fn(),
  contratFindUnique: vi.fn(),
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

function appelValide() {
  return {
    id: 'appel-1',
    statut: 'EN_ATTENTE',
    montant: 100000,
    contratId: 'clx-contrat-1',
    contrat: { id: 'clx-contrat-1' },
  };
}

/** Contrat avec un budget large (1 000 000 Ar) pour les cas nominaux. */
function contratLarge() {
  return { id: 'clx-contrat-1', budgetAnnuel: 1000000, budgetUtilise: 100000 };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txMocks.queryRaw,
      contrat: {
        findUnique: txMocks.contratFindUnique,
        update: txMocks.contratUpdate,
      },
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
    txMocks.appelFindUnique.mockResolvedValue(appelValide());
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', statut: 'REGLE' });

    const res = await PATCH(requetePatch({ statut: 'REGLE' }), CONTEXTE);

    expect(res.status).toBe(200);
    // le verrou a été pris avant la lecture de l'appel (ordre d'invocation)
    expect(txMocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      txMocks.appelFindUnique.mock.invocationCallOrder[0]
    );
  });

  it('ajuste budgetUtilise du diff ancien → nouveau dans la même transaction', async () => {
    txMocks.appelFindUnique.mockResolvedValue(appelValide());
    txMocks.contratFindUnique.mockResolvedValue(contratLarge());
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', montant: 120000 });

    const res = await PATCH(requetePatch({ montant: 120000 }), CONTEXTE);

    expect(res.status).toBe(200);
    // Le diff est calculé en Decimal exact (plan P3) — Prisma accepte un
    // Decimal en increment. On compare numériquement (12.30 ≡ "12.3").
    expect(txMocks.contratUpdate).toHaveBeenCalledWith({
      where: { id: 'clx-contrat-1' },
      data: { budgetUtilise: { increment: expect.objectContaining({
        toString: expect.any(Function),
      }) } },
    });
    const incrementArg = txMocks.contratUpdate.mock.calls[0][0].data.budgetUtilise.increment;
    expect(new Prisma.Decimal(incrementArg).toNumber()).toBe(20000);
    expect(txMocks.appelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appel-1' },
        data: expect.objectContaining({ montant: 120000 }),
      })
    );
  });

  it('BIZ-6 : passage à ANNULE → DÉCRÉMENTE budgetUtilise du montant de l’appel', async () => {
    txMocks.appelFindUnique.mockResolvedValue(appelValide());
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', statut: 'ANNULE' });

    const res = await PATCH(requetePatch({ statut: 'ANNULE' }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.contratUpdate).toHaveBeenCalledWith({
      where: { id: 'clx-contrat-1' },
      data: { budgetUtilise: { decrement: 100000 } },
    });
  });

  it('BIZ-6 : réactivation ANNULE → EN_ATTENTE → ré-incrémente le budget', async () => {
    txMocks.appelFindUnique.mockResolvedValue({ ...appelValide(), statut: 'ANNULE' });
    txMocks.contratFindUnique.mockResolvedValue(contratLarge());
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', statut: 'EN_ATTENTE' });

    const res = await PATCH(requetePatch({ statut: 'EN_ATTENTE' }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.contratUpdate).toHaveBeenCalledWith({
      where: { id: 'clx-contrat-1' },
      data: { budgetUtilise: { increment: 100000 } },
    });
  });

  it('BIZ-6 : réactivation au-delà du budget disponible → 422, aucune écriture budget', async () => {
    txMocks.appelFindUnique.mockResolvedValue({ ...appelValide(), statut: 'ANNULE' });
    txMocks.contratFindUnique.mockResolvedValue({
      id: 'clx-contrat-1', budgetAnnuel: 150000, budgetUtilise: 100000,
    });

    const res = await PATCH(requetePatch({ statut: 'EN_ATTENTE' }), CONTEXTE); // 100 000 + 100 000 > 150 000

    expect(res.status).toBe(422);
    expect((await res.json()).erreur).toContain('Budget annuel insuffisant');
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
    expect(txMocks.appelUpdate).not.toHaveBeenCalled();
  });

  it('BIZ-6 : augmentation de montant au-delà du budget → 422, aucune écriture budget', async () => {
    txMocks.appelFindUnique.mockResolvedValue(appelValide());
    txMocks.contratFindUnique.mockResolvedValue({
      id: 'clx-contrat-1', budgetAnnuel: 115000, budgetUtilise: 100000,
    });

    const res = await PATCH(requetePatch({ montant: 120000 }), CONTEXTE); // 100 000 + 20 000 > 115 000

    expect(res.status).toBe(422);
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
    expect(txMocks.appelUpdate).not.toHaveBeenCalled();
  });

  it('BIZ-6 : édition du montant d’un appel ANNULÉ → ne touche PAS au budget', async () => {
    txMocks.appelFindUnique.mockResolvedValue({ ...appelValide(), statut: 'ANNULE' });
    txMocks.appelUpdate.mockResolvedValue({ id: 'appel-1', montant: 120000 });

    const res = await PATCH(requetePatch({ montant: 120000 }), CONTEXTE);

    expect(res.status).toBe(200);
    expect(txMocks.contratUpdate).not.toHaveBeenCalled();
    // le champ montant est bien appliqué (traçabilité de l'appel)
    expect(txMocks.appelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ montant: 120000 }),
      })
    );
  });

  it('ne touche pas au budget si le montant est inchangé', async () => {
    txMocks.appelFindUnique.mockResolvedValue(appelValide());
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
