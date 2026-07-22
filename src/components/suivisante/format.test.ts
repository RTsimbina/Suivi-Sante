import { describe, it, expect } from 'vitest';
import { formatMontant, formatMontantCourt, formatDate, statutLabel, typeDossierLabel } from '@/components/suivisante/format';

describe('formatMontant', () => {
  it('formate un montant normal en français', () => {
    const result = formatMontant(1234567.89);
    expect(result).toContain('Ar');
    expect(result).toContain('1'); // au moins le premier chiffre
  });

  it('retourne "0 Ar" pour undefined', () => {
    expect(formatMontant(undefined)).toBe('0 Ar');
  });

  it('retourne "0 Ar" pour null', () => {
    expect(formatMontant(null)).toBe('0 Ar');
  });

  it('retourne "0 Ar" pour NaN', () => {
    expect(formatMontant(NaN)).toBe('0 Ar');
  });

  it('retourne "0 Ar" pour Infinity', () => {
    expect(formatMontant(Infinity)).toBe('0 Ar');
  });

  it('retourne "0 Ar" pour 0', () => {
    expect(formatMontant(0)).toBe('0 Ar');
  });

  it('gère les grands montants', () => {
    const result = formatMontant(90217864.65);
    expect(result).toContain('Ar');
    expect(result).not.toContain('NaN');
  });

  it('gère les montants négatifs', () => {
    const result = formatMontant(-15000);
    expect(result).toContain('Ar');
    expect(result).not.toContain('NaN');
  });
});

describe('formatMontantCourt', () => {
  it('formate en milliards (Mds)', () => {
    const result = formatMontantCourt(2_500_000_000);
    expect(result).toContain('Mds Ar');
  });

  it('formate en millions (M)', () => {
    const result = formatMontantCourt(90_217_864);
    expect(result).toContain('M Ar');
  });

  it('formate en milliers (K)', () => {
    const result = formatMontantCourt(45_000);
    expect(result).toContain('K Ar');
  });

  it('formate les petits montants sans abréviation', () => {
    const result = formatMontantCourt(500);
    expect(result).toContain('Ar');
    expect(result).not.toContain('K');
    expect(result).not.toContain('M');
  });

  it('retourne "0 Ar" pour null', () => {
    expect(formatMontantCourt(null)).toBe('0 Ar');
  });

  it('retourne "0 Ar" pour undefined', () => {
    expect(formatMontantCourt(undefined)).toBe('0 Ar');
  });
});

describe('formatDate', () => {
  it('formate une date ISO en français (jj/mm/aaaa)', () => {
    const result = formatDate('2026-12-31');
    expect(result).toBe('31/12/2026');
  });

  it('formate un objet Date', () => {
    const result = formatDate(new Date('2026-07-21'));
    expect(result).toBe('21/07/2026');
  });
});

describe('statutLabel', () => {
  it('retourne le label français pour un statut connu', () => {
    expect(statutLabel('RECU')).toBe('Reçu');
    expect(statutLabel('EN_ANALYSE')).toBe('En analyse');
    expect(statutLabel('VALIDE')).toBe('Validé');
    expect(statutLabel('PAYE')).toBe('Payé');
    expect(statutLabel('REJETE')).toBe('Rejeté');
    expect(statutLabel('EN_PAIEMENT')).toBe('En paiement');
    expect(statutLabel('EN_COMPTABILITE')).toBe('En comptabilité');
  });

  it('retourne le statut brut si inconnu', () => {
    expect(statutLabel('INCONNU')).toBe('INCONNU');
  });
});

describe('typeDossierLabel', () => {
  it('retourne le label pour les types connus', () => {
    expect(typeDossierLabel('HOSPITALISATION')).toBe('Hospitalisation');
    expect(typeDossierLabel('CONSULTATION')).toBe('Consultation');
    expect(typeDossierLabel('PHARMACIE')).toBe('Pharmacie');
    expect(typeDossierLabel('OPTIQUE')).toBe('Optique');
    expect(typeDossierLabel('SOINS DENTAIRES')).toBe('Soins Dentaires');
  });

  it('retourne le type brut si inconnu', () => {
    expect(typeDossierLabel('RADIOLOGIE')).toBe('RADIOLOGIE');
  });
});