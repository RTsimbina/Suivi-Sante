/**
 * portail-client-scope.ts — Résolution du périmètre du portail client,
 * partagée par la route de consultation (/api/portail-client) et l'export
 * (/api/portail-client/export) pour garantir un périmètre et des filtres
 * IDENTIQUES (P2-02C : l'export respecte la même isolation que la lecture).
 *
 * Rappel d'architecture (cf. src/lib/data-isolation.ts) :
 *   - le JWT fige assureId/societeId pour toute la session (8 h) ;
 *   - si la liaison (e-mail assuré / contact d'entreprise) a été créée ou
 *     corrigée APRÈS la connexion, on re-résout DEPUIS LA BASE à partir de
 *     l'e-mail authentifié du token (jamais d'entrée client).
 */

import { db } from './db';
import { resoudreLiaisonContactEntreprise } from './liaison-externe';

export async function resoudreAssureParEmail(email: string) {
  return db.assure.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, societeId: true },
  });
}

export async function resoudreSocieteIdParEmailContact(email: string): Promise<string | null> {
  // Contact déclaré, e-mail du contact principal (« Modifier la société »)
  // ou e-mail général de la société — cf. src/lib/liaison-externe.ts.
  const liaison = await resoudreLiaisonContactEntreprise(email);
  return liaison?.societeId ?? null;
}

export async function chargerAssure(id: string) {
  return db.assure.findUnique({
    where: { id },
    include: {
      societe: { select: { id: true, nom: true, adresse: true, telephone: true, email: true } },
    },
  });
}

/** Périmètre résolu pour un token de portail (répète la logique de la route). */
export interface PerimetrePortail {
  role: string;
  userId: string;
  emailToken: string;
  assureId?: string;
  societeId?: string;
}

export function perimetreDepuisToken(token: Record<string, unknown>): PerimetrePortail {
  return {
    role: token.role as string,
    userId: token.id as string,
    emailToken: ((token.email as string | undefined) ?? '').trim(),
    assureId: token.assureId as string | undefined,
    societeId: token.societeId as string | undefined,
  };
}
