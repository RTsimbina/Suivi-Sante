// ─── Schémas Zod — Dossiers ─────────────────────────────────────────────────

import { z } from "zod";
import {
  dateOptionnelle,
  dateRequise,
  idOptionnel,
  idSchema,
  montantNonNegatif,
  montantNonNegatifOptionnel,
  categorieDossierSchema,
  sourceDossierSchema,
  statutDossierSchema,
  texteOptionnel,
  texteCourt,
  typeDossierSchema,
} from "./common";

/** POST /api/dossiers — création manuelle d'un dossier. */
export const dossierCreateSchema = z.object({
  numeroDossier: texteCourt(64, "Le numéro de dossier"),
  dateReception: dateRequise,
  societeId: idSchema,
  beneficiaire: texteCourt(200, "Le bénéficiaire"),
  // FIX audit : typeDossier validé contre la liste des prestations
  // (avant : toute chaîne était acceptée, même "Montage IKEA").
  typeDossier: typeDossierSchema,
  categorieDossier: categorieDossierSchema.nullish(),
  gestionnaireAccueilId: idOptionnel,
  // FIX audit : contrôle du type (number) + non-négativité — avant, une
  // chaîne "500" traversait le contrôle `< 0` et provoquait une erreur 500.
  montantReclame: montantNonNegatif.default(0),
  assureId: idOptionnel,
  nSS: texteOptionnel(32),
  prestataireId: idOptionnel,
  dateSoins: dateOptionnelle,
  moyenPaiement: texteOptionnel(50),
  observations: texteOptionnel(5000),
  source: sourceDossierSchema.default("MANUEL"),
  montantValide: montantNonNegatifOptionnel,
  ticketModerateur: montantNonNegatifOptionnel,
});

export type DossierCreateInput = z.infer<typeof dossierCreateSchema>;

/**
 * PATCH /api/dossiers/[id] — mise à jour partielle.
 * Tout champ non listé est SUPPRIMÉ (whitelist) : impossible de glisser
 * montantReclame, numeroDossier, statut de paiement ou historique via PATCH.
 */
export const dossierUpdateSchema = z.object({
  statut: statutDossierSchema.optional(),
  gestionnaireAccueilId: idOptionnel,
  gestionnaireTechniqueId: idOptionnel,
  gestionnaireComptaId: idOptionnel,
  assureId: idOptionnel,
  prestataireId: idOptionnel,
  // FIX audit : montantValide / ticketModerateur n'étaient pas contrôlés ici
  // (un montant négatif pouvait passer par le PATCH alors que le POST le refusait).
  montantValide: montantNonNegatifOptionnel,
  ticketModerateur: montantNonNegatifOptionnel,
  nSS: texteOptionnel(32),
  dateSoins: dateOptionnelle,
  moyenPaiement: texteOptionnel(50),
  observations: texteOptionnel(5000),
  motifRejet: texteOptionnel(2000),
});

export type DossierUpdateInput = z.infer<typeof dossierUpdateSchema>;

/** POST /api/dossiers/assigner-bulk — affectation en masse des gestionnaires. */
export const assignerBulkSchema = z.object({
  dossierIds: z
    .array(idSchema)
    .min(1, "Au moins un dossier doit être sélectionné")
    .max(200, "200 dossiers maximum par lot"),
  champ: z.enum(["ACCUEIL", "TECHNIQUE", "COMPTABILITE"]),
  gestionnaireId: idSchema,
});

/** POST /api/dossiers/[id]/commentaires */
export const commentaireCreateSchema = z.object({
  contenu: texteCourt(5000, "Le contenu du commentaire"),
  prive: z.boolean().default(false),
});
