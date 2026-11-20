/**
 * SEC-1 — Sérialisation d'un dossier selon le périmètre du demandeur.
 *
 * Source unique du masquage appliqué aux dossiers transmis aux rôles
 * externes (PORTAIL_CLIENT, CONTACT_ENTREPRISE, PRESTATAIRE) :
 *   1. le NSS du dossier (copie saisie) et celui de l'assuré associé sont
 *      masqués — même politique que la route de liste depuis P2-03 ;
 *   2. les commentaires privés sont exclus — même politique que la route
 *      /api/dossiers/[id]/commentaires (prive=false pour les non-internes).
 *
 * Les rôles internes (INTERNAL_ROLES) reçoivent l'objet tel quel.
 * La fonction est volontairement défensive : champs optionnels gérés pour
 * servir aussi bien la route de détail (dossier complet) que la liste
 * (lignes sans assure ni commentaires).
 */

import { masquerNss } from '@/lib/nss';

/** Forme minimale requise pour appliquer le masquage. */
export interface DossierMasquable {
  nSS?: string | null;
  assure?: { nSS?: string | null } | null;
  commentaires?: { prive: boolean }[];
}

export function masquerDossierPourRole<D extends DossierMasquable>(
  dossier: D,
  restricted: boolean,
): D {
  if (!restricted) return dossier;

  const sortie = { ...dossier } as D;
  sortie.nSS = masquerNss(dossier.nSS);

  if (dossier.assure) {
    sortie.assure = {
      ...dossier.assure,
      nSS: masquerNss(dossier.assure.nSS),
    };
  }

  if (dossier.commentaires) {
    sortie.commentaires = dossier.commentaires.filter(c => !c.prive);
  }

  return sortie;
}
