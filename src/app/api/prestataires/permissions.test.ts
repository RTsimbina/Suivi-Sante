/**
 * Tests du système central de permissions pour le module GESTION → PRESTATAIRES :
 *   1. PUT /api/prestataires (modification de la fiche) est réservé à
 *      ADMINISTRATEUR et TECHNIQUE — ACCUEIL / COMPTABILITE / SANTE et les
 *      rôles externes sont refusés ;
 *   2. le Journal d'Audit des Paramétrages (/api/historique-parametres) est
 *      accessible aux ADMINISTRATEURS uniquement ;
 *   3. immuabilité du journal : la route n'expose AUCUN handler d'écriture
 *      (POST / PUT / PATCH / DELETE) — les traces ne peuvent être ni créées
 *      par contournement, ni modifiées, ni supprimées depuis l'interface.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    historiqueParametre: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      utilisateur: vi.fn(),
    },
    utilisateur: { findMany: vi.fn().mockResolvedValue([]) },
    societe: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { API_PERMISSIONS } from '@/lib/authorize';
import * as historiqueRoute from '@/app/api/historique-parametres/route';

describe('API_PERMISSIONS — module Prestataires', () => {
  const config = API_PERMISSIONS['/api/prestataires'];

  it('la lecture (GET) est ouverte aux rôles internes', () => {
    expect(config.roles).toEqual(
      expect.arrayContaining(['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'])
    );
  });

  it('la modification (PUT) est réservée à ADMINISTRATEUR et TECHNIQUE', () => {
    expect(config.methods?.PUT).toEqual(
      expect.arrayContaining(['ADMINISTRATEUR', 'TECHNIQUE'])
    );
    expect(config.methods?.PUT).not.toContain('ACCUEIL');
    expect(config.methods?.PUT).not.toContain('COMPTABILITE');
    expect(config.methods?.PUT).not.toContain('SANTE');
    expect(config.methods?.PUT).not.toContain('PORTAIL_CLIENT');
    expect(config.methods?.PUT).not.toContain('CONTACT_ENTREPRISE');
  });

  it('la création et la suppression restent réservées à ADMINISTRATEUR', () => {
    expect(config.methods?.POST).toEqual(['ADMINISTRATEUR']);
    expect(config.methods?.DELETE).toEqual(['ADMINISTRATEUR']);
  });
});

describe('API_PERMISSIONS — Journal d\'Audit des Paramétrages', () => {
  it('est accessible uniquement aux ADMINISTRATEURS', () => {
    const config = API_PERMISSIONS['/api/historique-parametres'];
    expect(config.roles).toEqual(['ADMINISTRATEUR']);
  });

  it('les liaisons prestataire-société restent régies par le système central', () => {
    const config = API_PERMISSIONS['/api/prestataires/societes'];
    expect(config.methods?.PATCH).toEqual(expect.arrayContaining(['ADMINISTRATEUR', 'TECHNIQUE']));
    expect(config.methods?.DELETE).toEqual(['ADMINISTRATEUR']);
  });
});

describe('Immuabilité du Journal d\'Audit des Paramétrages (côté serveur)', () => {
  it('la route historique n\'expose que GET : aucune écriture possible', () => {
    const route = historiqueRoute as unknown as Record<string, unknown>;

    expect(typeof historiqueRoute.GET).toBe('function');
    expect(route.POST).toBeUndefined();
    expect(route.PUT).toBeUndefined();
    expect(route.PATCH).toBeUndefined();
    expect(route.DELETE).toBeUndefined();
  });
});
