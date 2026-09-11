/**
 * Tests de la numérotation serveur des dossiers (src/lib/numero-dossier.ts).
 * Correctif audit P2 : le numéro était composé côté client (total+1) →
 * doublons dès deux créations simultanées. Désormais : généré dans la
 * transaction, la contrainte UNIQUE arbitre, retry en cas de collision.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  prefixeNumeroDossier,
  formaterNumeroDossier,
  genererNumeroDossier,
  estConflitNumeroDossier,
  avecRetryNumeroDossier,
} from '@/lib/numero-dossier';

describe('formaterNumeroDossier', () => {
  it('produit le format DOS-<année>-<6 chiffres>', () => {
    expect(formaterNumeroDossier(2026, 42)).toBe('DOS-2026-000042');
  });

  it('complète à 6 chiffres même pour les grandes séquences', () => {
    expect(formaterNumeroDossier(2026, 123456)).toBe('DOS-2026-123456');
    expect(formaterNumeroDossier(2026, 1234567)).toBe('DOS-2026-1234567');
  });

  it('refuse une séquence < 1', () => {
    expect(formaterNumeroDossier(2026, 0)).toBe('DOS-2026-000001');
  });
});

describe('prefixeNumeroDossier', () => {
  it('délimite la séquence par année', () => {
    expect(prefixeNumeroDossier(2026)).toBe('DOS-2026-');
    expect(prefixeNumeroDossier(2025)).toBe('DOS-2025-');
  });
});

describe('genererNumeroDossier', () => {
  type TxArg = Parameters<typeof genererNumeroDossier>[0];

  function fakeTx(total: number): TxArg {
    return {
      dossier: { count: vi.fn().mockResolvedValue(total) },
    } as unknown as TxArg;
  }

  it('retourne total + 1 formaté pour l’année donnée', async () => {
    const tx = fakeTx(41);
    await expect(genererNumeroDossier(tx, 2026)).resolves.toBe('DOS-2026-000042');
    expect(tx.dossier.count).toHaveBeenCalledWith({
      where: { numeroDossier: { startsWith: 'DOS-2026-' } },
    });
  });

  it('compte uniquement les dossiers du même préfixe annuel', async () => {
    const tx = fakeTx(7);
    await expect(genererNumeroDossier(tx, 2025)).resolves.toBe('DOS-2025-000008');
  });

  it('ajoute le décalage de retry', async () => {
    const tx = fakeTx(0);
    await expect(genererNumeroDossier(tx, 2026, 3)).resolves.toBe('DOS-2026-000004');
  });
});

describe('estConflitNumeroDossier', () => {
  it('reconnaît une P2002 portant sur numeroDossier (target tableau)', () => {
    const err = { code: 'P2002', meta: { target: ['numeroDossier'] } };
    expect(estConflitNumeroDossier(err)).toBe(true);
  });

  it('reconnaît une P2002 portant sur numeroDossier (target chaîne)', () => {
    const err = { code: 'P2002', meta: { target: 'Dossier_numeroDossier_key' } };
    expect(estConflitNumeroDossier(err)).toBe(true);
  });

  it('rejette une P2002 sur une autre colonne', () => {
    const err = { code: 'P2002', meta: { target: ['email'] } };
    expect(estConflitNumeroDossier(err)).toBe(false);
  });

  it('rejette les autres erreurs et les non-objets', () => {
    expect(estConflitNumeroDossier(new Error('boom'))).toBe(false);
    expect(estConflitNumeroDossier({ code: 'P2025' })).toBe(false);
    expect(estConflitNumeroDossier('P2002')).toBe(false);
    expect(estConflitNumeroDossier(null)).toBe(false);
  });
});

describe('avecRetryNumeroDossier', () => {
  it('retourne le résultat au premier essai sans collision', async () => {
    const tentative = vi.fn().mockResolvedValue('OK');
    await expect(avecRetryNumeroDossier(tentative)).resolves.toBe('OK');
    expect(tentative).toHaveBeenCalledTimes(1);
    expect(tentative).toHaveBeenCalledWith(0);
  });

  it('rejoue avec un décalage croissant en cas de collision P2002', async () => {
    const conflit = () => {
      const e = new Error('Unique constraint failed');
      Object.assign(e, { code: 'P2002', meta: { target: ['numeroDossier'] } });
      return e;
    };
    const tentative = vi
      .fn()
      .mockRejectedValueOnce(conflit())
      .mockRejectedValueOnce(conflit())
      .mockResolvedValue('CRÉÉ');

    await expect(avecRetryNumeroDossier(tentative)).resolves.toBe('CRÉÉ');
    expect(tentative).toHaveBeenCalledTimes(3);
    expect(tentative).toHaveBeenNthCalledWith(1, 0);
    expect(tentative).toHaveBeenNthCalledWith(2, 1);
    expect(tentative).toHaveBeenNthCalledWith(3, 2);
  });

  it('échoue après maxEssais collisions consécutives', async () => {
    const conflit = () => {
      const e = new Error('Unique constraint failed');
      Object.assign(e, { code: 'P2002', meta: { target: ['numeroDossier'] } });
      return e;
    };
    const tentative = vi.fn().mockRejectedValue(conflit());
    await expect(avecRetryNumeroDossier(tentative, 3)).rejects.toThrow('Unique constraint failed');
    expect(tentative).toHaveBeenCalledTimes(3);
  });

  it('propage immédiatement une erreur qui n’est pas une collision', async () => {
    const tentative = vi.fn().mockRejectedValue(new Error('DB down'));
    await expect(avecRetryNumeroDossier(tentative)).rejects.toThrow('DB down');
    expect(tentative).toHaveBeenCalledTimes(1);
  });
});
