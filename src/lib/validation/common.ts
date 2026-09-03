// ─── Primitives Zod partagées + énumérations centrales ──────────────────────
// Source de vérité unique des règles de validation : chaque API réutilise
// ces primitives, ce qui garantit l'homogénéité (un montant négatif est
// refusé partout, un type invalidé est rejeté partout, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { ALL_SOUS_TYPES, PARENT_TYPES } from "@/lib/prestations";

// ─── Identifiants ───────────────────────────────────────────────────────────

/** Identifiant Prisma (cuid) passé dans le body ou les paramètres. */
export const idSchema = z
  .string()
  .trim()
  .min(1, "Identifiant requis")
  .max(64, "Identifiant trop long");

/** Identifiant optionnel / remis à null (dissociation d'un gestionnaire...). */
export const idOptionnel = idSchema.nullish();

// ─── Chaînes ────────────────────────────────────────────────────────────────

export const texteCourt = (max: number, label = "Ce champ") =>
  z.string().trim().min(1, `${label} est requis`).max(max, `${label} ne peut pas dépasser ${max} caractères`);

export const texteOptionnel = (max: number) =>
  z.string().trim().max(max, `Ce champ ne peut pas dépasser ${max} caractères`).nullish();

/** Email obligatoire (trim + format). */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "L'adresse email est requise")
  .max(254, "L'adresse email est trop longue")
  .pipe(z.email("Adresse email invalide"));

/** Email optionnel (chaîne vide traitée comme absente → null). */
export const emailOptionnel = z
  .string()
  .trim()
  .max(254, "L'adresse email est trop longue")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Adresse email invalide")
  .nullish()
  .transform((v) => (!v || v === "" ? null : v));

/**
 * Mot de passe : même politique que la création de comptes (≥ 8 caractères,
 * au moins une lettre et un chiffre). Utilisé par /api/utilisateurs,
 * /api/auth/reset-password et /api/profil/changer-mot-de-passe.
 */
export const motDePasseSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[a-zA-Z]/, "Le mot de passe doit contenir au moins une lettre")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre");

// ─── Montants ───────────────────────────────────────────────────────────────
// z.coerce.number : tolère les nombres envoyés en chaîne ("500") par le
// frontend, mais refuse tout ce qui n'est pas numérique ("abc" → NaN → 400).
// Fini les strings qui traversaient les contrôles `< 0` et explosaient en
// erreur 500 Prisma.

/** Montant strictement positif (> 0) : budget annuel, plafond, montant d'un appel de fonds... */
export const montantPositif = z.coerce
  .number()
  .finite("Le montant doit être un nombre valide")
  .positive("Le montant doit être strictement positif");

/** Montant non négatif (≥ 0) : montants validés, ticket modérateur, montant payé... */
export const montantNonNegatif = z.coerce
  .number()
  .finite("Le montant doit être un nombre valide")
  .min(0, "Le montant ne peut pas être négatif");

export const montantPositifOptionnel = montantPositif.nullish();
export const montantNonNegatifOptionnel = montantNonNegatif.nullish();

/** Taux de couverture d'un barème : pourcentage entre 0 et 100. */
export const tauxCouvertureSchema = z.coerce
  .number()
  .finite("Le taux doit être un nombre valide")
  .min(0, "Le taux de couverture ne peut pas être négatif")
  .max(100, "Le taux de couverture ne peut pas dépasser 100");

/** Coefficient de barème d'un assuré : entre 0 et 1 (ex : 0.8 = 80 %). */
export const coefficientBaremeSchema = z.coerce
  .number()
  .finite("Le barème doit être un nombre valide")
  .min(0, "Le barème ne peut pas être négatif")
  .max(1, "Le barème doit être compris entre 0 et 1 (ex : 0.8)");

// ─── Dates ──────────────────────────────────────────────────────────────────
// Accepte les chaînes ISO ("2026-01-15", "2026-01-15T10:30:00Z") et les
// transforme en objet Date exploitable par Prisma. Rejette les dates
// invalides (avant : `new Date("n'importe quoi")` → Invalid Date → 500).

export const dateRequise = z.coerce.date();
export const dateOptionnelle = z.coerce.date().nullish();

// ─── Énumérations centrales ─────────────────────────────────────────────────
// Valeurs partagées par plusieurs routes (avant : dupliquées en dur dans
// 5 fichiers avec des écarts de validation).

export const STATUTS_DOSSIER = [
  "RECU",
  "EN_ANALYSE",
  "VALIDE",
  "EN_COMPTABILITE",
  "EN_PAIEMENT",
  "PAYE",
  "REJETE",
] as const;
export const statutDossierSchema = z.enum(STATUTS_DOSSIER, {
  message: "Statut de dossier invalide",
});

export const CATEGORIES_DOSSIER = ["REMBOURSEMENT_ASSURE", "REGLEMENT_PRESTATAIRE"] as const;
export const categorieDossierSchema = z.enum(CATEGORIES_DOSSIER);

export const TYPES_BENEFICIAIRE = ["ASSURE", "CONJOINT", "ENFANT"] as const;
export const typeBeneficiaireSchema = z.enum(TYPES_BENEFICIAIRE);

export const SEXE_VALUES = ["M", "F"] as const;
export const sexeSchema = z.enum(SEXE_VALUES);

export const ROLES_UTILISATEUR = [
  "ADMINISTRATEUR",
  "ACCUEIL",
  "TECHNIQUE",
  "COMPTABILITE",
  "SANTE",
  "PORTAIL_CLIENT",
  "CONTACT_ENTREPRISE",
] as const;
export const roleUtilisateurSchema = z.enum(ROLES_UTILISATEUR);

export const TYPES_PRESTATAIRE = [
  "HOPITAL",
  "CLINIQUE",
  "PHARMACIE",
  "CABINET_MEDICAL",
  "LABORATOIRE",
  "DENTAIRE",
  "OPTICIEN",
  "AUTRE",
] as const;
export const typePrestataireSchema = z.enum(TYPES_PRESTATAIRE);

export const STATUTS_CONTRAT = ["ACTIF", "EXPIRE", "SUSPENDU"] as const;
export const statutContratSchema = z.enum(STATUTS_CONTRAT);

export const STATUTS_APPEL_FONDS = ["EN_ATTENTE", "REGLE", "ANNULE"] as const;
export const statutAppelFondsSchema = z.enum(STATUTS_APPEL_FONDS);

export const STATUTS_COURRIEL = ["RECU", "TRAITE", "REJETE"] as const;
export const statutCourrielSchema = z.enum(STATUTS_COURRIEL);

export const TYPES_COURRIEL = ["FACTURE_PRESTATAIRE", "DOSSIER_REMBOURSEMENT"] as const;
export const typeCourrielSchema = z.enum(TYPES_COURRIEL);

export const SOURCES_DOSSIER = ["MANUEL", "ISA", "SAGE", "EXCEL"] as const;
export const sourceDossierSchema = z.enum(SOURCES_DOSSIER);

export const MOYENS_PAIEMENT = [
  "VIREMENT",
  "VIREMENT_BANCAIRE",
  "CHEQUE",
  "ESPECE",
  "PRELEVEMENT",
  "CARTE",
] as const;
export const moyenPaiementSchema = z.enum(MOYENS_PAIEMENT);

export const CHAMPS_GESTIONNAIRE = ["ACCUEIL", "TECHNIQUE", "COMPTABILITE"] as const;
export const champGestionnaireSchema = z.enum(CHAMPS_GESTIONNAIRE);

export const AVATAR_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const avatarSchema = z.enum(AVATAR_OPTIONS);

// ─── Prestations (source de vérité : src/lib/prestations.ts) ────────────────

/** Type de dossier = sous-type de prestation (ex : HOSPITALISATION_CHIRURGICAL). */
export const typeDossierSchema = z.enum(ALL_SOUS_TYPES as [string, ...string[]]);

/** Prestation de barème = type parent (ex : HOSPITALISATION). */
export const prestationParentSchema = z.enum(PARENT_TYPES as [string, ...string[]]);

/** Prestation acceptée pour les barèmes : parent OU sous-type (compatibilité
 *  avec les barèmes existants enregistrés sous un sous-type). */
export const prestationBaremeSchema = z.enum(
  [...PARENT_TYPES, ...ALL_SOUS_TYPES] as [string, ...string[]]
);
