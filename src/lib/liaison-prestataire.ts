// ─── Liaison des comptes externes PRESTATAIRE ───────────────────────────────
// Un prestataire de soins connecté au Portail Prestataire est rattaché à SA
// fiche Prestataire par e-mail — le même principe que les deux autres rôles
// externes (PORTAIL_CLIENT → Assure.email, CONTACT_ENTREPRISE → contact /
// e-mail société). La fiche Prestataire est un référentiel global
// (GESTION → Prestataires) : son champ `email` (e-mail de facturation)
// sert d'identifiant de liaison.
//
// CHAÎNE DE CONFIANCE : la résolution se fait UNIQUEMENT côté serveur
// (login src/lib/auth.ts puis re-résolution à la demande dans les routes du
// portail) — jamais depuis un paramètre fourni par le navigateur.
//
// GARDE D'AMBIGUÏTÉ (consolidation, miroir SPEC-6 des sociétés) : l'unicité
// de l'e-mail sur les fiches Prestataire est la règle par défaut (détection
// de doublons → 409, cf. src/lib/prestataire-doublons.ts), MAIS une exception
// validée par un Administrateur (groupe d'établissements partageant l'e-mail
// de facturation) peut rendre la liaison ambiguë. La résolution reste alors
// DÉTERMINISTE (fiche la plus ancienne — comportement historique préservé)
// mais elle est TRACÉE (console.error actionnable) et EXPOSÉE aux appelants
// critiques : le portail refuse (403) et la création de compte refuse (409)
// tant que l'ambiguïté n'est pas corrigée — jamais de service de données
// d'une fiche imprévisible.

import { db } from './db';

export type LiaisonPrestataire =
  | { prestataireId: string; source: 'PRESTATAIRE_EMAIL' }
  | null;

/** Résolution contrôlée : résultat déterministe + détection d'ambiguïté. */
export type LiaisonPrestataireControlee =
  | { statut: 'OK'; prestataireId: string }
  | { statut: 'AMBIGU'; nbFiches: number }
  | { statut: 'AUCUNE' };

/** Correspondance d'e-mail insensible à la casse (les e-mails sont trimés). */
const parEmail = (email: string) => ({ equals: email, mode: 'insensitive' as const });

/**
 * Résolution contrôlée de la fiche Prestataire d'un compte PRESTATAIRE par
 * e-mail :
 *   - AUCUNE  — aucune fiche ne porte cet e-mail ;
 *   - OK      — résolution déterministe (fiche la plus ancienne) ;
 *   - AMBIGU  — plusieurs fiches partagent l'e-mail : la résolution reste
 *               déterministe (la plus ancienne) mais les appelants critiques
 *               (portail, création de compte) doivent REFUSER plutôt que de
 *               servir une fiche potentiellement inattendue.
 * Toute ambiguïté est tracée côté serveur (console.error actionnable) pour
 * l'exploitation — sans jamais révéler d'information à l'utilisateur final.
 */
export async function resoudreLiaisonPrestataireAvecControle(
  email: string
): Promise<LiaisonPrestataireControlee> {
  const emailProper = email.trim();
  if (!emailProper) return { statut: 'AUCUNE' };

  const fiches = await db.prestataire.findMany({
    where: { email: parEmail(emailProper) },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (fiches.length === 0) return { statut: 'AUCUNE' };

  if (fiches.length > 1) {
    console.error(
      `[LIAISON PRESTATAIRE] E-mail « ${emailProper} » partagé par ${fiches.length} fiches ` +
      `Prestataire — liaison REFUSÉE par le portail et la création de comptes (fail-closed, ` +
      `jamais de service d'une fiche imprévisible). Corriger les e-mails des fiches ` +
      `concernées (GESTION → Prestataires) ou utiliser un e-mail distinct par établissement.`
    );
  }

  return { statut: 'OK', prestataireId: fiches[0].id };
}

/**
 * Résolution historique (comportement inchangé : fiche la plus ancienne,
 * null si aucune). Délègue à la version contrôlée — l'ambiguïté est tracée
 * côté serveur pour tous les appelants (login compris).
 */
export async function resoudreLiaisonPrestataire(
  email: string
): Promise<LiaisonPrestataire> {
  const controlee = await resoudreLiaisonPrestataireAvecControle(email);
  return controlee.statut === 'OK'
    ? { prestataireId: controlee.prestataireId, source: 'PRESTATAIRE_EMAIL' }
    : null;
}

/** La liaison existe-t-elle pour cet e-mail (fiche Prestataire) ? */
export async function liaisonPrestataireExiste(email: string): Promise<boolean> {
  return (await resoudreLiaisonPrestataire(email)) !== null;
}
