// ─── Schémas Zod — Réception, emails, profil, auth, reporting, santé, ───────
//     portail, chat, session
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  avatarSchema,
  dateOptionnelle,
  emailOptionnel,
  emailSchema,
  idOptionnel,
  idSchema,
  montantNonNegatifOptionnel,
  motDePasseSchema,
  statutCourrielSchema,
  typeCourrielSchema,
  texteOptionnel,
  texteCourt,
} from "./common";

// ─── Réception des courriels (/api/reception/courriels) ─────────────────────

export const courrielCreateSchema = z.object({
  type: typeCourrielSchema,
  expediteur: texteCourt(200, "L'expéditeur"),
  objet: texteCourt(300, "L'objet"),
  societeId: idOptionnel,
  beneficiaire: texteOptionnel(200),
  // FIX audit : le PATCH de cette ressource ne contrôlait pas le montant —
  // même règle pour POST et PATCH maintenant.
  montant: montantNonNegatifOptionnel,
  dateCourriel: dateOptionnelle,
  dateSoins: dateOptionnelle,
  prestataire: texteOptionnel(200),
});

export const courrielUpdateSchema = z.object({
  statut: statutCourrielSchema.optional(),
  observations: texteOptionnel(2000),
  dossierId: idOptionnel,
  societeId: idOptionnel,
  beneficiaire: texteOptionnel(200),
  // FIX audit : aucun contrôle type/positivité sur le PATCH avant.
  montant: montantNonNegatifOptionnel,
  dateSoins: dateOptionnelle,
  prestataire: texteOptionnel(200),
  objet: texteOptionnel(300),
});

// ─── Configuration SMTP (/api/email-config) ─────────────────────────────────

const smtpPortSchema = z.coerce
  .number()
  .int("Le port SMTP doit être un entier")
  .min(1, "Port SMTP invalide")
  .max(65535, "Port SMTP invalide")
  .default(587);

export const emailConfigSchema = z.object({
  smtpHost: texteCourt(200, "Le serveur SMTP"),
  smtpUser: texteCourt(200, "L'utilisateur SMTP"),
  smtpPass: z.string().min(1, "Le mot de passe SMTP est requis"),
  smtpFrom: emailSchema,
  smtpPort: smtpPortSchema,
  emailRapportDestinataire: emailOptionnel,
  actif: z.boolean().optional(),
});

/** POST /api/email-config — test de connexion SMTP. */
export const emailConfigTestSchema = z.object({
  smtpHost: texteCourt(200, "Le serveur SMTP"),
  smtpUser: texteCourt(200, "L'utilisateur SMTP"),
  smtpPass: z.string().min(1, "Le mot de passe SMTP est requis"),
  smtpPort: smtpPortSchema,
});

// ─── Profil (/api/profil) ───────────────────────────────────────────────────

export const changerMotDePasseSchema = z.object({
  ancienMotDePasse: z.string().min(1, "L'ancien mot de passe est requis"),
  nouveauMotDePasse: motDePasseSchema,
});

export const avatarUpdateSchema = z.object({
  avatar: avatarSchema.nullable(),
});

// ─── Authentification (routes publiques) ────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Le token de réinitialisation est requis"),
  newPassword: motDePasseSchema,
});

export const lockoutCheckSchema = z.object({
  email: emailSchema,
});

// ─── Reporting (/api/reporting/rapport) ─────────────────────────────────────

export const rapportMensuelSchema = z.object({
  mois: z.coerce
    .number()
    .int("Le mois doit être un entier")
    .min(1, "Le mois doit être compris entre 1 et 12")
    .max(12, "Le mois doit être compris entre 1 et 12"),
  annee: z.coerce
    .number()
    .int("L'année doit être un entier")
    .min(2000, "Année invalide")
    .max(2100, "Année invalide"),
  destinataires: z
    .array(emailSchema)
    .max(20, "20 destinataires maximum")
    .optional(),
});

// ─── Santé (/api/sante) ─────────────────────────────────────────────────────

export const simulerActeSchema = z.object({
  assureId: idSchema,
  typeActe: texteCourt(100, "Le type d'acte"),
  montantDemande: z.coerce
    .number()
    .finite("Le montant doit être un nombre valide")
    .positive("Le montant demandé doit être strictement positif"),
  prestataireId: idOptionnel,
});

export const verifierAssureSchema = z.object({
  identifiant: texteCourt(200, "L'identifiant de l'assuré"),
});

// ─── Portail public & chat ──────────────────────────────────────────────────

export const portailSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "La recherche doit contenir au moins 2 caractères")
    .max(200, "La recherche ne peut pas dépasser 200 caractères"),
});

export const chatSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "La question est requise")
    .max(2000, "La question ne peut pas dépasser 2000 caractères"),
});
