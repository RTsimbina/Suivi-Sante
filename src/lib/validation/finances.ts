// ─── Schémas Zod — Contrats, appels de fonds, barèmes ───────────────────────

import { z } from "zod";
import {
  dateOptionnelle,
  dateRequise,
  emailOptionnel,
  idOptionnel,
  idSchema,
  montantNonNegatif,
  montantNonNegatifOptionnel,
  montantPositif,
  prestationBaremeSchema,
  statutAppelFondsSchema,
  statutContratSchema,
  tauxCouvertureSchema,
  texteOptionnel,
  texteCourt,
} from "./common";

const datesCoherentes = {
  message: "La date de fin doit être postérieure à la date de début",
  path: ["dateFin"] as PropertyKey[],
};

/** POST /api/contrats */
export const contratCreateSchema = z
  .object({
    societeId: idSchema,
    reference: texteCourt(100, "La référence du contrat"),
    // FIX audit : budgetAnnuel n'était ni typé ni contrôlé positif
    // (Number("abc") → NaN passait, un budget négatif passait).
    budgetAnnuel: montantPositif,
    dateDebut: dateRequise,
    dateFin: dateRequise,
    statut: statutContratSchema.default("ACTIF"),
  })
  .refine((d) => d.dateFin.getTime() > d.dateDebut.getTime(), datesCoherentes);

/** PUT /api/contrats/[id] */
export const contratUpdateSchema = z
  .object({
    reference: texteCourt(100, "La référence du contrat").optional(),
    budgetAnnuel: montantPositif.optional(),
    dateDebut: dateRequise.optional(),
    dateFin: dateRequise.optional(),
    statut: statutContratSchema.optional(),
  })
  .refine(
    (d) => !d.dateDebut || !d.dateFin || d.dateFin.getTime() > d.dateDebut.getTime(),
    datesCoherentes
  );

/** POST /api/appels-fonds */
export const appelFondsCreateSchema = z.object({
  contratId: idSchema,
  // FIX audit majeur : le montant n'était JAMAIS contrôlé positif — un appel
  // de fonds négatif passait et diminuait artificiellement le budget utilisé.
  montant: montantPositif,
  dateAppel: dateRequise,
  observations: texteOptionnel(2000),
});

/** PATCH /api/appels-fonds/[id] */
export const appelFondsUpdateSchema = z.object({
  statut: statutAppelFondsSchema.optional(),
  datePaiement: dateOptionnelle,
  reference: texteOptionnel(100),
  montant: montantNonNegatif.optional(),
});

// ─── Barèmes ────────────────────────────────────────────────────────────────

/** Ligne de barème (réutilisée par /api/baremes et /api/technique/societes). */
export const baremeLigneSchema = z.object({
  prestation: prestationBaremeSchema,
  tauxCouverture: tauxCouvertureSchema,
  // FIX incohérence : /api/baremes exigeait > 0, /api/technique/societes
  // acceptait >= 0 → unifié à > 0 (un plafond nul n'a pas de sens métier).
  plafond: montantPositif,
  description: texteOptionnel(2000),
  active: z.boolean().optional(),
});

/** POST /api/baremes */
export const baremeCreateSchema = baremeLigneSchema.extend({
  societeId: idSchema,
});

/** PATCH /api/baremes — activation / désactivation. */
export const baremePatchSchema = z.object({
  id: idSchema,
  // FIX audit : pas de typeof — la chaîne "false" (truthy) activait le barème.
  active: z.boolean({ message: "Le champ 'active' doit être un booléen" }),
});

/** POST /api/baremes/calculer — simulation de remboursement. */
export const baremeCalculerSchema = z.object({
  societeId: idSchema,
  prestation: prestationBaremeSchema,
  montantReclame: montantPositif,
});

/** POST /api/technique/baremes — calcul technique avec plafond assuré. */
export const techniqueBaremeSchema = z.object({
  societeId: idSchema,
  // Chaîne libre (la route applique .toUpperCase() avant la recherche du barème)
  prestation: texteCourt(100, "La prestation"),
  montantReclame: montantPositif,
  assureId: idOptionnel,
  prestataireId: idOptionnel,
});

/** POST /api/technique/societes — création avec barèmes initiaux. */
export const societeTechniqueCreateSchema = z
  .object({
    nom: texteCourt(200, "Le nom de la société"),
    adresse: texteOptionnel(300),
    telephone: texteOptionnel(50),
    email: emailOptionnel,
    nif: texteOptionnel(50),
    contactPrincipal: texteOptionnel(200),
    baremes: z.array(baremeLigneSchema).max(50, "50 barèmes maximum").optional(),
  });

/** PUT /api/technique/societes/[id] */
export const societeTechniqueUpdateSchema = societeTechniqueCreateSchema.partial();
