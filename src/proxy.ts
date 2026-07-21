import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { API_PERMISSIONS } from '@/lib/authorize';
import type { RoleType } from '@/lib/auth-context';

// ─── Routes publiquement accessibles (pas de token requis) ─────────────────

/** Pages accessibles sans authentification */
const PUBLIC_PAGES = ['/login', '/reset-password'];

/** Préfixes d'API qui sont toujours publics (auth, webhooks, infra) */
const PUBLIC_API_PREFIXES = [
  '/api/auth/',           // NextAuth login/logout/callback
  '/api/webhook/',        // WhatsApp, Telegram, Messenger
  '/api/bot-status',      // Statut des bots
  '/api/setup',           // Initialisation DB
  '/api/health',          // Health check
  '/api/session/lockout', // Vérification verrouillage
  '/api/auth/check-lockout', // Vérification verrouillage (legacy)
];

// ─── Middleware principal ───────────────────────────────────────────────────

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Autoriser les assets statiques et fichiers Next.js internes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // ─── En-têtes de sécurité (appliqués à TOUTES les réponses) ──────────────
  const securityHeaders = new Headers();
  securityHeaders.set('X-Frame-Options', 'DENY');
  securityHeaders.set('X-Content-Type-Options', 'nosniff');
  securityHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  securityHeaders.set('X-XSS-Protection', '1; mode=block');
  securityHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  securityHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // CSP restrictive : autorise uniquement les sources nécessaires
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-inline/eval requis par Next.js runtime
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  securityHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    headers: securityHeaders,
  });

  // 2. Autoriser les pages publiques
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // Si déjà connecté et sur /login, rediriger vers l'accueil
    if (pathname === '/login') {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (token) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return response;
  }

  // 3. Autoriser les API publiques (auth, webhooks, etc.)
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return response;
  }

  // ─── À partir d'ici, tout nécessite une authentification ────────────────

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 4. Pas de token → 401 pour API, redirect pour pages
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { erreur: 'Non authentifié. Veuillez vous reconnecter.' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const loginResponse = NextResponse.redirect(loginUrl);
    // Propager les security headers sur la redirect aussi
    for (const [k, v] of securityHeaders.entries()) {
      loginResponse.headers.set(k, v);
    }
    return loginResponse;
  }

  const userRole = (token.role as string) || '';
  const userId = (token.id as string) || '';
  const userEmail = (token.email as string) || '';
  const userNom = (token.nom as string) || '';

  // 5. Vérification automatique des permissions API
  if (pathname.startsWith('/api/')) {
    const permResult = checkApiPermission(pathname, request.method, userRole as RoleType);
    if (!permResult.allowed) {
      return Response.json(
        { erreur: permResult.error },
        { status: permResult.status }
      );
    }

    // Injecter les infos utilisateur dans les headers pour les routes API
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-role', userRole);
    requestHeaders.set('x-user-email', userEmail);
    requestHeaders.set('x-user-nom', userNom);

    const apiResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    for (const [k, v] of securityHeaders.entries()) {
      apiResponse.headers.set(k, v);
    }
    return apiResponse;
  }

  // 6. Pages protégées : le token existe, on laisse passer
  //    (le filtrage par rôle est géré côté client dans la navigation)
  return response;
}

// ─── Logique de correspondance des permissions ─────────────────────────────

interface PermissionCheckResult {
  allowed: boolean;
  error: string;
  status: number;
}

/**
 * Vérifie si le rôle utilisateur est autorisé à accéder à cette route API
 * avec cette méthode HTTP.
 *
 * Utilise le PLUS LONG préfixe correspondant dans API_PERMISSIONS
 * pour gérer correctement les sous-routes (ex: /api/assures/import
 * doit matcher /api/assures/import et non /api/assures).
 *
 * ⚠️  DÉFAUT D'ACCÈS (default-deny) : toute route API non déclarée
 *     dans API_PERMISSIONS est automatiquement refusée (403).
 */
function checkApiPermission(
  pathname: string,
  method: string,
  userRole: RoleType
): PermissionCheckResult {
  // Trouver le préfixe le plus long qui correspond
  let matchedPrefix = '';
  const prefixes = Object.keys(API_PERMISSIONS);

  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix) && prefix.length > matchedPrefix.length) {
      matchedPrefix = prefix;
    }
  }

  // Route non définie dans les permissions → accès refusé par défaut
  if (!matchedPrefix) {
    return {
      allowed: false,
      error: `Route API non reconnue. Ajoutez cette route dans API_PERMISSIONS si nécessaire.`,
      status: 403,
    };
  }

  const permission = API_PERMISSIONS[matchedPrefix];
  const upperMethod = method.toUpperCase();

  // Vérifier les permissions par méthode (restrictives)
  if (permission.methods && permission.methods[upperMethod]) {
    const allowedRoles = permission.methods[upperMethod];
    if (!allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        error: `Accès refusé. Le rôle '${userRole}' ne peut pas effectuer l'action ${upperMethod} sur cette ressource.`,
        status: 403,
      };
    }
    return { allowed: true, error: '', status: 200 };
  }

  // Sinon vérifier les rôles généraux
  if (!permission.roles.includes(userRole)) {
    return {
      allowed: false,
      error: `Accès refusé. Le rôle '${userRole}' n'est pas autorisé à accéder à cette ressource.`,
      status: 403,
    };
  }

  return { allowed: true, error: '', status: 200 };
}

// ─── Configuration du matcher ──────────────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|logo.svg).*)',
  ],
};