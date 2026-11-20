import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit, resetRateLimit, intFromEnv } from '@/lib/rate-limit';
import { verifierJetonSetup, cleRateLimitSetup } from '@/lib/setup-token';
import { executerInstallation } from '@/lib/seed/installation';

// Ce endpoint initialise la base de données PostgreSQL (données de démo).
// ARC-01 : le DDL runtime (CREATE_TABLES_SQL, FOREIGN_KEYS_SQL, ALTER TABLE)
// a été SUPPRIMÉ — le schéma a une source unique, les migrations Prisma
// (`prisma migrate deploy`). La route ne fait plus que :
//   1. vérifier la garde d'accès (jeton timing-safe + rate limit par IP) ;
//   2. exécuter le seed idempotent de src/lib/seed/installation.ts.
//
// P0 « Sécuriser le jeton d'installation » :
//   - POST uniquement, jeton transmis dans l'en-tête
//     `Authorization: Bearer <SETUP_TOKEN>` — il ne transite JAMAIS dans
//     l'URL (logs serveur, proxys, historique navigateur, télémétrie) ;
//   - l'ancien GET /api/setup?token=… est remplacé par un stub 405 qui ne
//     traite AUCUN jeton : aucun contournement par l'ancienne voie ;
//   - comparaison timing-safe avec contrôle préalable des longueurs
//     (aucune RangeError, aucun oracle de longueur) — voir src/lib/setup-token.ts ;
//   - limitation de débit distribuée par IP (anti brute-force et
//     anti-réexécution abusive) : SETUP_RATE_LIMIT tentatives par
//     SETUP_RATE_WINDOW secondes (défauts : 5 / 900 s).
//
// Appel légitime :
//   prisma migrate deploy   # schéma — AVANT tout appel
//   curl -X POST https://<hôte>/api/setup \
//        -H "Authorization: Bearer $SETUP_TOKEN"   # données de démo
export async function POST(request: Request) {
  // 1) Anti brute-force / anti-réexécution abusive : fenêtre distribuée par
  //    IP (Redis → Postgres → mémoire selon backend disponible). Chaque
  //    requête compte, valide ou non : l'installation est une opération
  //    exceptionnelle, pas une API de service courant.
  const ip = getClientIp(request.headers);
  const cleDebit = cleRateLimitSetup(ip);
  const limiteDebit = await checkRateLimit({
    key: cleDebit,
    limit: intFromEnv('SETUP_RATE_LIMIT', 5),
    windowSeconds: intFromEnv('SETUP_RATE_WINDOW', 900),
  });
  if (!limiteDebit.allowed) {
    console.warn(
      `[SETUP] Débit dépassé depuis ${ip} : ${limiteDebit.count}/${limiteDebit.limit} ` +
        `(réinitialisation dans ${limiteDebit.resetSeconds}s)`,
    );
    return NextResponse.json(
      { erreur: `Trop de tentatives — réessayez dans ${limiteDebit.resetSeconds} secondes.` },
      { status: 429, headers: { 'Retry-After': String(limiteDebit.resetSeconds) } },
    );
  }

  // 2) Vérification du jeton (aucune exception possible, aucun oracle) :
  //    503 config manquante / 403 refus générique / 200 autorisé.
  const verification = verifierJetonSetup(
    request.headers.get('authorization'),
    process.env.SETUP_TOKEN,
  );
  if (!verification.ok) {
    // Journalisation SANS contenu de jeton : IP + catégorie de refus.
    console.warn(`[SETUP] Tentative refusée depuis ${ip} (${verification.motif ?? 'INCONNU'})`);
    return NextResponse.json({ erreur: verification.erreur }, { status: verification.statut });
  }

  // Succès : on rend la fenêtre de débit à l'opérateur légitime (miroir du
  // comportement du login) — les réexécutions du seed restent protégées par
  // le jeton et l'idempotence du setup.
  await resetRateLimit(cleDebit);

  // 3) Seed de démonstration (aucune modification structurelle : voir
  //    src/lib/seed/installation.ts — le schéma appartient aux migrations).
  const resultat = await executerInstallation();
  return NextResponse.json(resultat, { status: resultat.success ? 200 : 500 });
}

// L'ancien GET /api/setup?token=… est SUPPRIMÉ : toute requête GET reçoit un
// 405 sans AUCUN traitement de jeton — l'ancienne voie ne permet plus aucun
// contournement et le jeton ne peut plus fuir par une URL.
export async function GET() {
  return NextResponse.json(
    {
      erreur:
        "Méthode non autorisée. Utiliser POST avec l'en-tête Authorization: Bearer <SETUP_TOKEN>.",
    },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
