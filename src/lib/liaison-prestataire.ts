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

import { db } from './db';

export type LiaisonPrestataire =
  | { prestataireId: string; source: 'PRESTATAIRE_EMAIL' }
  | null;

/** Correspondance d'e-mail insensible à la casse (les e-mails sont trimés). */
const parEmail = (email: string) => ({ equals: email, mode: 'insensitive' as const });

/**
 * Résout la fiche Prestataire d'un compte PRESTATAIRE par e-mail.
 * Retourne null si aucun prestataire ne porte cet e-mail.
 */
export async function resoudreLiaisonPrestataire(
  email: string
): Promise<LiaisonPrestataire> {
  const emailProper = email.trim();
  if (!emailProper) return null;

  const prestataire = await db.prestataire.findFirst({
    where: { email: parEmail(emailProper) },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (prestataire) {
    return { prestataireId: prestataire.id, source: 'PRESTATAIRE_EMAIL' };
  }
  return null;
}

/** La liaison existe-t-elle pour cet e-mail (fiche Prestataire) ? */
export async function liaisonPrestataireExiste(email: string): Promise<boolean> {
  return (await resoudreLiaisonPrestataire(email)) !== null;
}
