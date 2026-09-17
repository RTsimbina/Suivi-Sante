/**
 * Tests de la fiche détaillée : GET /api/prestataires/[id].
 *
 * Vérifie notamment la protection contre la manipulation d'identifiant dans
 * l'URL : un identifiant inconnu renvoie 404 (sans révéler d'information) et
 * un identifiant invalide renvoie 400. L'autorisation (rôles internes
 * uniquement) est déléguée au système central (checkAuth / API_PERMISSIONS).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const dbMocks = vi.hoisted(() => ({
  prestataireFindUnique: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    prestataire: {
      findUnique: dbMocks.prestataireFindUnique,
    },
  },
}));

import { GET } from './route';

function requeteGet(id: string): NextRequest {
  return new Request(`http://localhost/api/prestataires/${id}`) as unknown as NextRequest;
}

const FICHE = {
  id: 'p1',
  nom: 'Clinique A',
  type: 'CLINIQUE',
  telephone: '034 11 111 11',
  email: 'a@clinique.mg',
  adresse: 'Anosy',
  nif: '4001111111',
  stat: '6512 311 2001 01234',
  statutJuridique: 'SARL',
  statut: 'CONVENTIONNE',
  rib: '000 12345 67890 12 3',
  actif: true,
  societes: [
    { id: 'l1', prestataireId: 'p1', societeId: 's1', actif: true, societe: { id: 's1', nom: 'SANLAM' } },
  ],
  _count: { dossiers: 12 },
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  dbMocks.prestataireFindUnique.mockResolvedValue(FICHE);
});

describe('GET /api/prestataires/[id] — fiche détaillée', () => {
  it('renvoie la fiche complète avec les rattachements sociétés', async () => {
    const res = await GET(requeteGet('p1'), { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prestataire.nom).toBe('Clinique A');
    expect(data.prestataire.statutJuridique).toBe('SARL');
    expect(data.prestataire.stat).toBe('6512 311 2001 01234');
    expect(data.prestataire.societes).toHaveLength(1);
    expect(data.prestataire.societes[0].societe.nom).toBe('SANLAM');
    expect(data.prestataire._count.dossiers).toBe(12);
    expect(dbMocks.prestataireFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } })
    );
  });

  it('renvoie 404 pour un identifiant inconnu (URL manipulée)', async () => {
    dbMocks.prestataireFindUnique.mockResolvedValue(null);

    const res = await GET(requeteGet('inconnu'), { params: Promise.resolve({ id: 'inconnu' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.erreur).toContain('introuvable');
  });

  it('renvoie 400 pour un identifiant invalide', async () => {
    const idTropLong = 'a'.repeat(100);
    const res = await GET(requeteGet(idTropLong), { params: Promise.resolve({ id: idTropLong }) });

    expect(res.status).toBe(400);
    expect(dbMocks.prestataireFindUnique).not.toHaveBeenCalled();
  });

  it('propage le refus du système central (403) sans consulter la base', async () => {
    authMocks.checkAuth.mockResolvedValue(
      Response.json({ erreur: "Accès refusé. Le rôle 'PORTAIL_CLIENT' n'est pas autorisé à accéder à cette ressource." }, { status: 403 })
    );

    const res = await GET(requeteGet('p1'), { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(403);
    expect(dbMocks.prestataireFindUnique).not.toHaveBeenCalled();
  });
});
