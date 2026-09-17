/**
 * Tests de la route /api/prestataires (POST / PUT / DELETE) — module
 * GESTION → PRESTATAIRES :
 *   - validations Zod (formats e-mail, NIF, Num STAT, RIB) ;
 *   - absence de doublons (nom normalisé, e-mail, NIF, Num STAT) → 409 ;
 *   - traçabilité : toute opération est enregistrée dans le Journal d'Audit
 *     des Paramétrages via logParametreChange (création, modification par
 *     champ avec ancienne/nouvelle valeur, suppression) ;
 *   - le rôle de l'utilisateur est passé au journal (figé au moment de l'opération).
 *
 * Le gate checkAuth est simulé (règle d'autorisation vérifiée séparément
 * dans permissions.test.ts) ; la base est mockée.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
  getUserInfoFromRequest: vi
    .fn()
    .mockResolvedValue({ nom: 'Jean Dupont', id: 'u-admin', role: 'ADMINISTRATEUR' }),
}));

const dbMocks = vi.hoisted(() => ({
  prestataireFindMany: vi.fn().mockResolvedValue([]),
  prestataireFindUnique: vi.fn(),
  prestataireCreate: vi.fn(),
  prestataireUpdate: vi.fn(),
  prestataireDelete: vi.fn(),
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
    prestataire: {
      findMany: dbMocks.prestataireFindMany,
      findUnique: dbMocks.prestataireFindUnique,
      create: dbMocks.prestataireCreate,
      update: dbMocks.prestataireUpdate,
      delete: dbMocks.prestataireDelete,
    },
  },
}));

import { POST, PUT, DELETE } from './route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requeteJson(method: string, body: unknown): NextRequest {
  return new Request('http://localhost/api/prestataires', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requeteDelete(query: string): NextRequest {
  return new Request(`http://localhost/api/prestataires${query}`, {
    method: 'DELETE',
  }) as unknown as NextRequest;
}

const FICHE_COMPLETE = {
  nom: 'Clinique Test',
  type: 'CLINIQUE',
  telephone: '034 11 111 11',
  email: 'contact@cliniquetest.mg',
  adresse: 'Anosy, Antananarivo',
  nif: '4001234567',
  stat: '6512 311 2002 02345',
  statutJuridique: 'SARL',
  statut: 'CONVENTIONNE',
  rib: '000 12345 67890 12 3',
};

const PRESTATAIRE_EXISTANT = {
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
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
  auditMocks.getUserInfoFromRequest.mockResolvedValue({
    nom: 'Jean Dupont', id: 'u-admin', role: 'ADMINISTRATEUR',
  });
  dbMocks.prestataireFindMany.mockResolvedValue([]);
  dbMocks.prestataireFindUnique.mockResolvedValue(PRESTATAIRE_EXISTANT);
  dbMocks.prestataireCreate.mockResolvedValue({ id: 'p-new', ...FICHE_COMPLETE, actif: true });
  dbMocks.prestataireUpdate.mockResolvedValue({ ...PRESTATAIRE_EXISTANT });
  dbMocks.prestataireDelete.mockResolvedValue(PRESTATAIRE_EXISTANT);
});

// ─── POST : création ─────────────────────────────────────────────────────────

describe('POST /api/prestataires — création avec traçabilité', () => {
  it('crée le prestataire et journalise une trace CREATION avec le rôle', async () => {
    const res = await POST(requeteJson('POST', FICHE_COMPLETE));

    expect(res.status).toBe(201);
    expect(dbMocks.prestataireCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nom: 'Clinique Test',
          stat: '6512 311 2002 02345',
          statutJuridique: 'SARL',
          email: 'contact@cliniquetest.mg',
        }),
      })
    );
    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Prestataire',
        entiteId: 'p-new',
        champ: 'CREATION',
        nouvelleValeur: 'Clinique Test',
        modifiePar: 'Jean Dupont',
        modifieParId: 'u-admin',
        roleUtilisateur: 'ADMINISTRATEUR',
      })
    );
  });

  it('refuse un e-mail mal formé (400) et ne crée rien', async () => {
    const res = await POST(requeteJson('POST', { ...FICHE_COMPLETE, email: 'pas-un-email' }));

    expect(res.status).toBe(400);
    expect(dbMocks.prestataireCreate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('refuse un Num STAT mal formé (400)', async () => {
    const res = await POST(requeteJson('POST', { ...FICHE_COMPLETE, stat: 'ABC' }));
    expect(res.status).toBe(400);
    expect(dbMocks.prestataireCreate).not.toHaveBeenCalled();
  });

  it('refuse un nom en doublon (409) même avec casse/accents différents', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p-autre', nom: 'CLINIQUE TEST', email: null, nif: null, stat: null, actif: true },
    ]);

    const res = await POST(requeteJson('POST', FICHE_COMPLETE));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.erreur).toContain('existe déjà');
    expect(dbMocks.prestataireCreate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('refuse un NIF déjà attribué même avec séparateurs différents (409)', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p-autre', nom: 'Autre Cabinet', email: null, nif: '4001-234-567', stat: null, actif: true },
    ]);

    const res = await POST(requeteJson('POST', FICHE_COMPLETE));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.erreur).toContain('NIF');
  });

  it('refuse un Num STAT déjà attribué (409)', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p-autre', nom: 'Autre Cabinet', email: null, nif: null, stat: '6512311200202345', actif: true },
    ]);

    const res = await POST(requeteJson('POST', FICHE_COMPLETE));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.erreur).toContain('STAT');
  });
});

// ─── PUT : modification avec diff par champ ──────────────────────────────────

describe('PUT /api/prestataires — modification tracée par champ', () => {
  it('journalise UNE trace par champ modifié avec ancienne/nouvelle valeur', async () => {
    const res = await PUT(requeteJson('PUT', {
      id: 'p1',
      nom: 'Clinique A',
      type: 'CLINIQUE',
      telephone: '032 22 222 22', // modifié
      email: 'a@clinique.mg',
      adresse: 'Anosy',
      nif: '4001111111',
      stat: '6512 311 2001 01234',
      statutJuridique: 'SARL',
      statut: 'CONVENTIONNE',
      rib: '000 12345 67890 12 3',
    }));

    expect(res.status).toBe(200);
    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Prestataire',
        entiteId: 'p1',
        champ: 'Téléphone',
        ancienneValeur: '034 11 111 11',
        nouvelleValeur: '032 22 222 22',
        modifiePar: 'Jean Dupont',
        roleUtilisateur: 'ADMINISTRATEUR',
        request: expect.anything(),
      })
    );
  });

  it('journalise plusieurs champs en une seule requête (téléphone + statut juridique)', async () => {
    await PUT(requeteJson('PUT', {
      id: 'p1',
      nom: 'Clinique A',
      type: 'CLINIQUE',
      telephone: '032 22 222 22',
      email: 'a@clinique.mg',
      adresse: 'Anosy',
      nif: '4001111111',
      stat: '6512 311 2001 01234',
      statutJuridique: 'SUARL', // modifié
      statut: 'CONVENTIONNE',
      rib: '000 12345 67890 12 3',
    }));

    const champs = auditMocks.logParametreChange.mock.calls.map(c => c[0].champ);
    expect(champs).toEqual(expect.arrayContaining(['Téléphone', 'Statut juridique']));
    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(2);
  });

  it('ne journalise RIEN si aucune valeur ne change', async () => {
    const res = await PUT(requeteJson('PUT', {
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
    }));

    expect(res.status).toBe(200);
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('journalise la désactivation avec des valeurs lisibles (Actif → Inactif)', async () => {
    await PUT(requeteJson('PUT', { id: 'p1', actif: false }));

    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        champ: 'Compte actif',
        ancienneValeur: 'Actif',
        nouvelleValeur: 'Inactif',
      })
    );
  });

  it('refuse un prestataire inconnu (404), aucune trace', async () => {
    dbMocks.prestataireFindUnique.mockResolvedValue(null);

    const res = await PUT(requeteJson('PUT', { id: 'inconnu', nom: 'X' }));

    expect(res.status).toBe(404);
    expect(dbMocks.prestataireUpdate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('refuse un e-mail déjà utilisé par un AUTRE prestataire (409)', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p-autre', nom: 'Autre Cabinet', email: 'pris@clinique.mg', nif: null, stat: null, actif: true },
    ]);

    const res = await PUT(requeteJson('PUT', { id: 'p1', email: 'pris@clinique.mg' }));

    expect(res.status).toBe(409);
    expect(dbMocks.prestataireUpdate).not.toHaveBeenCalled();
  });

  it('n\'est PAS son propre doublon (mise à jour sans changement d\'identité OK)', async () => {
    dbMocks.prestataireFindMany.mockImplementation(({ where }) => {
      // Simule Prisma : id: { not: 'p1' } exclut le prestataire modifié
      const exclureId = where?.id?.not;
      return Promise.resolve(exclureId ? [] : [PRESTATAIRE_EXISTANT]);
    });

    const res = await PUT(requeteJson('PUT', { id: 'p1', nom: 'Clinique A Renommée' }));

    expect(res.status).toBe(200);
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        champ: 'Nom / Raison sociale',
        ancienneValeur: 'Clinique A',
        nouvelleValeur: 'Clinique A Renommée',
      })
    );
  });

  it('refuse des données invalides (400) sans écriture', async () => {
    const res = await PUT(requeteJson('PUT', { id: 'p1', nif: '12' }));

    expect(res.status).toBe(400);
    expect(dbMocks.prestataireUpdate).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });
});

// ─── DELETE : suppression tracée ──────────────────────────────────────────────

describe('DELETE /api/prestataires — suppression avec traçabilité', () => {
  it('supprime et journalise une trace SUPPRESSION', async () => {
    dbMocks.prestataireFindUnique.mockResolvedValue({
      ...PRESTATAIRE_EXISTANT,
      _count: { dossiers: 0 },
    });

    const res = await DELETE(requeteDelete('?id=p1'));

    expect(res.status).toBe(200);
    expect(dbMocks.prestataireDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Prestataire',
        entiteId: 'p1',
        champ: 'SUPPRESSION',
        ancienneValeur: 'Clinique A',
        roleUtilisateur: 'ADMINISTRATEUR',
      })
    );
  });

  it('refuse la suppression si des dossiers y sont rattachés (409)', async () => {
    dbMocks.prestataireFindUnique.mockResolvedValue({
      ...PRESTATAIRE_EXISTANT,
      _count: { dossiers: 7 },
    });

    const res = await DELETE(requeteDelete('?id=p1'));

    expect(res.status).toBe(409);
    expect(dbMocks.prestataireDelete).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('refuse un prestataire inconnu (404)', async () => {
    dbMocks.prestataireFindUnique.mockResolvedValue(null);

    const res = await DELETE(requeteDelete('?id=inconnu'));

    expect(res.status).toBe(404);
    expect(dbMocks.prestataireDelete).not.toHaveBeenCalled();
  });
});
