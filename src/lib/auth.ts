import { timingSafeEqual } from "crypto";
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  getClientIp,
  intFromEnv,
} from '@/lib/rate-limit';

// ─── Protection anti brute-force (persistée en base de données) ───────────
// Remplace l'ancien Map local qui était vulnérable en environnement serverless :
// chaque instance isolée avait sa propre mémoire, permettant de contourner le lockout.
//
// ⚠️  Toutes les fonctions lockout utilisent $queryRaw / $executeRaw pour
//     ne PAS dépendre du schéma Prisma. Ainsi, si les colonnes failedAttempts
//     et lockoutUntil n'existent pas encore en DB (migration non appliquée),
//     le lockout est simplement désactivé au lieu de casser tout le login.

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ─── Rate limiting distribué (stockage partagé Redis) ─────────────────────
// Remplace l'ancien Map en mémoire du processus : en serverless, chaque
// instance avait son propre compteur et pouvait être contournée.
// Les compteurs sont désormais partagés entre TOUTES les instances via Redis
// (opération atomique INCR + EXPIRE, voir src/lib/rate-limit.ts) et survivent
// aux redémarrages d'instances. Sans Redis configuré, bascule automatique en
// mémoire locale (développement mono-instance).

// Tentatives ÉCHOUÉES par adresse e-mail : 5 / 15 minutes (cohérent avec le
// verrouillage par compte en base). Réinitialisé après une connexion réussie.
const LOGIN_EMAIL_LIMIT = intFromEnv('LOGIN_EMAIL_LIMIT', 5);
const LOGIN_EMAIL_WINDOW_SECONDS = intFromEnv('LOGIN_EMAIL_WINDOW_SECONDS', 15 * 60);
// Tentatives par adresse IP (tous comptes confondus) : bloque le brute-force
// distribué sur plusieurs comptes depuis une même source.
const LOGIN_IP_LIMIT = intFromEnv('LOGIN_IP_LIMIT', 30);
const LOGIN_IP_WINDOW_SECONDS = intFromEnv('LOGIN_IP_WINDOW_SECONDS', 15 * 60);


interface LockRow {
  lockoutuntil: Date | null;
  failedattempts: number;
}

async function isLockedOut(email: string): Promise<{ locked: boolean; remainingMs: number }> {
  try {
    const rows: LockRow[] = await db.$queryRaw`
      SELECT "lockoutUntil", "failedAttempts"
      FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.lockoutuntil) {
      return { locked: false, remainingMs: 0 };
    }
    const now = Date.now();
    if (now < row.lockoutuntil.getTime()) {
      return { locked: true, remainingMs: row.lockoutuntil.getTime() - now };
    }
    // Verrouillage expiré → réinitialiser
    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = 0, "lockoutUntil" = NULL
      WHERE "email" = ${email}
    `;
    return { locked: false, remainingMs: 0 };
  } catch {
    // Colonnes manquantes → pas de lockout
    return { locked: false, remainingMs: 0 };
  }
}

async function recordFailedAttempt(email: string): Promise<{ locked: boolean; remainingMs: number }> {
  try {
    const rows: LockRow[] = await db.$queryRaw`
      SELECT "lockoutUntil", "failedAttempts"
      FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { locked: false, remainingMs: 0 };

    const now = new Date();
    if (row.lockoutuntil && now < row.lockoutuntil) {
      return { locked: true, remainingMs: row.lockoutuntil.getTime() - now.getTime() };
    }

    const expired = row.lockoutuntil && now >= row.lockoutuntil;
    const newCount = expired ? 1 : (row.failedattempts || 0) + 1;

    if (newCount >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
      await db.$executeRaw`
        UPDATE "Utilisateur" SET "failedAttempts" = ${newCount}, "lockoutUntil" = ${lockedUntil}
        WHERE "email" = ${email}
      `;
      return { locked: true, remainingMs: LOCKOUT_DURATION_MS };
    }

    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = ${newCount}
      WHERE "email" = ${email}
    `;
    return { locked: false, remainingMs: 0 };
  } catch {
    return { locked: false, remainingMs: 0 };
  }
}

async function resetAttempts(email: string) {
  try {
    await db.$executeRaw`
      UPDATE "Utilisateur" SET "failedAttempts" = 0, "lockoutUntil" = NULL
      WHERE "email" = ${email}
    `;
  } catch {
    // Silencieux
  }
}

/**
 * Incrémente le compteur distribué des échecs par e-mail (Redis partagé).
 * Appelé uniquement sur échec d'authentification : au-delà de
 * LOGIN_EMAIL_LIMIT échecs en LOGIN_EMAIL_WINDOW_SECONDS, toute nouvelle
 * tentative sur ce compte est bloquée par la vérification (2) de authorize(),
 * indépendamment du verrouillage en base de données.
 */
async function recordFailedLoginAttempt(email: string): Promise<void> {
  const result = await checkRateLimit({
    key: `login:email:${email}`,
    limit: LOGIN_EMAIL_LIMIT,
    windowSeconds: LOGIN_EMAIL_WINDOW_SECONDS,
  });
  if (!result.allowed) {
    console.warn(
      `[AUTH] Compteur d'échecs email saturé: ${email} (${result.count}/${LOGIN_EMAIL_LIMIT})`,
    );
  }
}

// ─── Recherche utilisateur en SQL brut ────────────────────────────────────
// On sélectionne uniquement les colonnes d'origine (sans failedAttempts/
// lockoutUntil) pour que le login fonctionne même si la migration lockout
// n'a pas encore été appliquée sur la base de production.

interface UserRow {
  id: string;
  email: string;
  nom: string;
  password: string;
  role: string;
  actif: boolean;
  avatar: string | null;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows: UserRow[] = await db.$queryRaw`
    SELECT id, email, nom, password, role, actif, avatar
    FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function updateLastLogin(userId: string) {
  await db.$executeRaw`
    UPDATE "Utilisateur" SET "dernierLogin" = ${new Date()} WHERE id = ${userId}
  `.catch(() => {});
}

// ─── Configuration NextAuth ────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Identifiants',
      credentials: {
        email: { label: 'Adresse e-mail', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();
        const ip = getClientIp((req as { headers?: unknown } | undefined)?.headers);

        // 1) Rate limiting distribué par IP — compte TOUTES les tentatives.
        //    Compteur partagé entre toutes les instances (Redis, INCR+EXPIRE atomique).
        const ipLimit = await checkRateLimit({
          key: `login:ip:${ip}`,
          limit: LOGIN_IP_LIMIT,
          windowSeconds: LOGIN_IP_WINDOW_SECONDS,
        });
        if (!ipLimit.allowed) {
          console.warn(
            `[AUTH] Rate limit IP atteint: ${ip} (${ipLimit.count}/${LOGIN_IP_LIMIT}, reset dans ${ipLimit.resetSeconds}s)`,
          );
          return null;
        }

        // 2) Rate limiting distribué par e-mail — lecture seule ici (l'incrément
        //    n'a lieu que sur ÉCHEC, pour ne pas pénaliser les connexions légitimes).
        const emailStatus = await getRateLimitStatus(`login:email:${email}`);
        if (emailStatus.count >= LOGIN_EMAIL_LIMIT) {
          console.warn(
            `[AUTH] Rate limit email atteint: ${email} (${emailStatus.count}/${LOGIN_EMAIL_LIMIT}, reset dans ${emailStatus.resetSeconds}s)`,
          );
          return null;
        }

        // Vérifier le verrouillage (SQL brut, résilient)
        const lockStatus = await isLockedOut(email);
        if (lockStatus.locked) {
          console.warn(`Compte verrouillé: ${email} (reste ${Math.ceil(lockStatus.remainingMs / 60000)} min)`);
          return null;
        }

        // Chercher l'utilisateur (SQL brut, sans dépendre des colonnes lockout)
        const user = await findUserByEmail(email);

        if (!user || !user.actif) {
          await recordFailedLoginAttempt(email);
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          const attemptResult = await recordFailedAttempt(email);
          if (attemptResult.locked) {
            console.warn(`Compte ${email} verrouillé après ${MAX_ATTEMPTS} tentatives échouées`);
          }
          await recordFailedLoginAttempt(email);
          return null;
        }

        // Réinitialiser les tentatives après succès
        await resetAttempts(email);
        // Réinitialiser aussi le compteur Redis des échecs par e-mail
        // (le compteur par IP est conservé : il ne compte que la fenêtre courante).
        await resetRateLimit(`login:email:${email}`);

        // Récupérer les identifiants de portail pour les rôles externes
        let assureId: string | undefined;
        let societeId: string | undefined;

        if (user.role === 'PORTAIL_CLIENT') {
          // Rechercher l'assuré correspondant à cet e-mail
          const assure = await db.assure.findFirst({
            where: { email: { equals: user.email, mode: 'insensitive' } },
            select: { id: true, societeId: true },
          });
          if (assure) {
            assureId = assure.id;
            societeId = assure.societeId ?? undefined;
          }
        } else if (user.role === 'CONTACT_ENTREPRISE') {
          // Rechercher le contact d'entreprise correspondant à cet e-mail
          const contact = await db.entrepriseContact.findFirst({
            where: { email: { equals: user.email, mode: 'insensitive' } },
            select: { societeId: true },
          });
          if (contact) {
            societeId = contact.societeId ?? undefined;
          }
        }

        // Mettre à jour la dernière connexion
        await updateLastLogin(user.id);

        return {
          id: user.id,
          email: user.email,
          nom: user.nom,
          role: user.role,
          avatar: user.avatar,
          assureId,
          societeId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || 'ADMINISTRATEUR';
        token.nom = (user as any).nom || (user as any).name || '';
        token.email = user.email || '';
        // Stocker les identifiants de portail pour les rôles externes
        const userAny = user as any;
        if (userAny.assureId) token.assureId = userAny.assureId;
        if (userAny.societeId) token.societeId = userAny.societeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.nom = token.nom as string;
        session.user.email = token.email as string;
        // Exposer les identifiants de portail pour les rôles externes
        if (token.assureId) (session.user as any).assureId = token.assureId;
        if (token.societeId) (session.user as any).societeId = token.societeId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 heures
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      // ⚠️ httpOnly:false est OBLIGATOIRE — NextAuth lit ce cookie côté client
      //    pour l'inclure dans le corps du formulaire de login (protection CSRF).
      name: `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}next-auth.csrf-token`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,

  events: {
    signIn: ({ user }) => {
      console.log(`[AUTH] Connexion réussie: ${user.email} (${(user as unknown as { role: string }).role})`);
    },
  },
};

export { isLockedOut, MAX_ATTEMPTS };

// ─── Timing-safe string comparison ──────────────────────────────────
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      nom: string;
      role: string;
      avatar?: string | null;
      assureId?: string;
      societeId?: string;
    };
  }

  interface User {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
    assureId?: string;
    societeId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
    assureId?: string;
    societeId?: string;
  }
}