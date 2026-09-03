// ─── Schémas Zod — Référentiels : utilisateurs, sociétés, prestataires, ─────
//     assurés, contacts entreprise
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  coefficientBaremeSchema,
  dateOptionnelle,
  emailOptionnel,
  emailSchema,
  idOptionnel,
  idSchema,
  motDePasseSchema,
  roleUtilisateurSchema,
  sexeSchema,
  typeBeneficiaireSchema,
  typePrestataireSchema,
  texteOptionnel,
  texteCourt,
} from "./common";

// ─── Utilisateurs (/api/utilisateurs) ───────────────────────────────────────

export const utilisateurCreateSchema = z.object({
  email: emailSchema,
  nom: texteCourt(100, "Le nom"),
  password: motDePasseSchema,
  role: roleUtilisateurSchema,
});

export const utilisateurUpdateSchema = z.object({
  id: idSchema,
  email: emailSchema.optional(),
  nom: texteCourt(100, "Le nom").optional(),
  role: roleUtilisateurSchema.optional(),
  // "" = mot de passe inchangé (comportement du formulaire d'édition)
  password: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    motDePasseSchema.optional()
  ),
});

export const utilisateurPatchSchema = z.object({
  id: idSchema,
  // FIX audit : pas de typeof — n'importe quelle valeur truthy (ex : "false"
  // en chaîne) était envoyée à Prisma.
  actif: z.boolean({ message: "Le champ 'actif' doit être un booléen" }),
});

// ─── Sociétés (/api/societes) ───────────────────────────────────────────────

export const societeCreateSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, "Le nom de la société doit contenir au moins 2 caractères")
    .max(200, "Le nom de la société ne peut pas dépasser 200 caractères"),
});

// ─── Prestataires (/api/prestataires) ───────────────────────────────────────

export const prestataireCreateSchema = z.object({
  nom: texteCourt(200, "Le nom du prestataire"),
  type: typePrestataireSchema,
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  nif: texteOptionnel(50),
  statut: texteOptionnel(50),
  rib: texteOptionnel(50),
  actif: z.boolean().optional(),
});

export const prestataireUpdateSchema = z.object({
  id: idSchema,
  nom: texteCourt(200, "Le nom du prestataire").optional(),
  type: typePrestataireSchema.optional(),
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  nif: texteOptionnel(50),
  statut: texteOptionnel(50),
  rib: texteOptionnel(50),
  actif: z.boolean().optional(),
});

// ─── Liaisons prestataire ↔ société (/api/prestataires/societes) ────────────

export const liaisonPrestataireSocieteSchema = z.object({
  prestataireId: idSchema,
  societeId: idSchema,
});

export const liaisonPatchSchema = z.object({
  id: idSchema,
  actif: z.boolean({ message: "Le champ 'actif' doit être un booléen" }),
});

// ─── Assurés (/api/assures) ─────────────────────────────────────────────────

export const assureCoreSchema = z.object({
  societeId: idSchema,
  nom: texteCourt(100, "Le nom de l'assuré"),
  prenom: texteOptionnel(100),
  nSS: texteOptionnel(32),
  matricule: texteOptionnel(32),
  // FIX audit : typeBeneficiaire validé une seule fois ici, pour toutes les API.
  typeBeneficiaire: typeBeneficiaireSchema.default("ASSURE"),
  assurePrincipalId: idOptionnel,
  codeFamille: texteOptionnel(32),
  dateNaissance: dateOptionnelle,
  // FIX incohérence : sexe normalisé M/F (avant : chaîne libre côté API).
  sexe: sexeSchema.nullish(),
  dateEffet: dateOptionnelle,
  // Coefficient de garantie entre 0 et 1 (ex : 0.8), comme à l'import Excel.
  bareme: coefficientBaremeSchema.nullish(),
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  actif: z.boolean().optional(),
});

export const assureCreateSchema = assureCoreSchema;

/** PUT /api/assures — tout optionnel sauf l'identifiant (societeId inclus :
 *  le changement de société est refusé côté route si des dossiers existent). */
export const assureUpdateSchema = z.object({
  id: idSchema,
  societeId: idSchema.optional(),
  nom: texteCourt(100, "Le nom de l'assuré").optional(),
  prenom: texteOptionnel(100),
  nSS: texteOptionnel(32),
  matricule: texteOptionnel(32),
  typeBeneficiaire: typeBeneficiaireSchema.optional(),
  assurePrincipalId: idOptionnel,
  codeFamille: texteOptionnel(32),
  dateNaissance: dateOptionnelle,
  sexe: sexeSchema.nullish(),
  dateEffet: dateOptionnelle,
  bareme: coefficientBaremeSchema.nullish(),
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  actif: z.boolean().optional(),
});

// ─── Contacts entreprise (/api/entreprise-contacts) ─────────────────────────

export const contactEntrepriseCreateSchema = z.object({
  societeId: idSchema,
  nom: texteCourt(100, "Le nom du contact"),
  prenom: texteOptionnel(100),
  fonction: texteOptionnel(100),
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  actif: z.boolean().optional(),
});

/** FIX audit : PUT sans aucune validation — un nom absent provoquait une
 *  erreur 500 Prisma. Le nom est désormais requis, le reste optionnel. */
export const contactEntrepriseUpdateSchema = z.object({
  nom: texteCourt(100, "Le nom du contact"),
  prenom: texteOptionnel(100),
  fonction: texteOptionnel(100),
  telephone: texteOptionnel(50),
  email: emailOptionnel,
  actif: z.boolean().optional(),
});
