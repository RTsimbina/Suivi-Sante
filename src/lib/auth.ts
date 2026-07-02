import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';

// ─── Protection anti brute-force (en mémoire) ─────────────────────────────
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil: number | null }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 10 * 60 * 1000; // 10 minutes

function isLockedOut(email: string): { locked: boolean; remainingMs: number } {
  const record = loginAttempts.get(email);
  if (!record || !record.lockedUntil) return { locked: false, remainingMs: 0 };
  const now = Date.now();
  if (now < record.lockedUntil) {
    return { locked: true, remainingMs: record.lockedUntil - now };
  }
  // Lockout expired, reset
  record.lockedUntil = null;
  record.count = 0;
  return { locked: false, remainingMs: 0 };
}

function recordFailedAttempt(email: string): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  let record = loginAttempts.get(email);

  if (!record || (now - record.lastAttempt > ATTEMPT_WINDOW)) {
    record = { count: 0, lastAttempt: now, lockedUntil: null };
    loginAttempts.set(email, record);
  }

  record.count++;
  record.lastAttempt = now;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION;
    return { locked: true, remainingMs: LOCKOUT_DURATION };
  }

  return { locked: false, remainingMs: 0 };
}

function resetAttempts(email: string) {
  loginAttempts.delete(email);
}

export const authOptions: NextAuthOptions = {
  providers: [
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

        // Vérifier le verrouillage
        const lockStatus = isLockedOut(email);
        if (lockStatus.locked) {
          console.warn(`Compte verrouillé: ${email} (reste ${Math.ceil(lockStatus.remainingMs / 60000)} min)`);
          return null;
        }

        const user = await db.utilisateur.findUnique({
          where: { email },
        });

        if (!user || !user.actif) {
          recordFailedAttempt(email);
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          const attemptResult = recordFailedAttempt(email);
          if (attemptResult.locked) {
            console.warn(`Comte ${email} verrouillé après ${MAX_ATTEMPTS} tentatives échouées`);
          }
          return null;
        }

        // Réinitialiser les tentatives après succès
        resetAttempts(email);

        // Update last login
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
        token.role = user.role;
        token.nom = user.nom;
        token.email = user.email;
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