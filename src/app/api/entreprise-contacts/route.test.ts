/**
 * Tests de la route /api/entreprise-contacts — création d'un contact
 * entreprise et association à SA société (validation societeId).
 *
 * Couvre le jeu de données de production (scripts/reset_seed.mjs) : chaque
 * société cliente (SANLAM, TELMA, JIRAMA, AIRTEL, BNI) a son contact déclaré,
 * rattaché par societeId — la fiche contact sert de source n°1 de liaison au
 * compte CONTACT_ENTREPRISE (cf. src/lib/liaison-externe.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const dbMocks = vi.hoisted(() => ({
  entrepriseContactFindMany: vi.fn().mockResolvedValue([]),
  entrepriseContactCreate: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    entrepriseContact: {
      findMany: dbMocks.entrepriseContactFindMany,
      create: dbMocks.entrepriseContactCreate,
    },
  },
}));

import { GET, POST } from './route';

function requete(path: string, body?: unknown): NextRequest {
  const init: RequestInit = body !== undefined
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const r = new Request(`http://localhost${path}`, init);
  Object.defineProperty(r, 'nextUrl', { value: new URL(`http://localhost${path}`) });
  return r as unknown as NextRequest;
}

const SOC_SANLAM = 'soc-sanlam-id';

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.entrepriseContactFindMany.mockResolvedValue([]);
  dbMocks.entrepriseContactCreate.mockReset();
});

// ─── POST — Création d'un contact entreprise ─────────────────────────────────

describe('POST /api/entreprise-contacts — création + validation societeId', () => {
  it('crée le contact rattaché à SA société (association contact ↔ société)', async () => {
    dbMocks.entrepriseContactCreate.mockResolvedValueOnce({
      id: 'ct-1', societeId: SOC_SANLAM, nom: 'Rakotomalala', prenom: 'Hery',
      email: 'contact.sanlam@sanlam.mg',
      societe: { id: SOC_SANLAM, nom: 'SANLAM MADAGASCAR ASSURANCE' },
    });

    const res = await POST(requete('/api/entreprise-contacts', {
      societeId: SOC_SANLAM,
      nom: 'Rakotomalala',
      prenom: 'Hery',
      fonction: 'Responsable RH',
      email: 'contact.sanlam@sanlam.mg',
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.societeId).toBe(SOC_SANLAM);
    expect(body.societe.nom).toBe('SANLAM MADAGASCAR ASSURANCE');
    // le societeId transmis est bien celui utilisé à la création
    expect(dbMocks.entrepriseContactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ societeId: SOC_SANLAM, nom: 'Rakotomalala' }),
      })
    );
  });

  it('societeId manquant → 400 (Zod), aucune création', async () => {
    const res = await POST(requete('/api/entreprise-contacts', { nom: 'Sans Société' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Données invalides');
    expect(JSON.stringify(body.details)).toContain('societeId');
    expect(dbMocks.entrepriseContactCreate).not.toHaveBeenCalled();
  });

  it('societeId vide → 400, aucune création', async () => {
    const res = await POST(requete('/api/entreprise-contacts', { societeId: '  ', nom: 'X' }));
    expect(res.status).toBe(400);
    expect(dbMocks.entrepriseContactCreate).not.toHaveBeenCalled();
  });

  it('nom manquant → 400, aucune création (le nom est requis)', async () => {
    const res = await POST(requete('/api/entreprise-contacts', { societeId: SOC_SANLAM }));
    expect(res.status).toBe(400);
    expect(dbMocks.entrepriseContactCreate).not.toHaveBeenCalled();
  });

  it('e-mail invalide → 400, aucune création', async () => {
    const res = await POST(requete('/api/entreprise-contacts', {
      societeId: SOC_SANLAM, nom: 'Rakotomalala', email: 'pas-un-email',
    }));
    expect(res.status).toBe(400);
    expect(dbMocks.entrepriseContactCreate).not.toHaveBeenCalled();
  });
});

// ─── GET — Liste filtrée par société ─────────────────────────────────────────

describe('GET /api/entreprise-contacts — association contact ↔ société', () => {
  it('transmet le filtre societeId au where Prisma', async () => {
    dbMocks.entrepriseContactFindMany.mockResolvedValueOnce([
      { id: 'ct-1', societeId: SOC_SANLAM, societe: { id: SOC_SANLAM, nom: 'SANLAM' } },
    ]);

    const res = await GET(requete(`/api/entreprise-contacts?societeId=${SOC_SANLAM}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0].societeId).toBe(SOC_SANLAM);
    expect(dbMocks.entrepriseContactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { societeId: SOC_SANLAM },
        include: { societe: { select: { id: true, nom: true } } },
      })
    );
  });

  it('sans filtre → where vide (toutes les sociétés, rôles internes)', async () => {
    const res = await GET(requete('/api/entreprise-contacts'));
    expect(res.status).toBe(200);
    expect(dbMocks.entrepriseContactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});
