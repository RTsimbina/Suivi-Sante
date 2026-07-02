import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Routes publiques qui ne nécessitent pas d'authentification
const PUBLIC_PATHS = ['/login'];
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/kpis',
  '/api/ia',
  '/api/chat',
  '/api/dossiers',
  '/api/import',
  '/api/contrats',
  '/api/appels-fonds',
  '/api/portail',
  '/api/upload',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Autoriser les routes publiques
  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    // Si l'utilisateur est déjà connecté, rediriger vers l'accueil
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Autoriser les API publiques
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Autoriser les assets statiques et les fichiers Next.js internes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // fichiers statiques (images, css, etc.)
  ) {
    return NextResponse.next();
  }

  // Vérifier le token JWT
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes handled above
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|logo.svg).*)',
  ],
};