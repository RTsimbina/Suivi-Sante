/**
 * session-revocation.ts — Révocation immédiate des sessions (P1).
 * ────────────────────────────────────────────────────────────────────────────
 * Les sessions NextAuth sont des JWT signés (maxAge 8 h) : un jeton émis
 * AVANT la désactivation d'un compte resterait sinon valide jusqu'à
 * expiration, même après coupure du flag `actif`.
 *
 * MÉCANISME (versionnement de session vérifié côté serveur) :
 *   - `Utilisateur.sessionVersion` est incrémentée à chaque désactivation
 *     ET réactivation (PATCH /api/utilisateurs, opération transactionnelle) ;
 *   - le JWT fige la version du compte AU MOMENT de la connexion (callback
 *     jwt de src/lib/auth.ts) ;
 *   - `verifierSessionUtilisateur` relit { actif, sessionVersion } en base
 *     et refuse tout jeton dont la version diffère → toutes les sessions
 *     ouvertes du compte sont révoquées IMMÉDIATEMENT, sans dépendre du
 *     navigateur (aucune suppression de cookie) ni d'un cache (aucun
 *     délai de propagation).
 *
 * POLITIQUE (fail-closed, message unique sans oracle) :
 *   - compte introuvable (supprimé)         → 401 ;
 *   - compte désactivé (actif = false)      → 401 ;
 *   - jeton sans sessionVersion (émis avant
 *     le déploiement du mécanisme)          → 401 ;
 *   - version du jeton ≠ version du compte  → 401 ;
 *   - base indisponible                     → 503 (jamais d'ouverture) ;
 *   - colonne sessionVersion absente (base
 *     non migrée, mode dégradé historique)  → le contrôle d'état `actif`
 *     reste appliqué seul (la migration
 *     20261030090000 est sinon automatique au build).
 *
 * La vérification est un point de CONTRÔLE CENTRALISÉ : intégrée dans
 * authorizeRequest (src/lib/authorize.ts) elle couvre toutes les routes
 * API qui appellent checkAuth ; les routes qui lisent le JWT elles-mêmes
 * (portails, assistant, profil) l'appellent après leur getToken.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** État du compte relu en base (version null = colonne absente, mode dégradé). */
export interface EtatCompte {
  actif: boolean;
  sessionVersion: number | null;
}

/** Accès minimal à Utilisateur sur un client Prisma (ou un mock de tests). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SessionRevocationDb {
  utilisateur: {
    findUnique(args: any): Promise<any>;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Portion du JWT utilisée pour la vérification (token NextAuth). */
export interface JetonSession {
  id?: string;
  sessionVersion?: number;
}

export interface ResultatVerificationSession {
  ok: boolean;
  statut: 401 | 503;
  erreur: string;
}

/** Message 401 UNIQUE (pas d'oracle entre « désactivé » / « supprimé » / « version périmée »). */
export const ERREUR_SESSION_INVALIDEE =
  'Session expirée ou invalidée. Veuillez vous reconnecter.';

/** Message 503 générique (indisponibilité de la vérification — jamais ouverte). */
const ERREUR_VERIFICATION_INDISPONIBLE =
  'Vérification de session momentanément indisponible. Réessayez.';

// ─── Prédicat pur (testé unitairement) ───────────────────────────────────────

/**
 * true si le jeton est RÉVOQUÉ au regard de l'état du compte relu en base.
 *
 * - compte null → révoqué (compte supprimé) ;
 * - compte inactif → révoqué (désactivation) ;
 * - jeton sans version → révoqué (jeton pré-déploiement : fail-closed,
 *   garantit qu'un ancien jeton ne redevient pas valide après réactivation) ;
 * - version du compte inconnue (mode dégradé : colonne non migrée) → la
 *   dimension temporelle n'est pas vérifiable, l'état `actif` (déjà testé
 *   ci-dessus) reste le seul critère — pas de blocage global ;
 * - sinon → révoqué si et seulement si les versions diffèrent.
 */
export function estSessionRevoquee(
  compte: EtatCompte | null,
  versionJeton: number | undefined,
): boolean {
  if (!compte) return true;
  if (!compte.actif) return true;
  if (versionJeton === undefined) return true;
  if (compte.sessionVersion === null) return false;
  return versionJeton !== compte.sessionVersion;
}

// ─── Vérification serveur (lecture en base, fail-closed) ────────────────────

/**
 * Vérifie côté serveur que le porteur du jeton correspond à un compte
 * EXISTANT, ACTIF et dont la version de session est celle figée dans le
 * jeton. À appeler sur chaque accès protégé (via authorizeRequest pour
 * les routes checkAuth, ou après getToken dans les routes qui lisent
 * elles-mêmes le JWT).
 */
export async function verifierSessionUtilisateur(
  db: SessionRevocationDb,
  jeton: JetonSession | null | undefined,
): Promise<ResultatVerificationSession> {
  if (!jeton || !jeton.id) {
    return { ok: false, statut: 401, erreur: ERREUR_SESSION_INVALIDEE };
  }

  const etat = await chargerEtatCompte(db, jeton.id);
  if (etat === 'INDISPONIBLE') {
    // Fail-closed : si l'état réel ne peut pas être établi, aucune
    // opération protégée n'est servie (pas de cache, pas de dérogation).
    return { ok: false, statut: 503, erreur: ERREUR_VERIFICATION_INDISPONIBLE };
  }

  if (estSessionRevoquee(etat, jeton.sessionVersion)) {
    return { ok: false, statut: 401, erreur: ERREUR_SESSION_INVALIDEE };
  }
  return { ok: true, statut: 200, erreur: '' };
}

/**
 * Relit { actif, sessionVersion } par clé primaire (requête ciblée).
 * Retourne 'INDISPONIBLE' en cas d'erreur de base (sauf colonne absente :
 * P2022 → mode dégradé, sessionVersion = null, `actif` reste contrôlé).
 */
async function chargerEtatCompte(
  db: SessionRevocationDb,
  userId: string,
): Promise<EtatCompte | null | 'INDISPONIBLE'> {
  try {
    const compte = await db.utilisateur.findUnique({
      where: { id: userId },
      select: { actif: true, sessionVersion: true },
    });
    if (!compte) return null;
    return {
      actif: compte.actif,
      sessionVersion: compte.sessionVersion ?? null,
    };
  } catch (error) {
    // Base non migrée (colonne sessionVersion absente) : Prisma lève P2022.
    // Mode dégradé documenté : l'état `actif` reste vérifié — la migration
    // 20261030090000_session_revocation est sinon appliquée automatiquement
    // au build (prisma migrate deploy).
    if ((error as { code?: string }).code === 'P2022') {
      try {
        const compte = await db.utilisateur.findUnique({
          where: { id: userId },
          select: { actif: true },
        });
        if (!compte) return null;
        return { actif: compte.actif, sessionVersion: null };
      } catch {
        return 'INDISPONIBLE';
      }
    }
    return 'INDISPONIBLE';
  }
}
