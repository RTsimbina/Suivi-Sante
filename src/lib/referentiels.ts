// ─── Référentiels métier — Source de vérité unique ──────────────────────────
// Toutes les listes de valeurs de référence de la plateforme vivent ICI.
// Les vues, les APIs, les imports et les formulaires doivent importer ces
// constantes au lieu de redéfinir leurs propres listes en dur.
//
// Pour les statuts workflow (Dossier, Contrat, AppelDeFonds, Courriel),
// voir src/lib/statuts.ts. Pour les prestations, voir src/lib/prestations.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReferentielItem {
  /** Valeur technique stockée en base */
  valeur: string;
  /** Libellé français affiché (identique partout) */
  label: string;
}

// ─── Rôles utilisateurs ─────────────────────────────────────────────────────

/** Les 7 rôles de la plateforme (identiques à RoleType de auth-context). */
export const ROLES = [
  'ADMINISTRATEUR',
  'ACCUEIL',
  'TECHNIQUE',
  'COMPTABILITE',
  'SANTE',
  'PORTAIL_CLIENT',
  'CONTACT_ENTREPRISE',
  'PRESTATAIRE',
] as const;

export type RoleValeur = (typeof ROLES)[number];

/** Libellés lisibles des rôles (avec accents — référence unique). */
export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATEUR: 'Administrateur',
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Service Technique',
  COMPTABILITE: 'Comptabilité',
  SANTE: 'Contrôle Santé',
  PORTAIL_CLIENT: 'Client / Assuré',
  CONTACT_ENTREPRISE: 'Entreprise Cliente',
  PRESTATAIRE: 'Prestataire',
};

/** Rôles internes (personnel de la caisse) — peuvent voir les commentaires privés. */
export const INTERNAL_ROLES: string[] = [
  'ADMINISTRATEUR',
  'ACCUEIL',
  'TECHNIQUE',
  'COMPTABILITE',
  'SANTE',
];

/** Rôles externes : périmètre forcé sur la société rattachée au compte. */
export const EXTERNAL_ROLES = ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE'] as const;

export function isRoleInterne(role: string | undefined | null): boolean {
  return !!role && INTERNAL_ROLES.includes(role);
}

/** Couleurs de badges par rôle (affichage uniforme des listes d'utilisateurs). */
export const ROLE_COLORS: Record<string, string> = {
  ADMINISTRATEUR: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
  ACCUEIL: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
  TECHNIQUE: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
  COMPTABILITE: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  SANTE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  PORTAIL_CLIENT: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  CONTACT_ENTREPRISE: 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300',
  PRESTATAIRE: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
};

// ─── Services des Gestionnaires ─────────────────────────────────────────────

/** Valeurs du champ Gestionnaire.service (telles qu'en base). */
export const SERVICES_GESTIONNAIRE: ReferentielItem[] = [
  { valeur: 'ACCUEIL', label: 'Accueil' },
  { valeur: 'TECHNIQUE', label: 'Service Technique' },
  { valeur: 'COMPTABILITE', label: 'Comptabilité' },
];

export function serviceGestionnaireLabel(service: string): string {
  return SERVICES_GESTIONNAIRE.find((s) => s.valeur === service)?.label ?? service;
}

// ─── Moyens de paiement ─────────────────────────────────────────────────────

/** Valeurs canoniques du champ Dossier.moyenPaiement. */
export const MOYENS_PAIEMENT: ReferentielItem[] = [
  { valeur: 'VIREMENT', label: 'Virement' },
  { valeur: 'CHEQUE', label: 'Chèque' },
  { valeur: 'ESPECES', label: 'Espèces' },
  { valeur: 'MOBILE_MONEY', label: 'Mobile Money' },
  { valeur: 'PRELEVEMENT', label: 'Prélèvement' },
  { valeur: 'CARTE', label: 'Carte bancaire' },
  { valeur: 'AUTRE', label: 'Autre' },
];

export const MOYEN_PAIEMENT_VALEURS: string[] = MOYENS_PAIEMENT.map((m) => m.valeur);

/**
 * Alias historiques → valeur canonique.
 * Les imports comptables (SAGE, suivi) peuvent livrer des variantes.
 */
export const MOYEN_PAIEMENT_ALIASES: Record<string, string> = {
  ESPECE: 'ESPECES',
  VIREMENT_BANCAIRE: 'VIREMENT',
  VB: 'VIREMENT',
  VIR: 'VIREMENT',
  CHQ: 'CHEQUE',
  MM: 'MOBILE_MONEY',
  MVOLA: 'MOBILE_MONEY',
  ORANGE_MONEY: 'MOBILE_MONEY',
  AIRTEL: 'MOBILE_MONEY',
  CB: 'CARTE',
  CARTTE: 'CARTE',
};

export function moyenPaiementLabel(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const canonique = normaliserMoyenPaiement(valeur);
  return MOYENS_PAIEMENT.find((m) => m.valeur === canonique)?.label ?? valeur;
}

/**
 * Normalise un moyen de paiement vers sa valeur canonique.
 * Retourne la valeur d'entrée en majuscules si aucun alias/canon ne correspond
 * (les valeurs libres historiques restent affichables).
 */
export function normaliserMoyenPaiement(valeur: string | null | undefined): string {
  if (!valeur) return '';
  // Majuscules + suppression des diacritiques (Espèces → ESPECES, Chèque → CHEQUE)
  const base = valeur
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (MOYEN_PAIEMENT_VALEURS.includes(base)) return base;
  // Espaces / tirets → underscore (Virement bancaire → VIREMENT_BANCAIRE)
  const v = base.replace(/[\s-]+/g, '_');
  if (MOYEN_PAIEMENT_VALEURS.includes(v)) return v;
  if (MOYEN_PAIEMENT_ALIASES[v]) return MOYEN_PAIEMENT_ALIASES[v];
  if (MOYEN_PAIEMENT_ALIASES[base]) return MOYEN_PAIEMENT_ALIASES[base];
  return v;
}

// ─── Catégories de dossier ──────────────────────────────────────────────────

export const CATEGORIES_DOSSIER: ReferentielItem[] = [
  { valeur: 'REMBOURSEMENT_ASSURE', label: 'Remboursement Assuré' },
  { valeur: 'REGLEMENT_PRESTATAIRE', label: 'Règlement Prestataire' },
];

export const CATEGORIE_DOSSIER_VALEURS: string[] = CATEGORIES_DOSSIER.map((c) => c.valeur);

export function categorieDossierLabel(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  return CATEGORIES_DOSSIER.find((c) => c.valeur === valeur)?.label ?? valeur;
}

// ─── Types de justificatif ──────────────────────────────────────────────────

export const TYPES_JUSTIFICATIF: ReferentielItem[] = [
  { valeur: 'FACTURE', label: 'Facture' },
  { valeur: 'ORDONNANCE', label: 'Ordonnance' },
  { valeur: 'RIB', label: 'RIB' },
  { valeur: 'CARNET_SOINS', label: 'Carnet de soins' },
  { valeur: 'DECOMPTE', label: 'Décompte' },
  { valeur: 'AUTRE', label: 'Autre' },
];

export const TYPE_JUSTIFICATIF_VALEURS: string[] = TYPES_JUSTIFICATIF.map((t) => t.valeur);

export function typeJustificatifLabel(valeur: string): string {
  return TYPES_JUSTIFICATIF.find((t) => t.valeur === valeur)?.label ?? valeur;
}

// ─── Types de prestataire ───────────────────────────────────────────────────

export const TYPES_PRESTATAIRE: ReferentielItem[] = [
  { valeur: 'HOPITAL', label: 'Hôpital' },
  { valeur: 'CLINIQUE', label: 'Clinique' },
  { valeur: 'PHARMACIE', label: 'Pharmacie' },
  { valeur: 'CABINET_MEDICAL', label: 'Cabinet médical' },
  { valeur: 'LABORATOIRE', label: 'Laboratoire' },
  { valeur: 'DENTAIRE', label: 'Cabinet dentaire' },
  { valeur: 'OPTICIEN', label: 'Opticien' },
  { valeur: 'AUTRE', label: 'Autre' },
];

export const TYPE_PRESTATAIRE_VALEURS: string[] = TYPES_PRESTATAIRE.map((t) => t.valeur);

export function typePrestataireLabel(valeur: string): string {
  return TYPES_PRESTATAIRE.find((t) => t.valeur === valeur)?.label ?? valeur;
}

/** Statuts juridiques suggérés pour les prestataires (champ libre conservé). */
export const STATUTS_JURIDIQUES_PRESTATAIRE: string[] = [
  'SA', 'SARL', 'SAS', 'EI', 'AUTO_ENTREPRENEUR', 'ONG', 'ASSOCIATION', 'AUTRE',
];

// ─── Types de courriel (réception) ──────────────────────────────────────────

export const TYPES_COURRIEL: ReferentielItem[] = [
  { valeur: 'FACTURE_PRESTATAIRE', label: 'Facture prestataire' },
  { valeur: 'DOSSIER_REMBOURSEMENT', label: 'Dossier de remboursement' },
];

export const TYPE_COURRIEL_VALEURS: string[] = TYPES_COURRIEL.map((t) => t.valeur);

export function typeCourrielLabel(valeur: string): string {
  return TYPES_COURRIEL.find((t) => t.valeur === valeur)?.label ?? valeur;
}

// ─── Types de bénéficiaire (Assure.typeBeneficiaire) ────────────────────────

export const TYPES_BENEFICIAIRE: ReferentielItem[] = [
  { valeur: 'ASSURE', label: 'Assuré' },
  { valeur: 'CONJOINT', label: 'Conjoint' },
  { valeur: 'ENFANT', label: 'Enfant' },
];

export const TYPE_BENEFICIAIRE_VALEURS: string[] = TYPES_BENEFICIAIRE.map((t) => t.valeur);

export function typeBeneficiaireLabel(valeur: string): string {
  return TYPES_BENEFICIAIRE.find((t) => t.valeur === valeur)?.label ?? valeur;
}

/** Alias de normalisation pour les imports Excel (majuscules/minuscules libres). */
export const TYPE_BENEFICIAIRE_ALIASES: Record<string, string> = {
  ASSURE_PRINCIPAL: 'ASSURE',
  'ASSURE PRINCIPAL': 'ASSURE',
  AYANT_DROIT: 'CONJOINT',
};

export function normaliserTypeBeneficiaire(valeur: string | null | undefined): string {
  if (!valeur) return '';
  const v = valeur.trim().toUpperCase();
  if (TYPE_BENEFICIAIRE_VALEURS.includes(v)) return v;
  if (TYPE_BENEFICIAIRE_ALIASES[v]) return TYPE_BENEFICIAIRE_ALIASES[v];
  return v;
}

// ─── Canaux bot ─────────────────────────────────────────────────────────────

export const CANAUX_BOT: ReferentielItem[] = [
  { valeur: 'WHATSAPP', label: 'WhatsApp' },
  { valeur: 'TELEGRAM', label: 'Telegram' },
  { valeur: 'MESSENGER', label: 'Messenger' },
];

export const CANAL_BOT_VALEURS: string[] = CANAUX_BOT.map((c) => c.valeur);

// ─── Sources de création d'un dossier ───────────────────────────────────────

export const SOURCES_DOSSIER: ReferentielItem[] = [
  { valeur: 'EXCEL', label: 'Import Excel' },
  { valeur: 'MANUEL', label: 'Saisie manuelle' },
  { valeur: 'ISA', label: 'Import ISA' },
  { valeur: 'SAGE', label: 'Import SAGE' },
];

export function sourceDossierLabel(valeur: string): string {
  return SOURCES_DOSSIER.find((s) => s.valeur === valeur)?.label ?? valeur;
}

// ─── Sexe ───────────────────────────────────────────────────────────────────

export const SEXES: ReferentielItem[] = [
  { valeur: 'M', label: 'Masculin' },
  { valeur: 'F', label: 'Féminin' },
];

export function sexeLabel(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  return SEXES.find((s) => s.valeur === valeur)?.label ?? valeur;
}

// ─── Statuts d'une ligne d'import (ImportDossier.statutImport) ──────────────

export const STATUTS_IMPORT: ReferentielItem[] = [
  { valeur: 'SUCCES', label: 'Succès' },
  { valeur: 'ERREUR', label: 'Erreur' },
  { valeur: 'IGNOREE', label: 'Ignorée' },
];

export const STATUT_IMPORT_VALEURS: string[] = STATUTS_IMPORT.map((s) => s.valeur);

// ─── Journal d'audit : actions et niveaux ───────────────────────────────────

export type AuditAction = 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
export type AuditNiveau = 'INFO' | 'STANDARD' | 'SENSIBLE' | 'CRITIQUE';

export const AUDIT_ACTION_ITEMS: { value: AuditAction; label: string }[] = [
  { value: 'CREATION', label: 'Création' },
  { value: 'MODIFICATION', label: 'Modification' },
  { value: 'SUPPRESSION', label: 'Suppression' },
];

export const AUDIT_NIVEAU_ITEMS: { value: AuditNiveau; label: string; color: string }[] = [
  { value: 'INFO', label: 'Information', color: 'emerald' },
  { value: 'STANDARD', label: 'Standard', color: 'amber' },
  { value: 'SENSIBLE', label: 'Sensible', color: 'orange' },
  { value: 'CRITIQUE', label: 'Critique', color: 'red' },
];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_ITEMS.find((a) => a.value === action)?.label ?? action;
}

export function auditNiveauLabel(niveau: string): string {
  return AUDIT_NIVEAU_ITEMS.find((n) => n.value === niveau)?.label ?? niveau;
}

// ─── Validation d'un référentiel (contrôle d'intégrité interne) ─────────────

/**
 * Vérifie qu'un référentiel ne contient pas de doublons de valeurs
 * ni de libellés vides. Utilisé par les tests de non-régression.
 */
export function referentielValide(items: ReferentielItem[]): boolean {
  const valeurs = items.map((i) => i.valeur);
  const unique = new Set(valeurs);
  return (
    unique.size === valeurs.length &&
    items.every((i) => i.valeur.length > 0 && i.label.length > 0)
  );
}
