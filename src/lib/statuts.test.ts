// ─── Tests de non-régression — Statuts ──────────────────────────────────────
// Garantit la cohérence de la source de vérité : unicité, libellés, couleurs,
// transitions et rôles associés.

import { describe, it, expect } from 'vitest';
import {
  DOSSIER_STATUTS,
  DOSSIER_STATUT_VALEURS,
  DOSSIER_TRANSITIONS,
  DOSSIER_ROLE_TRANSITIONS,
  CONTRAT_STATUTS,
  CONTRAT_STATUT_VALEURS,
  APPEL_FONDS_STATUTS,
  APPEL_FONDS_STATUT_VALEURS,
  APPEL_FONDS_TRANSITIONS,
  COURRIEL_STATUTS,
  COURRIEL_STATUT_VALEURS,
  dossierStatutLabel,
  dossierStatutBadge,
  transitionDossierAutorisee,
  roleAutoriseTransitionDossier,
  transitionAppelFondsAutorisee,
} from './statuts';

function assertReferentielStatutValide(liste: { valeur: string; label: string; badge: string; hex: string }[]) {
  const valeurs = liste.map((s) => s.valeur);
  // Unicité des valeurs techniques
  expect(new Set(valeurs).size).toBe(valeurs.length);
  for (const s of liste) {
    expect(s.valeur.length).toBeGreaterThan(0);
    expect(s.label.length).toBeGreaterThan(0);
    expect(s.badge).toMatch(/^bg-/); // classe Tailwind valide
    expect(s.hex).toMatch(/^#[0-9a-fA-F]{6}$/); // hex valide
  }
}

describe('Statuts — Dossier', () => {
  it('contient les 7 statuts du workflow dans l\'ordre', () => {
    expect(DOSSIER_STATUT_VALEURS).toEqual([
      'RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE',
    ]);
  });

  it('valeurs uniques, libellés et couleurs définis', () => {
    assertReferentielStatutValide(DOSSIER_STATUTS);
  });

  it('chaque transition pointe vers un statut existant', () => {
    for (const [de, vers] of Object.entries(DOSSIER_TRANSITIONS)) {
      expect(DOSSIER_STATUT_VALEURS, `statut source inconnu: ${de}`).toContain(de);
      for (const v of vers) {
        expect(DOSSIER_STATUT_VALEURS, `statut cible inconnu: ${v}`).toContain(v);
      }
    }
  });

  it('chaque transition a une règle de rôle et réciproquement', () => {
    for (const [de, vers] of Object.entries(DOSSIER_TRANSITIONS)) {
      for (const v of vers) {
        expect(DOSSIER_ROLE_TRANSITIONS, `rôles manquants pour ${de}_${v}`).toHaveProperty(`${de}_${v}`);
      }
    }
    for (const key of Object.keys(DOSSIER_ROLE_TRANSITIONS)) {
      // Les statuts contiennent des _ : chercher le point de coupe où DE et VERS sont connus
      let parsed: { de: string; vers: string } | null = null;
      for (let i = 0; i < key.length; i++) {
        if (key[i] !== '_') continue;
        const de = key.slice(0, i);
        const vers = key.slice(i + 1);
        if (DOSSIER_STATUT_VALEURS.includes(de) && DOSSIER_STATUT_VALEURS.includes(vers)) {
          parsed = { de, vers };
          break;
        }
      }
      expect(parsed, `clé de transition non parsable: ${key}`).not.toBeNull();
      if (parsed) {
        expect(DOSSIER_TRANSITIONS[parsed.de], `transition orpheline: ${key}`).toContain(parsed.vers);
      }
    }
  });

  it('transitionDossierAutorisee applique la matrice', () => {
    expect(transitionDossierAutorisee('RECU', 'EN_ANALYSE')).toBe(true);
    expect(transitionDossierAutorisee('RECU', 'PAYE')).toBe(false);
    expect(transitionDossierAutorisee('PAYE', 'RECU')).toBe(false);
  });

  it('roleAutoriseTransitionDossier applique la matrice des rôles', () => {
    expect(roleAutoriseTransitionDossier('RECU', 'EN_ANALYSE', 'ACCUEIL')).toBe(true);
    expect(roleAutoriseTransitionDossier('RECU', 'EN_ANALYSE', 'COMPTABILITE')).toBe(false);
    // Transition sans règle de rôle → permis (comportement historique)
    expect(roleAutoriseTransitionDossier('RECU', 'EN_ANALYSE', undefined)).toBe(true);
  });

  it('libellés et badges avec fallback sûr pour valeur inconnue', () => {
    expect(dossierStatutLabel('RECU')).toBe('Reçu');
    expect(dossierStatutLabel('INCONNU')).toBe('INCONNU');
    expect(dossierStatutBadge('INCONNU')).toContain('bg-muted');
  });
});

describe('Statuts — Contrat', () => {
  it('contient les 3 statuts avec config complète', () => {
    expect(CONTRAT_STATUT_VALEURS).toEqual(['ACTIF', 'EXPIRE', 'SUSPENDU']);
    assertReferentielStatutValide(CONTRAT_STATUTS);
  });
});

describe('Statuts — Appel de fonds', () => {
  it('contient les 3 statuts avec config complète (ANNULE inclus)', () => {
    expect(APPEL_FONDS_STATUT_VALEURS).toEqual(['EN_ATTENTE', 'REGLE', 'ANNULE']);
    assertReferentielStatutValide(APPEL_FONDS_STATUTS);
  });

  it('transitions autorisées cohérentes', () => {
    expect(transitionAppelFondsAutorisee('EN_ATTENTE', 'REGLE')).toBe(true);
    expect(transitionAppelFondsAutorisee('EN_ATTENTE', 'ANNULE')).toBe(true);
    expect(transitionAppelFondsAutorisee('REGLE', 'EN_ATTENTE')).toBe(true); // correction
    expect(transitionAppelFondsAutorisee('PAYE', 'REGLE')).toBe(false);
    // Toute transition déclarée pointe vers un statut existant
    for (const [de, vers] of Object.entries(APPEL_FONDS_TRANSITIONS)) {
      expect(APPEL_FONDS_STATUT_VALEURS).toContain(de);
      for (const v of vers) expect(APPEL_FONDS_STATUT_VALEURS).toContain(v);
    }
  });
});

describe('Statuts — Courriel', () => {
  it('contient les 3 statuts avec config complète', () => {
    expect(COURRIEL_STATUT_VALEURS).toEqual(['RECU', 'TRAITE', 'REJETE']);
    assertReferentielStatutValide(COURRIEL_STATUTS);
  });
});
