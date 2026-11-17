import { describe, it, expect } from 'vitest';
import {
  vueParDefaut,
  resoudreVue,
  estCheminLocal,
  ciblePostConnexion,
  VUE_PROFIL,
} from './navigation';

/** Clés autorisées d'un rôle SANTE (vues du cahier de navigation). */
const SANTE = ['dossiers', 'assures', 'prestataires', 'societes', 'sante', 'ia', 'chat', 'portail'];
const ADMIN = ['direction', 'import', 'dossiers', 'technique', 'comptabilite', 'reporting'];
const ACCUEIL = ['import', 'reception', 'dossiers', 'kanban', 'assures'];

describe('vueParDefaut', () => {
  it('ACCUEIL démarre sur « Accueil » (import)', () => {
    expect(vueParDefaut('ACCUEIL', ACCUEIL)).toBe('import');
  });

  it('les autres rôles démarrent sur leur première vue autorisée', () => {
    expect(vueParDefaut('ADMINISTRATEUR', ADMIN)).toBe('direction');
    expect(vueParDefaut('SANTE', SANTE)).toBe('dossiers');
  });

  it('retourne null pour un rôle sans navigation interne (portails dédiés)', () => {
    expect(vueParDefaut('PORTAIL_CLIENT', [])).toBeNull();
    expect(vueParDefaut('PRESTATAIRE', [])).toBeNull();
    expect(vueParDefaut(null, ADMIN)).toBeNull();
  });
});

describe('resoudreVue', () => {
  it('restaure la vue depuis l\'URL (F5) — même module, même page', () => {
    const r = resoudreVue('technique', 'TECHNIQUE', ['dossiers', 'technique', 'assures']);
    expect(r.vue).toBe('technique');
    expect(r.urlCanonique).toBeNull(); // URL déjà canonique, aucune correction
  });

  it('URL sans paramètre vue → vue par défaut du rôle + URL canonique à corriger', () => {
    const r = resoudreVue(null, 'SANTE', SANTE);
    expect(r.vue).toBe('dossiers');
    expect(r.urlCanonique).toBe('/?vue=dossiers');
  });

  it('vue inconnue dans l\'URL → vue par défaut du rôle', () => {
    const r = resoudreVue('inexistant', 'SANTE', SANTE);
    expect(r.vue).toBe('dossiers');
    expect(r.urlCanonique).toBe('/?vue=dossiers');
  });

  it('vue non autorisée pour le rôle → fallback (garde de rôle préservé)', () => {
    // reporting est réservé à ADMINISTRATEUR/COMPTABILITE : un SANTE ne l'obtient pas
    const r = resoudreVue('reporting', 'SANTE', SANTE);
    expect(r.vue).toBe('dossiers');
    expect(r.urlCanonique).toBe('/?vue=dossiers');
  });

  it('profil est accessible pour tout rôle connecté, sans correction d\'URL', () => {
    const r = resoudreVue(VUE_PROFIL, 'SANTE', SANTE);
    expect(r.vue).toBe('profil');
    expect(r.urlCanonique).toBeNull();
  });

  it('rôle sans navigation interne (portails) → null, la page redirige vers le portail', () => {
    expect(resoudreVue('dossiers', 'PORTAIL_CLIENT', [])).toEqual({ vue: null, urlCanonique: null });
    expect(resoudreVue('technique', 'PRESTATAIRE', [])).toEqual({ vue: null, urlCanonique: null });
  });
});

describe('estCheminLocal', () => {
  it('accepte les chemins locaux absolus (avec ou sans query)', () => {
    expect(estCheminLocal('/')).toBe(true);
    expect(estCheminLocal('/?vue=technique&onglet=calcul')).toBe(true);
    expect(estCheminLocal('/portail?onglet=dossiers')).toBe(true);
  });

  it('refuse les URLs externes et les protocoles relatifs (open redirect)', () => {
    expect(estCheminLocal('https://evil.example.com')).toBe(false);
    expect(estCheminLocal('javascript:alert(1)')).toBe(false);
    expect(estCheminLocal('//evil.example.com')).toBe(false);
    expect(estCheminLocal('/\\evil')).toBe(false);
    expect(estCheminLocal('http://interne.mg/technique')).toBe(false);
  });

  it('refuse vide/null/undefined', () => {
    expect(estCheminLocal('')).toBe(false);
    expect(estCheminLocal(null)).toBe(false);
    expect(estCheminLocal(undefined)).toBe(false);
  });
});

describe('ciblePostConnexion', () => {
  it('retourne la destination initiale si elle est locale', () => {
    expect(ciblePostConnexion('/?vue=technique')).toBe('/?vue=technique');
    expect(ciblePostConnexion('/portail')).toBe('/portail');
  });

  it('retourne null pour une destination externe (anti open-redirect)', () => {
    expect(ciblePostConnexion('//evil.example.com')).toBeNull();
    expect(ciblePostConnexion('https://evil.example.com')).toBeNull();
    expect(ciblePostConnexion(null)).toBeNull();
  });

  it('retourne null pour /login elle-même (pas de boucle de redirection)', () => {
    expect(ciblePostConnexion('/login')).toBeNull();
    expect(ciblePostConnexion('/login?callbackUrl=/x')).toBeNull();
  });
});
