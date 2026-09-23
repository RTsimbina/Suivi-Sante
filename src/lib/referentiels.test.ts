// ─── Tests de non-régression — Référentiels ─────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ROLE_LABELS,
  INTERNAL_ROLES,
  SERVICES_GESTIONNAIRE,
  MOYENS_PAIEMENT,
  MOYEN_PAIEMENT_VALEURS,
  MOYEN_PAIEMENT_ALIASES,
  normaliserMoyenPaiement,
  moyenPaiementLabel,
  CATEGORIES_DOSSIER,
  TYPES_JUSTIFICATIF,
  TYPES_PRESTATAIRE,
  TYPES_COURRIEL,
  TYPES_BENEFICIAIRE,
  normaliserTypeBeneficiaire,
  CANAUX_BOT,
  SOURCES_DOSSIER,
  STATUTS_IMPORT,
  referentielValide,
} from './referentiels';

describe('Rôles', () => {
  it('les 8 rôles ont tous un libellé avec accents', () => {
    expect(ROLES).toEqual([
      'ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE',
      'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE',
    ]);
    for (const r of ROLES) {
      expect(ROLE_LABELS[r], `libellé manquant pour ${r}`).toBeTruthy();
      expect(ROLE_LABELS[r]).toMatch(/[a-zA-Zàâäéèêëîïôöùûüç]/); // non vide
    }
    // Accents canoniques (divergence historique corrigée)
    expect(ROLE_LABELS.COMPTABILITE).toBe('Comptabilité');
    expect(ROLE_LABELS.SANTE).toBe('Contrôle Santé');
  });

  it('les rôles internes sont un sous-ensemble des rôles', () => {
    for (const r of INTERNAL_ROLES) expect(ROLES).toContain(r);
  });
});

describe('Moyens de paiement', () => {
  it('référentiel valide et ESPECES canonique', () => {
    expect(referentielValide(MOYENS_PAIEMENT)).toBe(true);
    expect(MOYEN_PAIEMENT_VALEURS).toContain('ESPECES');
  });

  it('les alias convergent vers des valeurs canoniques', () => {
    for (const cible of Object.values(MOYEN_PAIEMENT_ALIASES)) {
      expect(MOYEN_PAIEMENT_VALEURS, `alias vers valeur inconnue: ${cible}`).toContain(cible);
    }
  });

  it('normaliserMoyenPaiement corrige les variantes historiques', () => {
    expect(normaliserMoyenPaiement('ESPECE')).toBe('ESPECES');
    expect(normaliserMoyenPaiement('Espèces')).toBe('ESPECES');
    expect(normaliserMoyenPaiement('VIREMENT_BANCAIRE')).toBe('VIREMENT');
    expect(normaliserMoyenPaiement('chq')).toBe('CHEQUE');
    expect(normaliserMoyenPaiement('CARTTE')).toBe('CARTE');
    expect(normaliserMoyenPaiement('')).toBe('');
    expect(normaliserMoyenPaiement(null)).toBe('');
  });

  it('moyenPaiementLabel retourne un libellé lisible', () => {
    expect(moyenPaiementLabel('ESPECE')).toBe('Espèces');
    expect(moyenPaiementLabel(null)).toBe('—');
  });
});

describe('Autres référentiels', () => {
  it('tous valides (unicité, libellés non vides)', () => {
    expect(referentielValide(SERVICES_GESTIONNAIRE)).toBe(true);
    expect(referentielValide(CATEGORIES_DOSSIER)).toBe(true);
    expect(referentielValide(TYPES_JUSTIFICATIF)).toBe(true);
    expect(referentielValide(TYPES_PRESTATAIRE)).toBe(true);
    expect(referentielValide(TYPES_COURRIEL)).toBe(true);
    expect(referentielValide(TYPES_BENEFICIAIRE)).toBe(true);
    expect(referentielValide(CANAUX_BOT)).toBe(true);
    expect(referentielValide(SOURCES_DOSSIER)).toBe(true);
    expect(referentielValide(STATUTS_IMPORT)).toBe(true);
  });

  it('les 3 services Gestionnaire correspondent au workflow', () => {
    expect(SERVICES_GESTIONNAIRE.map((s) => s.valeur)).toEqual(['ACCUEIL', 'TECHNIQUE', 'COMPTABILITE']);
  });

  it('types bénéficiaire : normalisation des alias imports', () => {
    expect(normaliserTypeBeneficiaire('assure')).toBe('ASSURE');
    expect(normaliserTypeBeneficiaire('ASSURE PRINCIPAL')).toBe('ASSURE');
    expect(normaliserTypeBeneficiaire('ENFANT')).toBe('ENFANT');
  });
});
