import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { ROLES } from '@/lib/referentiels';
import { resoudreLiaisonContactEntreprise } from '@/lib/liaison-externe';
import { resoudreLiaisonPrestataireAvecControle } from '@/lib/liaison-prestataire';
import { getClientIp } from '@/lib/rate-limit';
import {
  evaluateLoginAttempt,
  recordFailedLogin,
  resetLoginCounters,
  normalizeEmail,
} from '@/lib/login-policy';
import {
  isLockedOut,
  recordFailedAttempt,
  resetAttempts,
  MAX_ATTEMPTS,
} from '@/lib/account-lockout';

// ─── Verrouillage par compte (PostgreSQL, ATOMIQUE) ────────────────────────
// Les fonctions isLockedOut / recordFailedAttempt / resetAttempts vivent dans
// src/lib/account-lockout.ts : l'incrément du compteur d'échecs y est réalisé
// PAR LA BASE dans un seul UPDATE (SET "failedAttempts" = "failedAttempts" + 1
// + déclenchement du verrou + RETURNING) — opération atomique : aucun
// incrément n'est perdu entre instances simultanées (correction n°3).
// Résilient : si les colonnes lockout ne sont pas encore migrées, le
// verrouillage est simplement désactivé au lieu de casser tout le login.

// ─── Rate limiting distribué (stockage partagé Redis/Postgres) ────────────
// Remplace l'ancien Map en mémoire du processus : en serverless, chaque
// instance avait son propre compteur et pouvait être contournée.
// Les compteurs sont partagés entre TOUTES les instances (opération atomique
// INCR + EXPIRE, voir src/lib/rate-limit.ts) et survivent aux redémarrages.
// La POLITIQUE de limitation (par compte, par IP, clé combinée
// login:<ip>:<email>, garde-fou global) et la construction des clés vivent
// dans src/lib/login-policy.ts : la clé utilisée correspond exactement à la
// politique de sécurité définie.


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
  sessionVersion?: number;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows: UserRow[] = await db.$queryRaw`
    SELECT id, email, nom, password, role, actif, avatar
    FROM "Utilisateur" WHERE "email" = ${email} LIMIT 1
  `;
  return rows[0] ?? null;
}

// ─── Version de session (P1 révocation) ────────────────────────────────────
// Figée dans le JWT à la connexion ; comparée à la valeur du compte à chaque
// accès protégé (src/lib/session-revocation.ts). Requête SÉPARÉE et
// résiliente : si la colonne n'existe pas (base non migrée), le login
// continue avec 0 (mode dégradé — l'état `actif` reste contrôlé partout).
async function lireSessionVersion(userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ sessionVersion: number }[]>`
    SELECT "sessionVersion" FROM "Utilisateur" WHERE id = ${userId} LIMIT 1
  `.catch(() => []);
  return rows[0]?.sessionVersion ?? 0;
}

async function updateLastLogin(userId: string) {
  await db.$executeRaw`
    UPDATE "Utilisateur" SET "dernierLogin" = ${new Date()} WHERE id = ${userId}
  `.catch(() => {});
}

// ─── Configuration NextAuth ────────────────────────────────────────────────
// P0 : GoogleProvider SUPPRIMÉ. L'authentification de la plateforme est
// exclusivement par identifiants (e-mail + mot de passe) : un compte Google
// n'a aucun rôle dans notre base et déclenchait le repli historique vers
// 'ADMINISTRATEUR' dans le callback jwt (escalade de privilèges complète).

export const authOptions: NextAuthOptions = {
  providers: [
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

        // P0 — fail-closed sur le rôle : un compte dont le rôle est absent ou
        // inconnu (hors référentiel des 8 rôles) ne se connecte PAS. Aucune
        // exception : c'est la 1re couche de défense avant le callback jwt.
        if (!user.role || !(ROLES as readonly string[]).includes(user.role)) {
          console.warn(
            `[AUTH] Compte "${email}" : rôle ${user.role ? `inconnu ("${user.role}")` : 'absent'} — ` +
              `connexion refusée (fail-closed). Corriger le rôle en base.`,
          );
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
        // (e-mail nettoyé : la base peut contenir des espaces parasites)
        let assureId: string | undefined;
        let societeId: string | undefined;
        let prestataireId: string | undefined;
        const emailLiaison = user.email.trim();

        if (user.role === 'PORTAIL_CLIENT') {
          // Rechercher l'assuré correspondant à cet e-mail
          const assure = await db.assure.findFirst({
            where: { email: { equals: emailLiaison, mode: 'insensitive' } },
            select: { id: true, societeId: true },
          });
          if (assure) {
            assureId = assure.id;
            societeId = assure.societeId ?? undefined;
          } else {
            console.warn(
              `[AUTH] Compte PORTAIL_CLIENT "${user.email}" : aucun Assure en base avec cet e-mail. ` +
              `Le portail affichera une erreur tant que l'e-mail de l'assuré ne correspond pas.`
            );
          }
        } else if (user.role === 'CONTACT_ENTREPRISE') {
          // Résoudre la société : contact déclaré (EntrepriseContact), e-mail
          // du contact principal (« Modifier la société ») ou e-mail société.
          const liaison = await resoudreLiaisonContactEntreprise(emailLiaison);
          if (liaison) {
            societeId = liaison.societeId;
          } else {
            console.warn(
              `[AUTH] Compte CONTACT_ENTREPRISE "${user.email}" : aucun EntrepriseContact ni Societe ` +
              `avec cet e-mail. Le portail affichera une erreur tant que la liaison n'est pas établie.`
            );
          }
        } else if (user.role === 'PRESTATAIRE') {
          // Résoudre la fiche Prestataire par e-mail (liaison par facturation).
          // Garde d'ambiguïté : un e-mail partagé par plusieurs fiches (exception
          // de doublon validée) ne produit AUCUNE liaison dans le token — le
          // portail refusera (403) tant que l'ambiguïté n'est pas corrigée.
          const liaison = await resoudreLiaisonPrestataireAvecControle(emailLiaison);
          if (liaison.statut === 'OK') {
            prestataireId = liaison.prestataireId;
          } else if (liaison.statut === 'AMBIGU') {
            console.warn(
              `[AUTH] Compte PRESTATAIRE "${user.email}" : e-mail partagé par ${liaison.nbFiches} fiches ` +
              `Prestataire — liaison refusée (fail-closed). Corriger les fiches (GESTION → Prestataires).`
            );
          } else {
            console.warn(
              `[AUTH] Compte PRESTATAIRE "${user.email}" : aucun Prestataire en base avec cet e-mail. ` +
              `Le portail affichera une erreur tant que l'e-mail du prestataire ne correspond pas.`
            );
          }
        }

        // Mettre à jour la dernière connexion
        await updateLastLogin(user.id);

        // P1 : figer la version de session au login — le JWT portera cette
        // valeur ; toute désactivation/réactivation ultérieure (incrément)
        // la rend invalide pour les accès protégés (révocation immédiate).
        const sessionVersion = await lireSessionVersion(user.id);

        return {
          id: user.id,
          email: user.email,
          nom: user.nom,
          role: user.role,
          avatar: user.avatar,
          sessionVersion,
          assureId,
          societeId,
          prestataireId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // P0 — PLUS AUCUN repli de rôle. L'ancien `user.role || 'ADMINISTRATEUR'`
      // transformait toute identité sans rôle (ex. compte OAuth) en admin.
      // Deux couches de défense :
      //   1. authorize() ne renvoie que des comptes à rôle valide (référentiel) ;
      //   2. ICI : re-vérification stricte — sinon la session est REFUSÉE.
      if (user) {
        const role = (user as { role?: string }).role;
        if (!role || !(ROLES as readonly string[]).includes(role)) {
          throw new Error(
            `[AUTH] Session refusée : rôle absent ou invalide pour ` +
              `${user.email ?? user.id} (fail-closed).`,
          );
        }
        token.id = user.id;
        token.role = role;
        token.nom = (user as any).nom || (user as any).name || '';
        token.email = user.email || '';
        // P1 : version de session figée au login (révocation côté serveur).
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        // Stocker les identifiants de portail pour les rôles externes
        const userAny = user as any;
        if (userAny.assureId) token.assureId = userAny.assureId;
        if (userAny.societeId) token.societeId = userAny.societeId;
        if (userAny.prestataireId) token.prestataireId = userAny.prestataireId;
      } else if (!token.role || !(ROLES as readonly string[]).includes(String(token.role))) {
        // Défense en profondeur : un token préexistant sans rôle valide
        // (corrompu ou émis avant correctif) est invalidé — pas de rôle,
        // pas de privilèges. Le porteur doit se reconnecter.
        throw new Error('[AUTH] Token sans rôle valide — session invalidée (fail-closed).');
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
        if (token.prestataireId) (session.user as any).prestataireId = token.prestataireId;
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

export { isLockedOut, MAX_ATTEMPTS } from '@/lib/account-lockout';

// ─── Timing-safe string comparison ──────────────────────────────────
// Purge code mort : safeCompare supprimé (jamais référencé hors de ce module).

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
      prestataireId?: string;
    };
  }

  interface User {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
    sessionVersion?: number;
    assureId?: string;
    societeId?: string;
    prestataireId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
    /** P1 : figée au login, comparée à Utilisateur.sessionVersion à chaque accès protégé. */
    sessionVersion?: number;
    assureId?: string;
    societeId?: string;
    prestataireId?: string;
  }
}