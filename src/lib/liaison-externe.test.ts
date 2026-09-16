/**
 * Tests de src/lib/liaison-externe.ts — résolution de la société d'un compte
 * CONTACT_ENTREPRISE par e-mail, selon TROIS sources équivalentes :
 *   1. EntrepriseContact (contact déclaré, Sociétés → Contacts)
 *   2. Societe.emailContactPrincipal (contact principal — « Modifier la société »)
 *   3. Societe.email (e-mail général de la société, flux historique)
 * Le représentant saisi dans « Modifier la société » doit pouvoir obtenir un
 * accès portail SANS créer de fiche contact séparée.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  societeFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    entrepriseContact: { findFirst: dbMocks.contactFindFirst },
    societe: { findFirst: dbMocks.societeFindFirst },
  },
}));

import {
  resoudreLiaisonContactEntreprise,
  liaisonContactEntrepriseExiste,
} from './liaison-externe';

beforeEach(() => {
  // resetAllMocks (et non clearAllMocks) : vide aussi les files
  // mockResolvedValueOnce qui sinon fuient entre les tests.
  vi.resetAllMocks();
  dbMocks.contactFindFirst.mockResolvedValue(null);
  dbMocks.societeFindFirst.mockResolvedValue(null);
});

describe('resoudreLiaisonContactEntreprise', () => {
  it('source CONTACT : le contact déclaré est prioritaire', async () => {
    dbMocks.contactFindFirst.mockResolvedValue({ societeId: 'soc-1' });

    const r = await resoudreLiaisonContactEntreprise('rep@societe.mg');

    expect(r).toEqual({ societeId: 'soc-1', source: 'CONTACT' });
    expect(dbMocks.societeFindFirst).not.toHaveBeenCalled();
  });

  it('source SOCIETE_PRINCIPAL : e-mail du contact principal (Modifier la société)', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);
    dbMocks.societeFindFirst
      .mockResolvedValueOnce({ id: 'soc-2' })   // emailContactPrincipal
      .mockResolvedValueOnce({ id: 'soc-3' });  // email général (non atteint)

    const r = await resoudreLiaisonContactEntreprise('principal@societe.mg');

    expect(r).toEqual({ societeId: 'soc-2', source: 'SOCIETE_PRINCIPAL' });
    expect(dbMocks.societeFindFirst).toHaveBeenCalledTimes(1);
  });

  it('source SOCIETE_EMAIL : e-mail général de la société (flux historique)', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);
    dbMocks.societeFindFirst
      .mockResolvedValueOnce(null)              // emailContactPrincipal
      .mockResolvedValueOnce({ id: 'soc-3' });  // email général

    const r = await resoudreLiaisonContactEntreprise('contact@societe.mg');

    expect(r).toEqual({ societeId: 'soc-3', source: 'SOCIETE_EMAIL' });
  });

  it('null quand aucune source ne correspond (fail-closed)', async () => {
    const r = await resoudreLiaisonContactEntreprise('inconnu@ailleurs.mg');
    expect(r).toBeNull();
  });

  it('null sur e-mail vide/espaces', async () => {
    expect(await resoudreLiaisonContactEntreprise('')).toBeNull();
    expect(await resoudreLiaisonContactEntreprise('   ')).toBeNull();
    expect(dbMocks.contactFindFirst).not.toHaveBeenCalled();
  });
});

describe('liaisonContactEntrepriseExiste', () => {
  it('true dès qu\u2019une source correspond', async () => {
    dbMocks.contactFindFirst.mockResolvedValue({ societeId: 'soc-1' });
    expect(await liaisonContactEntrepriseExiste('rep@societe.mg')).toBe(true);

    dbMocks.contactFindFirst.mockResolvedValue(null);
    dbMocks.societeFindFirst.mockResolvedValueOnce({ id: 'soc-2' });
    expect(await liaisonContactEntrepriseExiste('principal@societe.mg')).toBe(true);
  });

  it('false sans aucune liaison', async () => {
    expect(await liaisonContactEntrepriseExiste('x@y.z')).toBe(false);
  });
});
