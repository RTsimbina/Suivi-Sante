// ─── Schémas Zod — Référentiels : utilisateurs, sociétés, prestataires, ─────
//     assurés, contacts entreprise
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  coefficientBaremeSchema,
  codePrestataireSchema,
  dateOptionnelle,
  emailOptionnel,
  emailSchema,
  ibanSchema,
  idOptionnel,
  idSchema,
  motDePasseSchema,
  nifSchema,
  numStatSchema,
  ribSchema,
  roleUtilisateurSchema,
  sexeSchema,
  telephoneLibreSchema,
  typeBeneficiaireSchema,
  typePrestataireSchema,
  texteOptionnel,
  texteCourt,
} from "./common";
import { canoniserStatutJuridique } from "@/lib/referentiels";

// ─── Utilisateurs (/api/utilisateurs) ───────────────────────────────────────

/** societeId optionnel (rôle CONTACT_ENTREPRISE) : "" côté client = non
 *  sélectionné → undefined, jamais une chaîne vide rejetée par idSchema. */
const societeIdOptionnel = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  idOptionnel
);

export const utilisateurCreateSchema = z.object({
  email: emailSchema,
  nom: texteCourt(100, "Le nom"),
  password: motDePasseSchema,
  role: roleUtilisateurSchema,
  // CONTACT_ENTREPRISE sans contact existant : permet la création en une
  // étape du compte + du contact d'entreprise lié (société sélectionnée).
  societeId: societeIdOptionnel,
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
  // Idem création : liaison one-step d'un CONTACT_ENTREPRISE à une société
  societeId: societeIdOptionnel,
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
// Validation centralisée : formats NIF / Num STAT / téléphone / RIB contrôlés
// par les primitives partagées de common.ts (client ET serveur utilisent ces
// mêmes schémas — aucune règle dupliquée côté formulaire).

/** Statut juridique canonisé contre le référentiel centralisé (source unique
 *  : src/lib/referentiels.ts). Une valeur hors référentiel est rejetée.
 *  Champ omis (undefined) = inchangé → passe tel quel (schéma de mise à jour). */
const STATUT_JURIDIQUE_INVALIDE = '__STATUT_JURIDIQUE_INVALIDE__';
const statutJuridiqueSchema = texteOptionnel(60)
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const canon = canoniserStatutJuridique(v);
    return canon === undefined ? STATUT_JURIDIQUE_INVALIDE : canon;
  })
  .refine((v) => v !== STATUT_JURIDIQUE_INVALIDE, {
    message:
      "Statut juridique invalide : choisir une valeur du référentiel (SUARL, SA, SARL, SAS, EI, ONG…)",
  })
  .transform((v) => (v === STATUT_JURIDIQUE_INVALIDE ? null : v));

/** groupePrestataireId optionnel : "" côté client = non sélectionné. */
const groupePrestataireIdOptionnel = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  idOptionnel
);

export const prestataireCreateSchema = z.object({
  nom: texteCourt(200, "Le nom du prestataire"),
  type: typePrestataireSchema,
  code: codePrestataireSchema,
  telephone: telephoneLibreSchema,
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  nif: nifSchema,
  stat: numStatSchema,
  statutJuridique: statutJuridiqueSchema,
  statut: texteOptionnel(50),
  rib: ribSchema,
  iban: ibanSchema,
  groupePrestataireId: groupePrestataireIdOptionnel,
  actif: z.boolean().optional(),
});

export const prestataireUpdateSchema = z.object({
  id: idSchema,
  nom: texteCourt(200, "Le nom du prestataire").optional(),
  type: typePrestataireSchema.optional(),
  code: codePrestataireSchema,
  telephone: telephoneLibreSchema,
  email: emailOptionnel,
  adresse: texteOptionnel(300),
  nif: nifSchema,
  stat: numStatSchema,
  statutJuridique: statutJuridiqueSchema,
  statut: texteOptionnel(50),
  rib: ribSchema,
  iban: ibanSchema,
  groupePrestataireId: groupePrestataireIdOptionnel,
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

// Purge code mort : export retiré (schéma de base utilisé uniquement intra-module).
const assureCoreSchema = z.object({
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
