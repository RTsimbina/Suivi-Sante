/**
 * Tests P1 « Révocation des sessions à la désactivation d'un utilisateur ».
 * ────────────────────────────────────────────────────────────────────────────
 * Couverture exigée :
 *   1. Connexion d'un utilisateur actif                    → session valide ;
 *   2. Refus de connexion d'un utilisateur désactivé       → null (authorize) ;
 *   3. Désactivation pendant une session active            → révoquée ;
 *   4. Utilisation d'une ancienne session après désactivation → 401 ;
 *   5. Utilisation d'un JWT non expiré après désactivation → 401 ;
 *   6. Tentative d'accès aux API protégées                 → 401 (authorizeRequest) ;
 *   7. Réactivation et nouvelle connexion                  → version N+2, OK ;
 *   8. Anciennes sessions invalides après réactivation     → 401.
 * + cas limites : compte supprimé, jeton pré-déploiement, erreur base
 *   (fail-closed 503), mode dégradé (colonne absente → actif seul).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estSessionRevoquee,
  verifierSessionUtilisateur,
  ERREUR_SESSION_INVALIDEE,
  type EtatCompte,
} from './session-revocation';

// ─── 1/2. Prédicat pur — les 8 scénarios exigés ─────────────────────────────

describe('estSessionRevoquee — scénarios P1', () => {
  it('1. connexion d\'un utilisateur actif (version courante) → session VALIDE', () => {
    const compte: EtatCompte = { actif: true, sessionVersion: 1 };
    expect(estSessionRevoquee(compte, 1)).toBe(false);
  });

  it('2/3. désactivation pendant une session active → révoquée immédiatement', () => {
    // L'admin désactive : actif=false, sessionVersion incrémentée (1 → 2).
    const compte: EtatCompte = { actif: false, sessionVersion: 2 };
    expect(estSessionRevoquee(compte, 1)).toBe(true);
    // Même un jeton qui porterait déjà la nouvelle version est refusé :
    // l'état administratif `actif` prime.
    expect(estSessionRevoquee(compte, 2)).toBe(true);
  });

  it('4/5. ancienne session / JWT non expiré après désactivation → révoquée', () => {
    // JWT toujours signé et non expiré, mais version périmée + compte inactif.
    const compte: EtatCompte = { actif: false, sessionVersion: 2 };
    expect(estSessionRevoquee(compte, 1)).toBe(true);
  });

  it('5bis. compte désactivé SANS incrément (écriture directe) → quand même révoqué', () => {
    const compte: EtatCompte = { actif: false, sessionVersion: 1 };
    expect(estSessionRevoquee(compte, 1)).toBe(true);
  });

  it('6. compte SUPPRIMÉ (relu null) → révoqué', () => {
    expect(estSessionRevoquee(null, 1)).toBe(true);
  });

  it('7/8. réactivation : ancien jeton (v1) NE redevient PAS valide (compte v3)', () => {
    // Cycle : création (v1) → désactivation (v2) → réactivation (v3).
    const compte: EtatCompte = { actif: true, sessionVersion: 3 };
    expect(estSessionRevoquee(compte, 1)).toBe(true); // ancienne session
    expect(estSessionRevoquee(compte, 2)).toBe(true); // jeton pré-désactivation
    expect(estSessionRevoquee(compte, 3)).toBe(false); // nouvelle connexion
  });

  it('jeton SANS sessionVersion (pré-déploiement) → révoqué (fail-closed)', () => {
    const compte: EtatCompte = { actif: true, sessionVersion: 1 };
    expect(estSessionRevoquee(compte, undefined)).toBe(true);
  });

  it('version du jeton « du futur » → révoqué (aucune tolérance)', () => {
    const compte: EtatCompte = { actif: true, sessionVersion: 1 };
    expect(estSessionRevoquee(compte, 2)).toBe(true);
  });

  it('mode dégradé (colonne absente, sessionVersion=null) : actif → valide', () => {
    const compte: EtatCompte = { actif: true, sessionVersion: null };
    expect(estSessionRevoquee(compte, 1)).toBe(false);
    expect(estSessionRevoquee(compte, undefined)).toBe(true); // jeton sans version : toujours refusé
  });
});

// ─── 2. Refus de connexion d'un utilisateur désactivé (authorize) ───────────

describe('authorize() — connexion', () => {
  // auth.ts est importé après les mocks (hoist).
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuse la connexion d\'un utilisateur désactivé (actif=false)', async () => {
    const dbMock = vi.hoisted(() => ({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: 'u1', email: 'desactive@exemple.com', nom: 'Désactivé', password: '$2a$12$x', role: 'ACCUEIL', actif: false, avatar: null },
      ]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      assure: { findFirst: vi.fn() },
      entrepriseContact: { findFirst: vi.fn() },
    }));
    vi.doMock('@/lib/db', () => ({ db: dbMock }));
    vi.doMock('bcryptjs', () => ({ compare: vi.fn().mockResolvedValue(true), hash: vi.fn() }));
    vi.doMock('@/lib/login-policy', () => ({
      evaluateLoginAttempt: vi.fn().mockResolvedValue({ allowed: true, reason: '', count: 0, resetSeconds: 0 }),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      resetLoginCounters: vi.fn().mockResolvedValue(undefined),
      normalizeEmail: (e: string) => e.trim().toLowerCase(),
    }));
    vi.doMock('@/lib/account-lockout', () => ({
      isLockedOut: vi.fn().mockResolvedValue({ locked: false, remainingMs: 0 }),
      recordFailedAttempt: vi.fn().mockResolvedValue({ locked: false }),
      resetAttempts: vi.fn().mockResolvedValue(undefined),
      MAX_ATTEMPTS: 5,
    }));
    vi.doMock('@/lib/liaison-externe', () => ({ resoudreLiaisonContactEntreprise: vi.fn() }));
    vi.doMock('@/lib/liaison-prestataire', () => ({
      resoudreLiaisonPrestataireAvecControle: vi.fn(),
    }));

    const { authOptions } = await import('./auth');
    const provider = authOptions.providers[0] as { authorize: (c: unknown) => Promise<unknown> };
    const resultat = await provider.authorize({
      email: 'desactive@exemple.com',
      password: 'motdepasse',
    });
    expect(resultat).toBeNull(); // refus AVANT même la vérification du mot de passe
  });

  it('autorise la connexion d\'un utilisateur actif et fige sa sessionVersion', async () => {
    const dbMock = vi.hoisted(() => ({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: 'u2', email: 'actif@exemple.com', nom: 'Actif', password: '$2a$12$x', role: 'ACCUEIL', actif: true, avatar: null, sessionVersion: 3 },
      ]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      assure: { findFirst: vi.fn() },
      entrepriseContact: { findFirst: vi.fn() },
    }));
    vi.doMock('@/lib/db', () => ({ db: dbMock }));
    vi.doMock('bcryptjs', () => ({ compare: vi.fn().mockResolvedValue(true), hash: vi.fn() }));
    vi.doMock('@/lib/login-policy', () => ({
      evaluateLoginAttempt: vi.fn().mockResolvedValue({ allowed: true, reason: '', count: 0, resetSeconds: 0 }),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      resetLoginCounters: vi.fn().mockResolvedValue(undefined),
      normalizeEmail: (e: string) => e.trim().toLowerCase(),
    }));
    vi.doMock('@/lib/account-lockout', () => ({
      isLockedOut: vi.fn().mockResolvedValue({ locked: false, remainingMs: 0 }),
      recordFailedAttempt: vi.fn().mockResolvedValue({ locked: false }),
      resetAttempts: vi.fn().mockResolvedValue(undefined),
      MAX_ATTEMPTS: 5,
    }));
    vi.doMock('@/lib/liaison-externe', () => ({ resoudreLiaisonContactEntreprise: vi.fn() }));
    vi.doMock('@/lib/liaison-prestataire', () => ({
      resoudreLiaisonPrestataireAvecControle: vi.fn(),
    }));

    const { authOptions } = await import('./auth');
    const provider = authOptions.providers[0] as { authorize: (c: unknown) => Promise<unknown> };
    const resultat = (await provider.authorize({
      email: 'actif@exemple.com',
      password: 'motdepasse',
    })) as { sessionVersion?: number } | null;
    expect(resultat).not.toBeNull();
    expect(resultat?.sessionVersion).toBe(3); // figée dans le JWT par le callback
  });
});

// ─── 3/5/6. verifierSessionUtilisateur — relecture serveur ──────────────────

function dbAvec(compte: Record<string, unknown> | null) {
  return {
    utilisateur: { findUnique: vi.fn().mockResolvedValue(compte) },
  };
}

describe('verifierSessionUtilisateur — relecture à chaque accès protégé', () => {
  it('jeton null ou sans id → 401', async () => {
    const db = dbAvec({ actif: true, sessionVersion: 1 });
    expect((await verifierSessionUtilisateur(db, null)).statut).toBe(401);
    expect((await verifierSessionUtilisateur(db, {})).statut).toBe(401);
  });

  it('utilisateur désactivé : JWT non expiré → 401 message unique (5)', async () => {
    const db = dbAvec({ actif: false, sessionVersion: 2 });
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(401);
    expect(r.erreur).toBe(ERREUR_SESSION_INVALIDEE);
  });

  it('utilisateur supprimé (null) → 401 message unique', async () => {
    const db = dbAvec(null);
    const r = await verifierSessionUtilisateur(db, { id: 'u-supprime', sessionVersion: 1 });
    expect(r.statut).toBe(401);
    expect(r.erreur).toBe(ERREUR_SESSION_INVALIDEE);
  });

  it('version périmée (désactivation → incrément) → 401 même si actif re-passé', async () => {
    const db = dbAvec({ actif: true, sessionVersion: 3 });
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    expect(r.statut).toBe(401);
  });

  it('session courante (version égale, actif) → OK', async () => {
    const db = dbAvec({ actif: true, sessionVersion: 2 });
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 2 });
    expect(r.ok).toBe(true);
  });

  it('erreur base (hors colonne absente) → 503 fail-closed', async () => {
    const db = {
      utilisateur: { findUnique: vi.fn().mockRejectedValue(new Error('connexion refusée')) },
    };
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(503);
    expect(r.erreur).not.toContain('connexion'); // pas de fuite d'erreur interne
  });

  it('colonne sessionVersion absente (P2022) → mode dégradé : actif seul', async () => {
    const db = {
      utilisateur: {
        findUnique: vi
          .fn()
          .mockRejectedValueOnce(Object.assign(new Error('colonne inconnue'), { code: 'P2022' }))
          .mockResolvedValueOnce({ actif: true }),
      },
    };
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    expect(r.ok).toBe(true);
    expect(db.utilisateur.findUnique).toHaveBeenCalledTimes(2);
  });

  it('P2022 + utilisateur désactivé → 401 (actif contrôle même en mode dégradé)', async () => {
    const db = {
      utilisateur: {
        findUnique: vi
          .fn()
          .mockRejectedValueOnce(Object.assign(new Error('colonne inconnue'), { code: 'P2022' }))
          .mockResolvedValueOnce({ actif: false }),
      },
    };
    const r = await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    expect(r.statut).toBe(401);
  });

  it('lecture ciblée : select uniquement { actif, sessionVersion } (pas de hash)', async () => {
    const db = dbAvec({ actif: true, sessionVersion: 1 });
    await verifierSessionUtilisateur(db, { id: 'u1', sessionVersion: 1 });
    const args = db.utilisateur.findUnique.mock.calls[0][0];
    expect(args.select).toEqual({ actif: true, sessionVersion: true });
  });
});

// ─── 6. authorizeRequest — accès API protégé avec JWT obsolète ──────────────

describe('authorizeRequest — porte de révocation centralisée', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function chargerAuthorizeRequest(opts: {
    jeton: Record<string, unknown> | null;
    compte: Record<string, unknown> | null;
  }) {
    const jwtMock = vi.hoisted(() => ({ getToken: vi.fn() }));
    const dbMock = vi.hoisted(() => ({
      db: {
        utilisateur: { findUnique: vi.fn() },
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
      },
    }));
    vi.doMock('next-auth/jwt', () => jwtMock);
    vi.doMock('@/lib/db', () => dbMock);
    jwtMock.getToken.mockResolvedValue(opts.jeton);
    dbMock.db.utilisateur.findUnique.mockResolvedValue(opts.compte);
    const { authorizeRequest } = await import('./authorize');
    return { authorizeRequest, jwtMock, dbMock };
  }

  function requete(pathname: string) {
    return {
      nextUrl: new URL(`http://localhost${pathname}`),
      method: 'GET',
    } as never;
  }

  it('utilisateur désactivé + JWT signé valide → 401 (aucune opération protégée)', async () => {
    const { authorizeRequest } = await chargerAuthorizeRequest({
      jeton: { id: 'u1', role: 'ADMINISTRATEUR', sessionVersion: 1 },
      compte: { actif: false, sessionVersion: 2 },
    });
    const r = await authorizeRequest(requete('/api/utilisateurs'));
    expect(r.authorized).toBe(false);
    expect(r.status).toBe(401);
  });

  it('ancienne session après réactivation (v1 vs v3) → 401', async () => {
    const { authorizeRequest } = await chargerAuthorizeRequest({
      jeton: { id: 'u1', role: 'ADMINISTRATEUR', sessionVersion: 1 },
      compte: { actif: true, sessionVersion: 3 },
    });
    const r = await authorizeRequest(requete('/api/utilisateurs'));
    expect(r.authorized).toBe(false);
    expect(r.status).toBe(401);
  });

  it('session courante → autorisée (fonctionnement normal préservé)', async () => {
    const { authorizeRequest } = await chargerAuthorizeRequest({
      jeton: { id: 'u1', role: 'ADMINISTRATEUR', sessionVersion: 3 },
      compte: { actif: true, sessionVersion: 3 },
    });
    const r = await authorizeRequest(requete('/api/utilisateurs'));
    expect(r.authorized).toBe(true);
  });
});
