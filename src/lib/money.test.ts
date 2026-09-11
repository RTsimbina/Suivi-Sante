/**
 * Tests des utilitaires monétaires (plan P3 — Float → Decimal(18,2)).
 * Objectif : garantir l'arithmétique EXACTE des calculs financiers serveur.
 */
import { describe, it, expect } from 'vitest';
import {
  versDecimal,
  enNombre,
  sommer,
  arrondir2,
  plus,
  moins,
  appliquerTaux,
  minDecimal,
  reliquat,
  superieurA,
  superieurOuEgal,
  inferieurOuEgal,
  inferieurA,
  egaux,
  formaterAr,
  formaterNombre,
  formaterPourcent,
  Decimal,
} from './money';

describe('versDecimal', () => {
  it('convertit les nombres décimaux imprecis en valeur exacte', () => {
    // 0.1 + 0.2 = 0.30000000000000004 en flottant — Decimal corrige
    const a = versDecimal(0.1)!;
    const b = versDecimal(0.2)!;
    expect(a.plus(b).toString()).toBe('0.3');
  });

  it('accepte les chaînes avec virgule et espaces (imports Excel/SAGE)', () => {
    expect(versDecimal('1 234,56')!.toString()).toBe('1234.56');
    expect(versDecimal('12.30')!.toString()).toBe('12.3');
  });

  it('renvoie null pour null/undefined/vide/non numérique/Infinity', () => {
    expect(versDecimal(null)).toBeNull();
    expect(versDecimal(undefined)).toBeNull();
    expect(versDecimal('')).toBeNull();
    expect(versDecimal('abc')).toBeNull();
    expect(versDecimal(NaN)).toBeNull();
    expect(versDecimal(Infinity)).toBeNull();
  });
});

describe('sommer', () => {
  it('somme exactement des montants que le flottant fausserait', () => {
    // reduce flottant : 0.1+0.2+0.3 = 0.6000000000000001
    const total = sommer([0.1, 0.2, 0.3]);
    expect(total.toString()).toBe('0.6');
  });

  it('ignore les valeurs nulles/non numériques', () => {
    expect(sommer([100, null, undefined, 'abc', 50]).toNumber()).toBe(150);
  });

  it('renvoie 0 pour une liste vide', () => {
    expect(sommer([]).toNumber()).toBe(0);
  });
});

describe('arrondir2 / plus / moins', () => {
  it('arrondit comptablement à 2 décimales (HALF_UP)', () => {
    expect(arrondir2('12.345')!.toString()).toBe('12.35'); // half-up, pas bankers
    expect(arrondir2('12.344')!.toString()).toBe('12.34');
    expect(arrondir2(1.005)!.toString()).toBe('1.01'); // le flottant donnerait 1.00 avec Math.round
  });

  it('plus et moins restent exacts sur les cas à problème', () => {
    expect(plus(0.1, 0.2)!.toString()).toBe('0.3');
    expect(moins(1, 0.9)!.toString()).toBe('0.1'); // flottant : 0.09999999999999998
    expect(moins('12.30', 2.3)!.toString()).toBe('10');
  });

  it('plus/moins renvoient null si un opérande est non numérique', () => {
    expect(plus(1, null)).toBeNull();
    expect(moins(null, 1)).toBeNull();
  });
});

describe('appliquerTaux', () => {
  it('applique un pourcentage de couverture avec arrondi comptable', () => {
    expect(appliquerTaux(10000, 80)!.toNumber()).toBe(8000);
    expect(appliquerTaux('12345.67', 90)!.toString()).toBe('11111.1'); // 11111.103 → 11111.10
    expect(appliquerTaux(100, 15.5)!.toNumber()).toBe(15.5);
  });
});

describe('minDecimal / reliquat', () => {
  it('minDecimal compare exactement (pas via number)', () => {
    expect(minDecimal('12.30', 12.3)!.toString()).toBe('12.3');
    expect(minDecimal(5, 10)!.toNumber()).toBe(5);
    expect(minDecimal(10, 5)!.toNumber()).toBe(5);
  });

  it('reliquat = max(0, plafond − consommé)', () => {
    expect(reliquat(1000, 400)!.toNumber()).toBe(600);
    expect(reliquat(1000, 1500)!.toNumber()).toBe(0);
    expect(reliquat('1000.00', '1000.00')!.toNumber()).toBe(0);
  });
});

describe('comparaisons exactes', () => {
  it('egaux compare la VALEUR quelle que soit la représentation', () => {
    expect(egaux('12.30', 12.3)).toBe(true);
    expect(egaux(0.1, '0.1')).toBe(true);
    expect(egaux(100, 100.01)).toBe(false);
    expect(egaux(null, 0)).toBe(false);
    expect(egaux(new Decimal('42.00'), 42)).toBe(true);
  });

  it('superieurA / inferieurA etc. gèrent number vs Decimal mixte', () => {
    expect(superieurA('12.31', 12.3)).toBe(true);
    expect(superieurA(12.29, '12.3')).toBe(false);
    expect(superieurOuEgal('12.30', 12.3)).toBe(true);
    expect(inferieurA(-5, 0)).toBe(true);
    expect(inferieurOuEgal(0, '0.00')).toBe(true);
  });
});

describe('formatage', () => {
  it('formaterAr produit le format lisible Ariary', () => {
    // Node fr-FR : séparateur de milliers = espace fine insécable (U+202F)
    expect(formaterAr(1234567.89)).toBe('1\u202f234\u202f567,89 Ar');
    expect(formaterAr(null)).toBe('Non déterminé');
    expect(formaterAr(undefined, '—')).toBe('—');
  });

  it('formaterNombre formate sans devise (FCFA…)', () => {
    expect(formaterNombre('1234.5')).toBe('1\u202f234,5');
    expect(formaterNombre(null)).toBe('Non déterminé');
  });

  it('formaterPourcent calcule le pourcentage exact', () => {
    expect(formaterPourcent(70, 100)).toBe('70%');
    expect(formaterPourcent('73.44', 100)).toBe('73,4%');
    expect(formaterPourcent(5, 0)).toBe('0%'); // pas de division par zéro
  });
});
