import { describe, it, expect } from 'vitest';
import { API_PERMISSIONS, matchPermission } from '@/lib/authorize';
import type { RoleType } from '@/lib/auth-context';

// ─── Vérification des permissions via la FONCTION PARTAGÉE réelle ──────────
// matchPermission est désormais la source unique utilisée par authorizeRequest
// (routes API) ET le middleware proxy.ts. Le test vérifie l'implémentation réelle.

function checkPermission(
  pathname: string,
  method: string,
  userRole: RoleType
): { allowed: boolean; reason: string } {
  const result = matchPermission(pathname, method, userRole);
  return { allowed: result.allowed, reason: result.allowed ? '' : result.error };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('API_PERMISSIONS — default-deny', () => {
  it('refuse une route non déclarée (default-deny)', () => {
    const result = checkPermission('/api/non-existante', 'GET', 'ADMINISTRATEUR');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('non reconnue');
  });

  it('refuse un rôle inconnu même sur une route déclarée', () => {
    const result = checkPermission('/api/utilisateurs', 'GET', 'ROLE_INCONNU' as RoleType);
    expect(result.allowed).toBe(false);
  });
});

describe('API_PERMISSIONS — /api/contrats', () => {
  it('ADMINISTRATEUR peut tout faire sur les contrats', () => {
    expect(checkPermission('/api/contrats', 'GET', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/contrats', 'POST', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/contrats', 'PUT', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/contrats', 'DELETE', 'ADMINISTRATEUR').allowed).toBe(true);
  });

  it('COMPTABILITE peut lire mais pas créer/supprimer', () => {
    expect(checkPermission('/api/contrats', 'GET', 'COMPTABILITE').allowed).toBe(true);
    expect(checkPermission('/api/contrats', 'POST', 'COMPTABILITE').allowed).toBe(false);
    expect(checkPermission('/api/contrats', 'DELETE', 'COMPTABILITE').allowed).toBe(false);
  });

  it('ACCUEIL ne peut pas accéder aux contrats', () => {
    expect(checkPermission('/api/contrats', 'GET', 'ACCUEIL').allowed).toBe(false);
  });

  it('SANTE a accès en lecture seule aux contrats (pas POST/PUT/DELETE)', () => {
    expect(checkPermission('/api/contrats', 'GET', 'SANTE').allowed).toBe(true);
    expect(checkPermission('/api/contrats', 'POST', 'SANTE').allowed).toBe(false);
    expect(checkPermission('/api/contrats', 'PUT', 'SANTE').allowed).toBe(false);
    expect(checkPermission('/api/contrats', 'DELETE', 'SANTE').allowed).toBe(false);
  });
});

describe('API_PERMISSIONS — /api/dossiers', () => {
  it('tous les rôles opérationnels peuvent lire les dossiers', () => {
    for (const role of ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] as RoleType[]) {
      expect(checkPermission('/api/dossiers', 'GET', role).allowed).toBe(true);
    }
  });

  it('seul ADMINISTRATEUR peut supprimer un dossier', () => {
    expect(checkPermission('/api/dossiers', 'DELETE', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/dossiers', 'DELETE', 'ACCUEIL').allowed).toBe(false);
    expect(checkPermission('/api/dossiers', 'DELETE', 'TECHNIQUE').allowed).toBe(false);
  });

  it('SANTE ne peut pas créer de dossier', () => {
    expect(checkPermission('/api/dossiers', 'POST', 'SANTE').allowed).toBe(false);
  });
});

describe('API_PERMISSIONS — /api/utilisateurs (admin only)', () => {
  it('seul ADMINISTRATEUR peut gérer les utilisateurs', () => {
    expect(checkPermission('/api/utilisateurs', 'GET', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/utilisateurs', 'GET', 'COMPTABILITE').allowed).toBe(false);
    expect(checkPermission('/api/utilisateurs', 'GET', 'ACCUEIL').allowed).toBe(false);
  });
});

describe('API_PERMISSIONS — longest-prefix matching', () => {
  it('match /api/assures/import avant /api/assures', () => {
    // /api/assures/import a des permissions plus restrictives que /api/assures
    const importPerm = checkPermission('/api/assures/import', 'POST', 'ACCUEIL');
    const assuresPerm = checkPermission('/api/assures', 'POST', 'ACCUEIL');

    // ACCUEIL n'est pas dans les roles de /api/assures/import POST
    expect(importPerm.allowed).toBe(false);
    // ACCUEIL n'est pas dans les roles de /api/assures POST non plus (seul TECHNIQUE)
    expect(assuresPerm.allowed).toBe(false);
  });

  it('/api/contrats/id est couvert par /api/contrats', () => {
    expect(checkPermission('/api/contrats/clabc123', 'GET', 'COMPTABILITE').allowed).toBe(true);
    expect(checkPermission('/api/contrats/clabc123', 'POST', 'COMPTABILITE').allowed).toBe(false);
  });

  it('/api/sante/verifier-assure est accessible à SANTE', () => {
    expect(checkPermission('/api/sante/verifier-assure', 'POST', 'SANTE').allowed).toBe(true);
  });
});

describe('API_PERMISSIONS — /api/reporting (restreint)', () => {
  it('seuls ADMINISTRATEUR et COMPTABILITE accèdent au reporting', () => {
    expect(checkPermission('/api/reporting/rapport', 'GET', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/reporting/rapport', 'GET', 'COMPTABILITE').allowed).toBe(true);
    expect(checkPermission('/api/reporting/rapport', 'GET', 'ACCUEIL').allowed).toBe(false);
    expect(checkPermission('/api/reporting/rapport', 'GET', 'SANTE').allowed).toBe(false);
  });
});

describe('API_PERMISSIONS — /api/appels-fonds', () => {
  it('ADMINISTRATEUR et COMPTABILITE peuvent créer des appels', () => {
    expect(checkPermission('/api/appels-fonds', 'POST', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/appels-fonds', 'POST', 'COMPTABILITE').allowed).toBe(true);
    expect(checkPermission('/api/appels-fonds', 'POST', 'ACCUEIL').allowed).toBe(false);
  });

  it('seul ADMINISTRATEUR peut supprimer un appel de fonds', () => {
    expect(checkPermission('/api/appels-fonds', 'DELETE', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(checkPermission('/api/appels-fonds', 'DELETE', 'COMPTABILITE').allowed).toBe(false);
  });
});