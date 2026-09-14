'use client';

/**
 * Types et constantes partagés de la vue Sociétés.
 * Extrait de societes-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

// ─── Société (liste) ────────────────────────────────────────────────────────

export interface Societe {
  id: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  nif?: string;
  contactPrincipal?: string;
  actif: boolean;
  createdAt: string;
  _count: { dossiers: number; contrats: number; assures: number; baremes: number };
}

// ─── Détails d'une société ──────────────────────────────────────────────────

export interface BaremeDetail {
  id: string;
  prestation: string;
  tauxCouverture: number;
  plafond: number;
  description?: string;
  active: boolean;
}

export interface AssureDetail {
  id: string;
  nom: string;
  prenom?: string;
  nSS?: string;
  matricule?: string;
  typeBeneficiaire?: string;
  codeFamille?: string;
  dateNaissance?: string;
  dateEffet?: string;
  bareme?: number | null;
  telephone?: string;
  email?: string;
  actif: boolean;
  _count: { dossiers: number };
}

export interface PrestataireDetail {
  id: string;
  lienId: string;
  nom: string;
  type: string;
  telephone?: string;
  actifGlobal: boolean;
  actifSociete: boolean;
  nbDossiers: number;
  montantTotal: number;
}

export interface SocieteDetails {
  baremes: BaremeDetail[];
  assures: AssureDetail[];
  prestataires: PrestataireDetail[];
}

export type DetailTab = 'baremes' | 'assures' | 'prestataires' | 'contacts';

export interface ContratInfo {
  reference: string;
  budgetAnnuel: number;
  budgetUtilise: number;
  solde: number;
  statut: string;
  dateFin: string;
}

// ─── Contacts entreprise ────────────────────────────────────────────────────

export interface EntrepriseContact {
  id: string;
  societeId: string;
  nom: string;
  prenom?: string;
  fonction?: string;
  telephone?: string;
  email?: string;
  actif: boolean;
  createdAt: string;
}

// ─── Libellés d'affichage ───────────────────────────────────────────────────

export const TYPE_BENEF_LABELS: Record<string, string> = {
  ASSURE: 'Assuré', CONJOINT: 'Conjoint', ENFANT: 'Enfant',
};

export const TYPE_BENEF_COLORS: Record<string, string> = {
  ASSURE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  CONJOINT: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  ENFANT: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

export const PRESTA_TYPE_LABELS: Record<string, string> = {
  HOPITAL: 'Hôpital', CLINIQUE: 'Clinique', PHARMACIE: 'Pharmacie',
  CABINET_MEDICAL: 'Cabinet médical', LABORATOIRE: 'Laboratoire',
  DENTAIRE: 'Dentaire', OPTICIEN: 'Opticien', AUTRE: 'Autre',
};
