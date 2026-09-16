// ─── Liaison des comptes externes CONTACT_ENTREPRISE ────────────────────────
// Un représentant de société cliente est rattaché à SA société par e-mail,
// selon TROIS sources équivalentes (dans l'ordre de priorité) :
//   1. EntrepriseContact — contact déclaré dans Sociétés → onglet Contacts ;
//   2. Societe.emailContactPrincipal — e-mail du contact principal saisi dans
//      « Modifier la société » (flux demandé par l'admin : « le Contact
//      Entreprise, c'est le contact principal et son e-mail ») ;
//   3. Societe.email — e-mail général de la société (flux historique).
// Avant ce module, seule la source 1 était reconnue : créer un compte
// CONTACT_ENTREPRISE avec l'e-mail du contact principal échouait (422 à la
// création, « Aucune société liée » au portail).

import { db } from './db';

export type LiaisonContact =
  | { societeId: string; source: 'CONTACT' | 'SOCIETE_PRINCIPAL' | 'SOCIETE_EMAIL' }
  | null;

/** Correspondance d'e-mail insensible à la casse (les e-mails sont trimés). */
const parEmail = (email: string) => ({ equals: email, mode: 'insensitive' as const });

/**
 * Résout la société d'un compte CONTACT_ENTREPRISE par e-mail :
 * contact déclaré, puis e-mail du contact principal, puis e-mail général de
 * la société. null si aucune liaison.
 */
export async function resoudreLiaisonContactEntreprise(
  email: string
): Promise<LiaisonContact> {
  const emailProper = email.trim();
  if (!emailProper) return null;

  // 1) Contact déclaré (prioritaire : liaison par représentant)
  const contact = await db.entrepriseContact.findFirst({
    where: { email: parEmail(emailProper) },
    select: { societeId: true },
  });
  if (contact?.societeId) {
    return { societeId: contact.societeId, source: 'CONTACT' };
  }

  // 2) E-mail du contact principal (« Modifier la société »)
  const societeParPrincipal = await db.societe.findFirst({
    where: { emailContactPrincipal: parEmail(emailProper) },
    select: { id: true },
  });
  if (societeParPrincipal) {
    return { societeId: societeParPrincipal.id, source: 'SOCIETE_PRINCIPAL' };
  }

  // 3) E-mail général de la société (flux historique)
  const societeParEmail = await db.societe.findFirst({
    where: { email: parEmail(emailProper) },
    select: { id: true },
  });
  if (societeParEmail) {
    return { societeId: societeParEmail.id, source: 'SOCIETE_EMAIL' };
  }

  return null;
}

/** La liaison existe-t-elle pour cet e-mail (contact OU société) ? */
export async function liaisonContactEntrepriseExiste(
  email: string
): Promise<boolean> {
  return (await resoudreLiaisonContactEntreprise(email)) !== null;
}
