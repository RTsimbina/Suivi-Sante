/**
 * Types et constantes partagés de la vue Prestataires.
 * Extraits de prestataires-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { TYPES_PRESTATAIRE } from '@/lib/referentiels';

export interface SocieteItem {
  id: string;
  nom: string;
}

/** Fiche complète d'un prestataire (réponse de GET /api/prestataires et /api/prestataires/[id]). */
export interface PrestataireItem {
  id: string;
  nom: string;
  type: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  stat: string | null;
  statutJuridique: string | null;
  /** Statut conventionnel (CONVENTIONNE / SUSPENDU / libre). */
  statut: string | null;
  rib: string | null;
  iban: string | null;
  code: string | null;
  actif: boolean;
  /** Doublon(s) dérogé(s) explicitement validés par un Administrateur. */
  exceptionValidee: boolean;
  groupePrestataire: { id: string; nom: string } | null;
  societes: { societe: { id: string; nom: string }; actif: boolean }[];
  nbDossiers?: number;
}

/** Groupe de prestataires (liste pour filtres et formulaires). */
export interface GroupeItem {
  id: string;
  nom: string;
}

/** Un doublon renvoyé par l'API (409) : information déjà existante affichée. */
export interface DoublonInfo {
  champ: string;
  valeur: string;
  prestataireExistantId: string;
  prestataireExistantNom: string;
  prestataireExistantCode: string | null;
}

export interface LienPS {
  id: string;
  prestataireId: string;
  societeId: string;
  actif: boolean;
  prestataire: PrestataireItem;
  societe: { id: string; nom: string };
  nbDossiers?: number;
  montantTotal?: number;
}

/** Compteurs agrégés par société (dérivés des liens). */
export interface SocieteStats {
  total: number;
  actifs: number;
  inactifs: number;
  nbDossiers: number;
  montantTotal: number;
}

/** Filtre de statut du tableau des liens. */
export type StatutFilter = '' | 'actif' | 'inactif';

/** Formulaire de création / modification d'un prestataire. */
export interface CreateFormState {
  nom: string;
  type: string;
  code: string;
  telephone: string;
  email: string;
  adresse: string;
  nif: string;
  stat: string;
  statutJuridique: string;
  statut: string;
  rib: string;
  iban: string;
  groupePrestataireId: string;
}

export const EMPTY_CREATE_FORM: CreateFormState = {
  nom: '', type: '', code: '', telephone: '', email: '', adresse: '', nif: '', stat: '',
  statutJuridique: '', statut: '', rib: '', iban: '', groupePrestataireId: '',
};

/** Formulaire de modification d'un prestataire (champs éditables de la fiche). */
export type EditFormState = CreateFormState;

export const STATUTS_CONVENTIONNELS = ['CONVENTIONNE', 'SUSPENDU'] as const;

export const STATUT_CONVENTIONNEL_LABELS: Record<string, string> = {
  CONVENTIONNE: 'Conventionné',
  SUSPENDU: 'Suspendu',
};

/** Référentiel centralisé des statuts juridiques (source unique : referentiels.ts). */
export { STATUTS_JURIDIQUES_PRESTATAIRE, STATUT_JURIDIQUE_LABELS } from '@/lib/referentiels';

export const TYPE_LABELS: Record<string, string> = {
  HOPITAL: 'Hôpital',
  CLINIQUE: 'Clinique',
  PHARMACIE: 'Pharmacie',
  CABINET_MEDICAL: 'Cabinet médical',
  LABORATOIRE: 'Laboratoire',
  DENTAIRE: 'Dentaire',
  OPTICIEN: 'Opticien',
  AUTRE: 'Autre',
};

export const TYPE_COLORS: Record<string, string> = {
  HOPITAL: 'bg-red-100 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  CLINIQUE: 'bg-blue-100 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  PHARMACIE: 'bg-green-100 text-green-700 border-green-200',
  CABINET_MEDICAL: 'bg-purple-100 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  LABORATOIRE: 'bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  DENTAIRE: 'bg-pink-100 text-pink-700 border-pink-200',
  OPTICIEN: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  AUTRE: 'bg-muted text-muted-foreground border-border',
};

/** Pré-remplit le formulaire de modification depuis la fiche du prestataire. */
export function formulaireDepuisPrestataire(p: PrestataireItem): EditFormState {
  return {
    nom: p.nom ?? '',
    type: p.type ?? '',
    code: p.code ?? '',
    telephone: p.telephone ?? '',
    email: p.email ?? '',
    adresse: p.adresse ?? '',
    nif: p.nif ?? '',
    stat: p.stat ?? '',
    statutJuridique: p.statutJuridique ?? '',
    statut: p.statut ?? '',
    rib: p.rib ?? '',
    iban: p.iban ?? '',
    groupePrestataireId: p.groupePrestataire?.id ?? '',
  };
}
