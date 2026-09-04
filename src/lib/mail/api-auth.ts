/**
 * Service de messagerie centralisé — Module AUTHENTIFICATION API
 * ───────────────────────────────────────────────────────────────
 * 1re brique de l'architecture cible : authentifier les demandes d'envoi.
 *
 * Deux canaux d'authentification :
 *   - SESSION NextAuth  → gérée par le middleware (proxy.ts) + checkAuth()
 *   - CLÉ API MACHINE   → `Authorization: Bearer $MAIL_API_KEY` (ou CRON_SECRET
 *     pour les cron jobs Vercel) — pour les appels serveur-à-serveur sans session
 *
 * La comparaison du secret est constante en durée (double hachage SHA-256
 * comparé octet par octet) pour ne pas laisser fuir le secret par timing.
 * Utilise Web Crypto : compatible Edge (middleware) et Node (routes).
 */

/** Vérifie que l'en-tête `Authorization: Bearer <secret>` correspond à envVar. */
export async function enTeteEgalSecret(authHeader: string | null, nomEnvVar: string): Promise<boolean> {
  const secret = process.env[nomEnvVar];
  if (!secret || !authHeader) return false;
  return comparerConstantTime(authHeader, `Bearer ${secret}`);
}

/** Comparaison en durée constante de deux chaînes via leurs empreintes SHA-256. */
async function comparerConstantTime(a: string, b: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const [ha, hb] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(a)),
      crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const ua = new Uint8Array(ha);
    const ub = new Uint8Array(hb);
    let diff = ua.length ^ ub.length;
    for (let i = 0; i < Math.min(ua.length, ub.length); i++) {
      diff |= ua[i] ^ ub[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Authentification d'une requête machine sur l'API de messagerie :
 * accepte Bearer MAIL_API_KEY (intégrations) ou Bearer CRON_SECRET (Vercel Cron).
 */
export async function estAppelMachineAutorise(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  return (
    (await enTeteEgalSecret(authHeader, 'MAIL_API_KEY')) ||
    (await enTeteEgalSecret(authHeader, 'CRON_SECRET'))
  );
}
