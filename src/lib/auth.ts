import { timingSafeEqual } from "crypto";
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import {
  evaluateLoginAttempt,
  recordFailedLogin,
  resetLoginCounters,
  normalizeEmail,
} from '@/lib/login-policy';

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

// ─── Rate limiting distribué (stockage partagé Redis/Postgres) ────────────
// Remplace l'ancien Map en mémoire du processus : en serverless, chaque
// instance avait son propre compteur et pouvait être contournée.
// Les compteurs sont partagés entre TOUTES les instances (opération atomique
// INCR + EXPIRE, voir src/lib/rate-limit.ts) et survivent aux redémarrages.
// La POLITIQUE de limitation (par compte, par IP, clé combinée
// login:<ip>:<email>, garde-fou global) et la construction des clés vivent
// dans src/lib/login-policy.ts : la clé utilisée correspond exactement à la
// politique de sécurité définie.


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

        const email = normalizeEmail(credentials.email);
        const ip = getClientIp((req as { headers?: unknown } | undefined)?.headers);

        // 1) Politique de rate limiting distribué — 3 niveaux indépendants :
        //      par compte (échecs) / par IP (toutes tentatives) / combinée
        //      login:<ip>:<email> (échecs), + garde-fou global optionnel.
        //    Compteurs partagés entre toutes les instances (atomiques) ; les
        //    compteurs d'échecs ne sont incrémentés que sur ÉCHEC (voir plus bas).
        const evaluation = await evaluateLoginAttempt(ip, email);
        if (!evaluation.allowed) {
          console.warn(
            `[AUTH] Tentative bloquée par la politique (${evaluation.reason}): ` +
              `${email} depuis ${ip} (${evaluation.count}, reset dans ${evaluation.resetSeconds}s)`,
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
          await recordFailedLogin(ip, email);
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          const attemptResult = await recordFailedAttempt(email);
          if (attemptResult.locked) {
            console.warn(`Compte ${email} verrouillé après ${MAX_ATTEMPTS} tentatives échouées`);
          }
          await recordFailedLogin(ip, email);
          return null;
        }

        // Réinitialiser les tentatives après succès
        await resetAttempts(email);
        // Réinitialiser aussi les compteurs d'échecs distribués : le compte
        // (niveau 1) ET le couple IP+compte (niveau 3). Le compteur par IP
        // (niveau 2, volume) est conservé : il mesure le trafic de la source
        // sur la fenêtre courante et s'expire de lui-même.
        await resetLoginCounters(ip, email);

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