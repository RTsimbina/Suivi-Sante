/**
 * Tests unitaires du Portail Prestataire (helpers métier purs) :
 *   - deriveStatutFacture : correspondance workflow dossier → statut facture
 *   - soldeFacture : calcul du solde restant (Decimal)
 *   - masquerNss : masquage de la donnée sensible
 */

import { describe, it, expect } from 'vitest';
import {
  deriveStatutFacture,
  soldeFacture,
  masquerNss,
  montantDu,
  type DossierPourStatut,
} from './portail-prestataire';
import { enNombre } from './money';

const dossier = (p: Partial<DossierPourStatut>): DossierPourStatut => ({
  statut: 'RECU',
  montantReclame: '100000',
  montantValide: null,
  montantPaye: null,
  ...p,
});

describe('deriveStatutFacture — correspondance workflow plateforme', () => {
  it('RECU → SOUMISE (Brouillon inapplicable : acte enregistré dès réception)', () => {
    expect(deriveStatutFacture(dossier({ statut: 'RECU' }))).toBe('SOUMISE');
  });

  it('EN_ANALYSE → EN_TRAITEMENT', () => {
    expect(deriveStatutFacture(dossier({ statut: 'EN_ANALYSE' }))).toBe('EN_TRAITEMENT');
  });

  it('VALIDE → VALIDEE', () => {
    expect(deriveStatutFacture(dossier({ statut: 'VALIDE' }))).toBe('VALIDEE');
  });

  it('EN_COMPTABILITE et EN_PAIEMENT → VALIDEE (règlement à venir)', () => {
    expect(deriveStatutFacture(dossier({ statut: 'EN_COMPTABILITE' }))).toBe('VALIDEE');
    expect(deriveStatutFacture(dossier({ statut: 'EN_PAIEMENT' }))).toBe('VALIDEE');
  });

  it('PAYE → REGLEE', () => {
    expect(deriveStatutFacture(dossier({ statut: 'PAYE', montantPaye: '100000' }))).toBe('REGLEE');
  });

  it('REJETE → REJETEE (même avec des montants)', () => {
    expect(deriveStatutFacture(dossier({ statut: 'REJETE', montantPaye: '50000' }))).toBe('REJETEE');
  });

  it('règlement partiel → PARTIELLEMENT_REGLEE (statut intermédiaire)', () => {
    expect(deriveStatutFacture(dossier({
      statut: 'VALIDE', montantValide: '80000', montantPaye: '30000',
    }))).toBe('PARTIELLEMENT_REGLEE');
  });

  it('PAYE avec montant réglé inférieur au dû → PARTIELLEMENT_REGLEE (préempte)', () => {
    expect(deriveStatutFacture(dossier({
      statut: 'PAYE', montantValide: '80000', montantPaye: '30000',
    }))).toBe('PARTIELLEMENT_REGLEE');
  });

  it('montant réglé ≥ dû (hors PAYE) → REGLEE (règlement complet non encore marqué)', () => {
    expect(deriveStatutFacture(dossier({
      statut: 'EN_PAIEMENT', montantValide: '80000', montantPaye: '80000',
    }))).toBe('REGLEE');
  });

  it('montant dû = montantValide s\u2019il est renseigné, sinon montantReclame', () => {
    expect(deriveStatutFacture(dossier({
      statut: 'VALIDE', montantReclame: '100000', montantValide: '60000', montantPaye: '10000',
    }))).toBe('PARTIELLEMENT_REGLEE');
    expect(deriveStatutFacture(dossier({
      statut: 'VALIDE', montantReclame: '100000', montantValide: null, montantPaye: '10000',
    }))).toBe('PARTIELLEMENT_REGLEE');
  });

  it('statut inconnu → SOUMISE (fallback)', () => {
    expect(deriveStatutFacture(dossier({ statut: 'IMPREVU' }))).toBe('SOUMISE');
  });
});

describe('soldeFacture', () => {
  it('dossier rejeté → solde nul', () => {
    expect(enNombre(soldeFacture(dossier({ statut: 'REJETE', montantReclame: '100000' })))).toBe(0);
  });

  it('solde = dû − réglé', () => {
    expect(enNombre(soldeFacture(dossier({
      statut: 'VALIDE', montantValide: '80000', montantPaye: '30000',
    })))).toBe(50000);
  });

  it('sans montant réglé → solde = dû', () => {
    expect(enNombre(soldeFacture(dossier({
      statut: 'RECU', montantReclame: '100000',
    })))).toBe(100000);
  });

  it('surpaiement → solde borné à 0', () => {
    expect(enNombre(soldeFacture(dossier({
      statut: 'PAYE', montantValide: '80000', montantPaye: '90000',
    })))).toBe(0);
  });

  it('montantDu : fallback sur montantReclame quand montantValide absent', () => {
    expect(enNombre(montantDu(dossier({ montantReclame: '100000', montantValide: null })))).toBe(100000);
    expect(enNombre(montantDu(dossier({ montantReclame: '100000', montantValide: '80000' })))).toBe(80000);
  });
});

describe('masquerNss — donnée minimale exposée au portail', () => {
  it('masque le corps du NSS (3 premiers + 2 derniers caractères)', () => {
    expect(masquerNss('123456789012')).toBe('123••••••12');
  });

  it('NSS court ou vide → affiché tel quel ou tiret', () => {
    expect(masquerNss('12345')).toBe('12345');
    expect(masquerNss('')).toBe('—');
    expect(masquerNss(null)).toBe('—');
  });
});
