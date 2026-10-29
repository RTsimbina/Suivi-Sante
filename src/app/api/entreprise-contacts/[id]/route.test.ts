/**
 * Tests des routes PUT / DELETE /api/entreprise-contacts/[id] — socle Gestion,
 * pilier Audit : la fiche contact est la source 1 de la liaison externe
 * CONTACT_ENTREPRISE (liaison-externe.ts) — chaque modification (dont l'e-mail
 * qui ouvre/ferme l'accès au portail) et chaque suppression sont tracées avec
 * l'auteur réel.
 *
 * Le gate checkAuth est simulé ; la base est mockée.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
  getUserInfoFromRequest: vi
    .fn()
    .mockResolvedValue({ nom: 'Admin', id: 'u-admin', role: 'ADMINISTRATEUR' }),
}));

const dbMocks = vi.hoisted(() => ({
  contactFindUnique: vi.fn(),
  contactUpdate: vi.fn(),
  contactDelete: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
  getUserInfoFromRequest: auditMocks.getUserInfoFromRequest,
}));

vi.mock('@/lib/db', () => ({
  db: {
    entrepriseContact: {
      findUnique: dbMocks.contactFindUnique,
      update: dbMocks.contactUpdate,
      delete: dbMocks.contactDelete,
    },
  },
}));

import { PUT, DELETE } from './route';

const PARAMS = { params: Promise.resolve({ id: 'ct-1' }) };

function requetePut(body: unknown): NextRequest {
  return new Request('http://localhost/api/entreprise-contacts/ct-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requeteDelete(): NextRequest {
  return new Request('http://localhost/api/entreprise-contacts/ct-1', {
    method: 'DELETE',
  }) as unknown as NextRequest;
}

const CONTACT_EXISTANT = {
  id: 'ct-1',
  societeId: 'soc-1',
  nom: 'Rakoto',
  prenom: 'Hery',
  fonction: 'Responsable RH',
  telephone: '034 11 111 11',
  email: 'hery@sanlam.mg',
  actif: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.contactFindUnique.mockResolvedValue(CONTACT_EXISTANT);
  dbMocks.contactUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...CONTACT_EXISTANT,
    ...data,
  }));
});

describe('PUT /api/entreprise-contacts/[id] — pilier Audit', () => {
  it('changement d\'e-mail de liaison audité avec ancienne / nouvelle valeur', async () => {
    const res = await PUT(requetePut({ nom: 'Rakoto', prenom: 'Hery', email: 'nouveau@sanlam.mg' }), PARAMS);
    expect(res.status).toBe(200);

    const appels = auditMocks.logParametreChange.mock.calls.map((c) => c[0]);
    const email = appels.find((a: { champ: string }) => a.champ === 'email');
    expect(email).toMatchObject({
      entite: 'EntrepriseContact',
      entiteId: 'ct-1',
      ancienneValeur: 'hery@sanlam.mg',
      nouvelleValeur: 'nouveau@sanlam.mg',
      modifiePar: 'Admin',
      modifieParId: 'u-admin',
      societeId: 'soc-1',
    });
    // nom/prenom inchangés → non audités
    expect(appels.filter((a: { champ: string }) => a.champ === 'nom')).toHaveLength(0);
    expect(appels.filter((a: { champ: string }) => a.champ === 'prenom')).toHaveLength(0);
  });

  it('bascule actif audité ; contact introuvable → 404 sans audit', async () => {
    await PUT(requetePut({ nom: 'Rakoto', prenom: 'Hery', actif: false }), PARAMS);
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({ champ: 'actif', ancienneValeur: true, nouvelleValeur: false })
    );

    auditMocks.logParametreChange.mockClear();
    dbMocks.contactFindUnique.mockResolvedValue(null);
    const res = await PUT(requetePut({ nom: 'X' }), PARAMS);
    expect(res.status).toBe(404);
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/entreprise-contacts/[id] — pilier Audit', () => {
  it('suppression auditées avec nom + e-mail du contact et société', async () => {
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(200);

    expect(dbMocks.contactDelete).toHaveBeenCalledWith({ where: { id: 'ct-1' } });
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'EntrepriseContact',
        entiteId: 'ct-1',
        champ: 'SUPPRESSION',
        ancienneValeur: expect.stringContaining('Rakoto'),
        modifiePar: 'Admin',
        societeId: 'soc-1',
      })
    );
  });

  it('contact introuvable → 404', async () => {
    dbMocks.contactFindUnique.mockResolvedValue(null);
    const res = await DELETE(requeteDelete(), PARAMS);
    expect(res.status).toBe(404);
    expect(dbMocks.contactDelete).not.toHaveBeenCalled();
  });
});
