// ─── Portail Prestataire — résolution serveur de l'identité ────────────────
//
// Helper partagé par les 5 routes GET /api/portail-prestataire*.
//
// CHAÎNE DE CONFIANCE (identique au Portail Client, cf. /api/portail-client) :
//   1. Le JWT signé (8 h) porte le rôle ET le prestataireId résolu AU LOGIN
//      depuis la base (fiche Prestataire portant l'e-mail du compte).
//   2. Si le token ne porte pas le prestataireId (liaison créée/corrigée après
//      connexion) ou pointe vers une fiche supprimée, on RE-RÉSOUT depuis la
//      base à partir de l'e-mail authentifié du token — jamais d'entrée client.
//   3. Un ?prestataireId= transmis par le navigateur qui ne correspond PAS à
//      l'identité serveur est rejeté (403) — un prestataire A ne peut jamais
//      consulter les données d'un prestataire B, même en manipulant l'URL.
//
// RBAC : le middleware (src/proxy.ts) a déjà refusé tout rôle hors
// PRESTATAIRE / ADMINISTRATEUR via API_PERMISSIONS (default-deny). Le rôle
// est re-vérifié ici (défense en profondeur) pour toute requête directe.

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { resoudreLiaisonPrestataire } from '@/lib/liaison-prestataire';
import { ERREUR_SANS_PRESTATAIRE } from '@/lib/data-isolation';

export interface IdentitePrestataire {
  prestataireId: string;
  role: 'PRESTATAIRE';
  email: string;
  userId: string;
}

export interface IdentiteAdmin {
  role: 'ADMINISTRATEUR';
  email: string;
  userId: string;
}

export type ResolutionPrestataire =
  | { ok: true; identite: IdentitePrestataire | IdentiteAdmin }
  | { ok: false; response: NextResponse };

/**
 * Résout l'identité du portail depuis le JWT :
 * - PRESTATAIRE → prestataireId du token, re-résolu par e-mail si besoin ;
 * - ADMINISTRATEUR → mode démonstration (aucune donnée prestataire servie) ;
 * - tout autre cas → réponse d'erreur prête à renvoyer (401/403).
 *
 * Vérifie aussi qu'un éventuel ?prestataireId= fourni par le client
 * correspond à l'identité serveur (403 sinon).
 */
export async function resoudreIdentitePortailPrestataire(
  request: NextRequest
): Promise<ResolutionPrestataire> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ erreur: 'Non authentifié.' }, { status: 401 }),
    };
  }

  const role = token.role as string;
  const userId = token.id as string;
  const emailToken = (token.email as string | undefined)?.trim() ?? '';

  // Rôles internes autres qu'ADMINISTRATEUR : refus (défense en profondeur —
  // le middleware ne devrait déjà pas les laisser passer).
  if (!['PRESTATAIRE', 'ADMINISTRATEUR'].includes(role)) {
    return {
      ok: false,
      response: NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 }),
    };
  }

  // Mode administrateur : démonstration, aucune donnée prestataire.
  if (role === 'ADMINISTRATEUR') {
    return { ok: true, identite: { role: 'ADMINISTRATEUR', email: emailToken, userId } };
  }

  // ─── Rôle PRESTATAIRE : identité = prestataireId résolu côté serveur ────
  let prestataireId = token.prestataireId as string | undefined;

  // Re-résolution par e-mail si le token ne porte pas la liaison
  // (session ouverte avant la création/correction de la fiche).
  if (!prestataireId && emailToken) {
    const liaison = await resoudreLiaisonPrestataire(emailToken);
    prestataireId = liaison?.prestataireId;
  }

  if (!prestataireId) {
    console.error(
      `[PORTAIL PRESTATAIRE] Compte ${emailToken || userId} (rôle ${role}) : aucun ` +
      `Prestataire en base avec cet e-mail. Renseignez l'e-mail du compte sur la ` +
      `fiche du prestataire (GESTION → Prestataires).`
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          erreur:
            `Aucun prestataire lié à votre compte${emailToken ? ` (e-mail recherché : ${emailToken})` : ''}. ` +
            ERREUR_SANS_PRESTATAIRE,
        },
        { status: 403 }
      ),
    };
  }

  // ─── Anti-manipulation : ?prestataireId= du navigateur non fiable ────────
  // Le prestataireId n'est JAMAIS considéré comme fiable lorsqu'il est fourni
  // par le client : s'il est présent et différent de l'identité serveur, la
  // requête est rejetée (403) AVANT tout accès à la base, sans révéler
  // d'information sur la cible.
  const prestataireIdClient =
    new URL(request.url).searchParams.get('prestataireId');
  if (prestataireIdClient && prestataireIdClient.trim() !== prestataireId) {
    return {
      ok: false,
      response: NextResponse.json(
        { erreur: 'Accès refusé : vous ne pouvez consulter que les données de votre propre prestataire.' },
        { status: 403 }
      ),
    };
  }

  // Ancrer l'identité : la fiche doit exister (id périmé → re-résolution par
  // e-mail). Si l'ancrage est impossible, 403 actionnable — jamais de service
  // de données sans identité vérifiée.
  let fiche = await db.prestataire.findUnique({
    where: { id: prestataireId },
    select: { id: true },
  });
  if (!fiche && emailToken) {
    const liaison = await resoudreLiaisonPrestataire(emailToken);
    if (liaison && liaison.prestataireId !== prestataireId) {
      fiche = await db.prestataire.findUnique({
        where: { id: liaison.prestataireId },
        select: { id: true },
      });
      if (fiche) prestataireId = liaison.prestataireId;
    }
  }
  if (!prestataireId || !fiche) {
    return {
      ok: false,
      response: NextResponse.json(
        { erreur: ERREUR_SANS_PRESTATAIRE },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    identite: {
      role: 'PRESTATAIRE',
      prestataireId,
      email: emailToken,
      userId,
    },
  };
}

/** Identité restreinte au prestataire (garde TypeScript après le mode admin). */
export function estPrestataire(
  identite: IdentitePrestataire | IdentiteAdmin
): identite is IdentitePrestataire {
  return identite.role === 'PRESTATAIRE';
}
