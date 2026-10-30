import { getToken, type JWT } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { db } from './db';
import { verifierSessionUtilisateur } from './session-revocation';

// ─── Permissions API (module pur, partagé avec le middleware Edge) ──────────
// P1 « Révocation des sessions » : API_PERMISSIONS et matchPermission vivent
// dans src/lib/api-permissions.ts (SANS dépendance Node) — le middleware
// Edge (src/proxy.ts) les importe directement : un module évalué en Edge ne
// peut pas tirer Prisma (src/lib/db). Ce fichier garde le re-export pour la
// compatibilité des imports existants (routes API + tests).
export { API_PERMISSIONS, matchPermission, type PermissionCheckResult } from './api-permissions';
import { matchPermission } from './api-permissions';
import type { RoleType } from './auth-context';

// ─── Fonctions d'autorisation ────────────────────────────────────────────────

interface AuthResult {
  authorized: boolean;
  token: JWT | null;
  error: string;
  status: number;
}

/**
 * Vérifie l'authentification et l'autorisation pour une requête API.
 * Retourne { authorized: false } avec le bon message d'erreur et statut HTTP.
 *
 * P1 « Révocation des sessions » — 3 vérifications INDÉPENDANTES :
 *   1. Signature du JWT (getToken) ;
 *   2. Permissions : rôle du jeton × route × méthode (matchPermission) ;
 *   3. ÉTAT RÉEL DU COMPTE relu en base (verifierSessionUtilisateur) :
 *      un compte supprimé ou désactivé — ou dont la version de session a
 *      été incrémentée (désactivation/réactivation) — est REFUSÉ même si
 *      son jeton reste signé et non expiré. Point centralisé : s'applique
 *      à TOUTES les routes qui appellent checkAuth/authorizeRequest.
 */
export async function authorizeRequest(
  request: NextRequest
): Promise<AuthResult> {
  const { pathname } = request.nextUrl;

  // 1. Vérifier le token JWT
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return {
      authorized: false,
      token: null,
      error: 'Non authentifié. Veuillez vous reconnecter.',
      status: 401,
    };
  }

  const userRole = token.role as RoleType;

  if (!userRole) {
    return {
      authorized: false,
      token,
      error: 'Rôle utilisateur non trouvé.',
      status: 403,
    };
  }

  // 2. Vérifier les permissions via la fonction partagée avec le middleware
  const perm = matchPermission(pathname, request.method, userRole);
  if (!perm.allowed) {
    return {
      authorized: false,
      token,
      error: perm.error,
      status: perm.status,
    };
  }

  // 3. État réel du compte (P1) : existant + actif + version de session
  //    courante. Le message 401 est unique (pas d'oracle) ; indisponibilité
  //    de la base → 503 fail-closed (jamais d'ouverture par défaut).
  const session = await verifierSessionUtilisateur(
    db,
    token as unknown as { id?: string; sessionVersion?: number },
  );
  if (!session.ok) {
    return {
      authorized: false,
      token,
      error: session.erreur,
      status: session.statut,
    };
  }

  return {
    authorized: true,
    token,
    error: '',
    status: 200,
  };
}

/**
 * Wrapper à utiliser dans les API routes : renvoie une Response d'erreur
 * ou null si l'autorisation est accordée.
 */
export async function checkAuth(
  request: NextRequest
): Promise<Response | null> {
  const result = await authorizeRequest(request);
  if (!result.authorized) {
    return Response.json(
      { erreur: result.error },
      { status: result.status }
    );
  }
  return null;
}
