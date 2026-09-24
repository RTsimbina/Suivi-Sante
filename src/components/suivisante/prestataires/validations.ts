/**
 * Validation côté client des formulaires prestataire — réutilise EXACTEMENT
 * les schémas Zod de l'API (src/lib/validation/referentiels.ts).
 *
 * Règle d'architecture : aucune règle de format n'est dupliquée entre le
 * navigateur et le serveur. Le formulaire reste éditable mais chaque champ
 * est contrôlé avec la même source de vérité que PUT/POST /api/prestataires,
 * ce qui garantit qu'une saisie acceptée côté client est acceptée côté API
 * (et inversement).
 */

import { prestataireCreateSchema } from '@/lib/validation';
import type { CreateFormState } from './types';

export type ErreursParChamp = Partial<Record<keyof CreateFormState, string>>;

/**
 * Valide le formulaire de création/modification.
 * Renvoie une map champ → message d'erreur (vide si le formulaire est valide).
 * Les champs optionnels vides sont tolérés (transformés en undefined).
 */
export function validerFormulairePrestataire(form: CreateFormState): ErreursParChamp {
  const resultat = prestataireCreateSchema.safeParse({
    nom: form.nom,
    type: form.type || undefined,
    code: form.code || undefined,
    telephone: form.telephone || undefined,
    email: form.email || undefined,
    adresse: form.adresse || undefined,
    nif: form.nif || undefined,
    stat: form.stat || undefined,
    statutJuridique: form.statutJuridique || undefined,
    statut: form.statut || undefined,
    rib: form.rib || undefined,
    iban: form.iban || undefined,
    groupePrestataireId: form.groupePrestataireId || undefined,
  });

  if (resultat.success) return {};

  const erreurs: ErreursParChamp = {};
  for (const issue of resultat.error.issues) {
    const champ = issue.path[0] as keyof CreateFormState | undefined;
    if (champ && !erreurs[champ]) {
      erreurs[champ] = issue.message;
    }
  }
  return erreurs;
}
