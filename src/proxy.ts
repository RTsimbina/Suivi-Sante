import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Seules ces routes sont véritablement publiques (pas besoin de token)
const PUBLIC_PATHS = ['/login'];
const AUTH_API_PATHS = ['/api/auth/'];
const WEBHOOK_API_PATHS = ['/api/webhook/', '/api/bot-status', '/api/setup', '/api/health']; // WhatsApp, Telegram, Messenger, bot-status, setup

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Autoriser les routes publiques (page de login)
  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Autoriser les routes NextAuth (connexion/déconnexion)
  if (AUTH_API_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 2b. Autoriser les webhooks externes (WhatsApp, Telegram, Messenger)
  if (WEBHOOK_API_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 3. Autoriser les assets statiques et fichiers Next.js internes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 4. Pour TOUTES les autres routes (pages ET API), vérifier le token JWT
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // Si c'est une route API, renvoyer 401 JSON au lieu de rediriger
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { erreur: 'Non authentifié. Veuillez vous reconnecter.' },
        { status: 401 }
      );
    }
    // Sinon rediriger vers la page de login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Ajouter les infos utilisateur dans les headers pour les routes API
  if (pathname.startsWith('/api/')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', token.id as string);
    requestHeaders.set('x-user-role', token.role as string);
    requestHeaders.set('x-user-email', token.email as string);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|logo.svg).*)',
  ],
};