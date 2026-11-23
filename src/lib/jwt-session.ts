/**
 * jwt-session.ts — Lecture du JWT de session ALIGNÉE sur l'écriture du cookie.
 * ────────────────────────────────────────────────────────────────────────────
 * src/lib/auth.ts FORCE le nom « __Secure-next-auth.session-token » dès que
 * NODE_ENV=production (option useSecureCookies) — indépendamment du protocole
 * de NEXTAUTH_URL (déploiement interne / recette en http inclus).
 *
 * getToken, lui, déduit le préfixe de NEXTAUTH_URL (https://… sinon Vercel) :
 * sur un serveur de production en http, il cherchait « next-auth.session-token »
 * et ne trouvait jamais le cookie « __Secure-… » → 401 sur TOUTES les routes
 * protégées (checkAuth, proxy, portails, profil…). Ce helper passe donc à
 * getToken le MÊME préfixe que celui de l'écriture.
 *
 * Module PUR (aucun import Node/Prisma) : importable depuis le middleware
 * Edge (src/proxy.ts) comme depuis les routes Node.
 */

import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/** Préfixe du cookie de session : « __Secure- » en production (cf. auth.ts). */
export const COOKIE_SESSION_SECURISE = process.env.NODE_ENV === 'production';

/** Token de session du cookie de la requête (null si absent/invalide). */
export async function lireTokenSession(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: COOKIE_SESSION_SECURISE,
  });
}
