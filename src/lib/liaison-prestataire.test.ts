/**
 * Tests de la liaison e-mail → fiche Prestataire (résolution contrôlée).
 *
 * La résolution déterministe (fiche la plus ancienne) est le comportement
 * historique — elle est PRÉSERVÉE. La consolidation ajoute la détection
 * d'ambiguïté (miroir SPEC-6 des sociétés) : un e-mail partagé par plusieurs
 * fiches (exception de doublon validée par un admin, ex. groupe
 * d'établissements) est désormais TRACÉ côté serveur et EXPOSÉ aux appelants
 * critiques — le portail refuse (403) et la création de compte refuse (409)
 * tant que l'ambiguïté n'est pas corrigée.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({ prestataireFindMany: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    prestataire: { findMany: dbMocks.prestataireFindMany },
  },
}));

import {
  resoudreLiaisonPrestataire,
  resoudreLiaisonPrestataireAvecControle,
  liaisonPrestataireExiste,
} from './liaison-prestataire';

const EMAIL = 'facturation@groupe.mg';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resoudreLiaisonPrestataireAvecControle', () => {
  it('e-mail vide → AUCUNE, aucune requête base', async () => {
    const resultat = await resoudreLiaisonPrestataireAvecControle('   ');
    expect(resultat).toEqual({ statut: 'AUCUNE' });
    expect(dbMocks.prestataireFindMany).not.toHaveBeenCalled();
  });

  it('aucune fiche → AUCUNE', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([]);
    expect(await resoudreLiaisonPrestataireAvecControle(EMAIL)).toEqual({ statut: 'AUCUNE' });
  });

  it('une seule fiche → OK avec son identifiant (résolution déterministe)', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: 'p1', createdAt: new Date('2020-01-01') }]);
    const resultat = await resoudreLiaisonPrestataireAvecControle(EMAIL);
    expect(resultat).toEqual({ statut: 'OK', prestataireId: 'p1' });
    // La correspondance est insensible à la casse (e-mail trimé transmis)
    expect(dbMocks.prestataireFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: EMAIL, mode: 'insensitive' } },
      })
    );
  });

  it('deux fiches → AMBIGU avec le nombre de fiches + trace serveur actionnable', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p-ancien', createdAt: new Date('2020-01-01') },
      { id: 'p-recent', createdAt: new Date('2021-01-01') },
    ]);
    const resultat = await resoudreLiaisonPrestataireAvecControle(EMAIL);
    expect(resultat).toEqual({ statut: 'AMBIGU', nbFiches: 2 });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('partagé par 2 fiches')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('REFUSÉE')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('GESTION → Prestataires')
    );
  });
});

describe('resoudreLiaisonPrestataire (délégation historique)', () => {
  it('OK → { prestataireId, source PRESTATAIRE_EMAIL }', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: 'p1', createdAt: new Date() }]);
    expect(await resoudreLiaisonPrestataire(EMAIL)).toEqual({
      prestataireId: 'p1',
      source: 'PRESTATAIRE_EMAIL',
    });
  });

  it('AUCUNE ou AMBIGU → null (comportement historique inchangé)', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([]);
    expect(await resoudreLiaisonPrestataire(EMAIL)).toBeNull();

    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p1', createdAt: new Date('2020-01-01') },
      { id: 'p2', createdAt: new Date('2021-01-01') },
    ]);
    expect(await resoudreLiaisonPrestataire(EMAIL)).toBeNull();
  });

  it('liaisonPrestataireExiste : true dès qu une fiche porte l e-mail', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([
      { id: 'p1', createdAt: new Date('2020-01-01') },
      { id: 'p2', createdAt: new Date('2021-01-01') },
    ]);
    expect(await liaisonPrestataireExiste(EMAIL)).toBe(true);
    expect(console.error).toHaveBeenCalled(); // l'ambiguïté est tracée
  });
});
