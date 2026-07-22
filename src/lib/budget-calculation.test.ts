import { describe, it, expect } from 'vitest';

// ─── Logique pure de calcul budget (reflète l'enrichissement API) ───────────
// Ces tests valident le même algorithme utilisé dans /api/contrats/route.ts
// et /api/contrats/[id]/route.ts après la correction du bug budgetUtilise.

interface AppelDeFond {
  montant: number;
  statut: string;
}

interface ContratRaw {
  budgetAnnuel: number;
  appelsDeFonds: AppelDeFond[];
}

function calculerBudget(data: ContratRaw) {
  const budget = Number(data.budgetAnnuel) || 0;
  const utilise = data.appelsDeFonds.reduce(
    (s: number, a) => s + (Number(a.montant) || 0),
    0
  );
  const solde = budget - utilise;
  const taux = budget > 0 ? Math.round((utilise / budget) * 100) : 0;
  return { budget, utilise, solde, taux };
}

describe('calculerBudget — logique de calcul depuis appelsDeFonds', () => {
  it('retourne 0 pour un contrat sans appels de fonds', () => {
    const result = calculerBudget({ budgetAnnuel: 100_000_000, appelsDeFonds: [] });
    expect(result.utilise).toBe(0);
    expect(result.solde).toBe(100_000_000);
    expect(result.taux).toBe(0);
  });

  it('calcule correctement avec plusieurs appels', () => {
    const result = calculerBudget({
      budgetAnnuel: 90_217_864.65,
      appelsDeFonds: [
        { montant: 15_000_000, statut: 'EN_ATTENTE' },
        { montant: 25_000_000, statut: 'REGLE' },
        { montant: 10_000_000, statut: 'EN_ATTENTE' },
      ],
    });
    expect(result.utilise).toBe(50_000_000);
    expect(result.solde).toBeCloseTo(40_217_864.65, 1);
    expect(result.taux).toBe(55); // Math.round(50M / 90.2M * 100)
  });

  it('ne produit jamais NaN — montant undefined dans un appel', () => {
    const result = calculerBudget({
      budgetAnnuel: 100_000_000,
      appelsDeFonds: [
        { montant: undefined as unknown as number, statut: 'EN_ATTENTE' },
      ],
    });
    expect(result.utilise).toBe(0);
    expect(result.solde).toBe(100_000_000);
    expect(isNaN(result.taux)).toBe(false);
  });

  it('ne produit jamais NaN — montant null dans un appel', () => {
    const result = calculerBudget({
      budgetAnnuel: 100_000_000,
      appelsDeFonds: [
        { montant: null as unknown as number, statut: 'EN_ATTENTE' },
      ],
    });
    expect(result.utilise).toBe(0);
    expect(isNaN(result.solde)).toBe(false);
  });

  it('ne produit jamais NaN — budgetAnnuel à 0', () => {
    const result = calculerBudget({
      budgetAnnuel: 0,
      appelsDeFonds: [{ montant: 50_000, statut: 'REGLE' }],
    });
    expect(result.taux).toBe(0); // division par zéro protégée
    expect(result.utilise).toBe(50_000);
  });

  it('ne produit jamais NaN — budgetAnnuel undefined', () => {
    const result = calculerBudget({
      budgetAnnuel: undefined as unknown as number,
      appelsDeFonds: [{ montant: 50_000, statut: 'REGLE' }],
    });
    expect(result.budget).toBe(0);
    expect(isNaN(result.taux)).toBe(false);
  });

  it('détecte un dépassement budget (solde négatif)', () => {
    const result = calculerBudget({
      budgetAnnuel: 100_000,
      appelsDeFonds: [{ montant: 150_000, statut: 'EN_ATTENTE' }],
    });
    expect(result.solde).toBe(-50_000);
    expect(result.taux).toBe(150);
  });

  it('compte tous les appels quel que soit le statut', () => {
    const result = calculerBudget({
      budgetAnnuel: 1_000_000,
      appelsDeFonds: [
        { montant: 200_000, statut: 'EN_ATTENTE' },
        { montant: 300_000, statut: 'REGLE' },
        { montant: 100_000, statut: 'PARTIELLEMENT_REGLE' },
      ],
    });
    // Tous les montants sont comptés (source de vérité = appelsDeFonds)
    expect(result.utilise).toBe(600_000);
  });

  it('gère les montants flottants correctement', () => {
    const result = calculerBudget({
      budgetAnnuel: 414_740_221.80,
      appelsDeFonds: [
        { montant: 123_456.78, statut: 'REGLE' },
        { montant: 987_654.32, statut: 'EN_ATTENTE' },
      ],
    });
    expect(result.utilise).toBeCloseTo(1_111_111.10, 1);
    expect(isNaN(result.solde)).toBe(false);
    expect(isNaN(result.taux)).toBe(false);
  });
});
