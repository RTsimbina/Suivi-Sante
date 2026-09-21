import type { RoleType } from '@/lib/auth-context';

// ─── Assistant IA à questions prédéfinies — Types partagés ───────────────────
//
// Principes (cahier des charges) :
// 1. Aucune API d'IA externe : chaque question est associée à une requête
//    métier prédéfinie exécutée sur la base de la plateforme.
// 2. Sécurité côté serveur : le rôle, le périmètre (société / prestataire /
//    assuré) et les paramètres sont vérifiés et FORCÉS côté serveur.
// 3. L'assistant n'invente jamais de donnée : si aucune donnée ne correspond,
//    la réponse le dit explicitement.

// ─── Types de paramètres ─────────────────────────────────────────────────────

export type ParamKey =
  | 'PERIODE'      // Période prédéfinie ou personnalisée (du/au)
  | 'SOCIETE'      // Société cliente
  | 'PRESTATAIRE'  // Prestataire
  | 'ASSURE'       // Assuré
  | 'STATUT'       // Statut de dossier
  | 'ACTE'         // Acte / prestation (type parent de barème)
  | 'DOSSIER'      // Numéro de dossier
  | 'ANNEE';       // Année civile

export interface QuestionParamDef {
  key: ParamKey;
  label: string;
  required?: boolean;
  /** Libellé d'aide affiché sous le champ */
  aide?: string;
}

export interface ParamOption {
  id: string;
  label: string;
}

// ─── Périodes ────────────────────────────────────────────────────────────────

export type PeriodePreset =
  | 'AUJOURDHUI'
  | '7_DERNIERS_JOURS'
  | '30_DERNIERS_JOURS'
  | 'CE_MOIS'
  | 'MOIS_DERNIER'
  | 'TRIMESTRE_COURANT'
  | '90_DERNIERS_JOURS'
  | 'ANNEE_COURANTE'
  | 'ANNEE_DERNIERE'
  | 'PERSONNALISEE';

export const PERIODE_PRESETS: { id: PeriodePreset; label: string }[] = [
  { id: 'AUJOURDHUI', label: "Aujourd'hui" },
  { id: '7_DERNIERS_JOURS', label: '7 derniers jours' },
  { id: '30_DERNIERS_JOURS', label: '30 derniers jours' },
  { id: 'CE_MOIS', label: 'Ce mois' },
  { id: 'MOIS_DERNIER', label: 'Mois dernier' },
  { id: 'TRIMESTRE_COURANT', label: 'Trimestre courant' },
  { id: '90_DERNIERS_JOURS', label: '90 derniers jours' },
  { id: 'ANNEE_COURANTE', label: 'Année courante' },
  { id: 'ANNEE_DERNIERE', label: 'Année dernière' },
  { id: 'PERSONNALISEE', label: 'Personnalisée' },
];

export interface PeriodeParams {
  preset?: PeriodePreset;
  du?: string; // YYYY-MM-DD (si PERSONNALISEE)
  au?: string; // YYYY-MM-DD (si PERSONNALISEE)
}

export interface PeriodeResolue {
  du: Date;
  au: Date;
  label: string;
}

// ─── Présentation des résultats ──────────────────────────────────────────────

export type ResultType =
  | 'NOMBRE'    // Compteur (ex : nombre de dossiers)
  | 'MONTANT'   // Somme en Ariary
  | 'TABLEAU'   // Tableau de lignes agrégées
  | 'LISTE'     // Liste d'entités (tronquée, avec total)
  | 'GRAPHIQUE' // Série temporelle / barres
  | 'KPI'       // Plusieurs indicateurs regroupés
  | 'TEXTE';    // Réponse textuelle simple

export interface ResultColonne {
  key: string;
  label: string;
  type?: 'texte' | 'montant' | 'nombre' | 'date' | 'statut';
}

export interface ResultKpi {
  label: string;
  valeur: number;
  type: 'montant' | 'nombre' | 'pourcentage' | 'delai';
}

export interface AssistantResult {
  questionId: string;
  question: string;
  type: ResultType;
  titre: string;
  /** Phrase de synthèse construite à partir des données réelles */
  synthese: string;
  /** Valeur unique pour NOMBRE / MONTANT */
  valeur?: number;
  unite?: string;
  /** Colonnes + lignes pour TABLEAU / LISTE */
  colonnes?: ResultColonne[];
  lignes?: Record<string, string | number | null>[];
  totalLignes?: number;
  /** Série pour GRAPHIQUE */
  serie?: { label: string; valeur: number }[];
  serieNom?: string;
  /** Indicateurs pour KPI */
  kpis?: ResultKpi[];
  /** Période appliquée (si paramètre période) */
  periode?: { du: string; au: string; label: string } | null;
  date: string;
}

/** Résultat produit par une implémentation (identité ajoutée par le moteur) */
export type AssistantResultCore = Omit<AssistantResult, 'questionId' | 'question'>;

// ─── Contexte de sécurité (dérivé côté serveur uniquement) ───────────────────

export interface AssistantContext {
  userId: string;
  role: RoleType;
  email: string;
  nom: string;
  /** PORTAIL_CLIENT : dérivé du compte à la connexion (jamais du client) */
  assureId: string | null;
  /** PORTAIL_CLIENT / CONTACT_ENTREPRISE : dérivé du compte */
  societeId: string | null;
  /** PORTAIL_PRESTATAIRE : dérivé du compte */
  prestataireId: string | null;
}

/** Rôles internes : accès global (comme le reste de la plateforme) */
export const INTERNAL_ROLES: RoleType[] = [
  'ADMINISTRATEUR',
  'ACCUEIL',
  'TECHNIQUE',
  'COMPTABILITE',
  'SANTE',
];

// ─── Définition d'une question ───────────────────────────────────────────────

export type ParamValeurs = Partial<Record<ParamKey, string>>;

export interface QuestionDef {
  /** Identifiant interne, ex : COMPTA_TOTAL_FACTURES */
  id: string;
  /** Rôle propriétaire du catalogue (1 question = 1 rôle) */
  role: RoleType;
  /** Groupe fonctionnel affiché dans l'UI */
  categorie: string;
  /** Libellé de la question affiché à l'utilisateur */
  question: string;
  /** Paramètres éventuels */
  params: QuestionParamDef[];
  presentation: ResultType;
  /** Explication du mapping aux données réelles (affichée en info-bulle) */
  note?: string;
  /** Implémentation : requête prédéfinie + formatage du résultat */
  impl: (ctx: AssistantContext, params: ParamValeurs) => Promise<AssistantResultCore>;
}

// ─── Erreurs métier de l'assistant ───────────────────────────────────────────

export class AssistantError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
