// ─── Tests — Cohérence croisée référentiels ↔ validation ────────────────────
// Garantit que les listes d'énumérations du module Zod (src/lib/validation)
// sont STRICTEMENT identiques aux sources de vérité (statuts.ts / referentiels.ts).
// Toute divergence future (ajout d'un statut d'un seul côté) fait échouer les tests.

import { describe, it, expect } from 'vitest';
import { DOSSIER_STATUT_VALEURS } from './statuts';
import { ROLES, CATEGORIES_DOSSIER, TYPES_BENEFICIAIRE } from './referentiels';

// Les listes du module de validation (définies localement pour préserver le
// typage littéral des z.enum) — importées ici depuis les sources du module.
import {
  statutDossierSchema,
  roleUtilisateurSchema,
  categorieDossierSchema,
  typeBeneficiaireSchema,
} from './validation';

function optionsDuSchema(schema: { options?: readonly string[] }): string[] {
  return [...(schema.options ?? [])];
}

describe('Cohérence croisée — statuts', () => {
  it('statutDossierSchema = DOSSIER_STATUT_VALEURS (statuts.ts)', () => {
    expect(optionsDuSchema(statutDossierSchema)).toEqual(DOSSIER_STATUT_VALEURS);
  });
});

describe('Cohérence croisée — rôles', () => {
  it('roleUtilisateurSchema = ROLES (referentiels.ts, 8 rôles avec PRESTATAIRE)', () => {
    expect(optionsDuSchema(roleUtilisateurSchema)).toEqual([...ROLES]);
    expect(ROLES).toContain('PRESTATAIRE');
  });
});

describe('Cohérence croisée — autres énumérations', () => {
  it('categorieDossierSchema = CATEGORIES_DOSSIER (referentiels.ts)', () => {
    expect(optionsDuSchema(categorieDossierSchema)).toEqual(CATEGORIES_DOSSIER.map((c) => c.valeur));
  });

  it('typeBeneficiaireSchema = TYPES_BENEFICIAIRE (referentiels.ts)', () => {
    expect(optionsDuSchema(typeBeneficiaireSchema)).toEqual(TYPES_BENEFICIAIRE.map((t) => t.valeur));
  });
});
