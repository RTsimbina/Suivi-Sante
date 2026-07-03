import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import type { RoleType } from './auth-context';

// ─── Définition des permissions par rôle ────────────────────────────────────

/**
 * Définit quel rôle peut accéder à quelle ressource API.
 * Chaque clé est un préfixe de route API.
 * La valeur est un objet avec :
 *   - roles: liste des rôles autorisés
 *   - methods: (optionnel) méthodes HTTP restrictives { method: [roles] }
 */
export const API_PERMISSIONS: Record<
  string,
  {
    roles: RoleType[];
    methods?: Partial<Record<string, RoleType[]>>;
  }
> = {
  '/api/dossiers': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL'],         // Créer un dossier
      PUT: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
      DELETE: ['ADMINISTRATEUR'],
      PATCH: ['ADMINISTRATEUR', 'TECHNIQUE', 'COMPTABILITE'], // Changer statut
    },
  },
  '/api/kpis': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
  },
  '/api/ia': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/chat': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'],
  },
  '/api/import': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL'],
  },
  '/api/technique/import-isa': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
  },
  '/api/contrats': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/appels-fonds': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'COMPTABILITE'],
      PUT: ['ADMINISTRATEUR', 'COMPTABILITE'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/portail': {
    roles: ['ADMINISTRATEUR', 'UTILISATEUR'],
  },
  '/api/upload': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
  },
  '/api/utilisateurs': {
    roles: ['ADMINISTRATEUR'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/reporting': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
  },
  '/api/technique/societes': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/technique/baremes': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'ACCUEIL', 'COMPTABILITE', 'UTILISATEUR'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/assures': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/prestataires': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/bot-messages': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/email-mensuel': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL'],
    methods: {
      DELETE: ['ADMINISTRATEUR'],
    },
  },
};

// ─── Fonctions d'autorisation ────────────────────────────────────────────────

interface AuthResult {
  authorized: boolean;
  token: ReturnType<typeof getToken> | null;
  error: string;
  status: number;
}

/**
 * Vérifie l'authentification et l'autorisation pour une requête API.
 * Retourne { authorized: false } avec le bon message d'erreur et statut HTTP.
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

  // 2. Trouver la permission correspondante au chemin
  const matchedPrefix = Object.keys(API_PERMISSIONS).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!matchedPrefix) {
    // Route non définie dans les permissions → accès refusé par défaut
    return {
      authorized: false,
      token,
      error: 'Route API non reconnue.',
      status: 403,
    };
  }

  const permission = API_PERMISSIONS[matchedPrefix];
  const method = request.method.toUpperCase();

  // 3. Vérifier les permissions par méthode (si défini)
  if (permission.methods && permission.methods[method]) {
    const allowedRoles = permission.methods[method];
    if (!allowedRoles.includes(userRole)) {
      return {
        authorized: false,
        token,
        error: `Accès refusé. Le rôle '${userRole}' ne peut pas effectuer l'action ${method} sur cette ressource.`,
        status: 403,
      };
    }
  } else {
    // 4. Sinon vérifier les rôles généraux
    if (!permission.roles.includes(userRole)) {
      return {
        authorized: false,
        token,
        error: `Accès refusé. Le rôle '${userRole}' n'est pas autorisé à accéder à cette ressource.`,
        status: 403,
      };
    }
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