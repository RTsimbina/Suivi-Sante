import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';

// ─── Protection anti brute-force (persistée en base de données) ───────────
// Remplace l'ancien Map local qui était vulnérable en environnement serverless :
// chaque instance isolée avait sa propre mémoire, permettant de contourner le lockout.

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;   // 10 minutes

/**
 * Vérifie si un email est verrouillé (lecture DB).
 * Réinitialise les tentatives expirées pour éviter l'accumulation.
 */
async function isLockedOut(email: string): Promise<{ locked: boolean; remainingMs: number }> {
  const user = await db.utilisateur.findUnique({
    where: { email },
    select: { failedAttempts: true, lockoutUntil: true },
  });

  if (!user || !user.lockoutUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const now = Date.now();
  if (now < user.lockoutUntil.getTime()) {
    return { locked: true, remainingMs: user.lockoutUntil.getTime() - now };
  }

  // Le verrouillage a expiré — réinitialiser les compteurs
  await db.utilisateur.update({
    where: { email },
    data: { failedAttempts: 0, lockoutUntil: null },
  });

  return { locked: false, remainingMs: 0 };
}

/**
 * Enregistre une tentative échouée et verrouille si le seuil est atteint.
 */
async function recordFailedAttempt(email: string): Promise<{ locked: boolean; remainingMs: number }> {
  const user = await db.utilisateur.findUnique({
    where: { email },
    select: { failedAttempts: true, lockoutUntil: true },
  });

  const now = new Date();

  // Si l'utilisateur n'existe pas, on ne crée rien (pas d'énumération)
  if (!user) {
    return { locked: false, remainingMs: 0 };
  }

  // Si un lockout est déjà actif, le renvoyer tel quel
  if (user.lockoutUntil && now < user.lockoutUntil) {
    return { locked: true, remainingMs: user.lockoutUntil.getTime() - now.getTime() };
  }

  // Réinitialiser la fenêtre si le lockout a expiré ou si c'est le début
  const lockoutExpired = user.lockoutUntil && now >= user.lockoutUntil;
  const newCount = lockoutExpired ? 1 : user.failedAttempts + 1;

  if (newCount >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    await db.utilisateur.update({
      where: { email },
      data: { failedAttempts: newCount, lockoutUntil: lockedUntil },
    });
    return { locked: true, remainingMs: LOCKOUT_DURATION_MS };
  }

  await db.utilisateur.update({
    where: { email },
    data: { failedAttempts: newCount },
  });

  return { locked: false, remainingMs: 0 };
}

/**
 * Réinitialise les tentatives après une connexion réussie.
 */
async function resetAttempts(email: string) {
  await db.utilisateur.update({
    where: { email },
    data: { failedAttempts: 0, lockoutUntil: null },
  }).catch(() => {
    // Silencieux : l'utilisateur a pu être supprimé entretemps
  });
}

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();

        // Vérifier le verrouillage (DB)
        const lockStatus = await isLockedOut(email);
        if (lockStatus.locked) {
          console.warn(`Compte verrouillé: ${email} (reste ${Math.ceil(lockStatus.remainingMs / 60000)} min)`);
          return null;
        }

        const user = await db.utilisateur.findUnique({
          where: { email },
        });

        if (!user || !user.actif) {
          await recordFailedAttempt(email);
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          const attemptResult = await recordFailedAttempt(email);
          if (attemptResult.locked) {
            console.warn(`Compte ${email} verrouillé après ${MAX_ATTEMPTS} tentatives échouées`);
          }
          return null;
        }

        // Réinitialiser les tentatives après succès
        await resetAttempts(email);

        // Mettre à jour la dernière connexion
        await db.utilisateur.update({
          where: { id: user.id },
          data: { dernierLogin: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          nom: user.nom,
          role: user.role,
          avatar: user.avatar,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || 'UTILISATEUR';
        token.nom = (user as any).nom || (user as any).name || '';
        token.email = user.email || '';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.nom = token.nom as string;
        session.user.email = token.email as string;
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
  secret: process.env.NEXTAUTH_SECRET,

  events: {
    signIn: ({ user }) => {
      console.log(`[AUTH] Connexion réussie: ${user.email} (${(user as unknown as { role: string }).role})`);
    },
  },
};

export { isLockedOut, MAX_ATTEMPTS };

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      nom: string;
      role: string;
      avatar?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
  }
}