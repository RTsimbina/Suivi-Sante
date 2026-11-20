'use client';

/**
 * Types, constantes et helpers partagés de la vue Technique.
 * Extrait de technique-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Currency,
} from 'lucide-react';

import { PARENT_TYPES, PARENT_LABELS } from '@/lib/prestations';

// ─── KPIs reçus par la vue (calculés côté serveur) ──────────────────────────

export interface TechniqueKpis {
  technique: {
    totalAnalyses: number;
    totalValides: number;
    totalRejetes: number;
    delaiMoyenAnalyse: number;
    montantTotalValide: number;
    enCours: number;
  };
  productivite: {
    gestionnaireNom: string;
    service: string;
    nbDossiers: number;
    montantTraite: number;
    tempsMoyenTraitement: number;
  }[];
}

// ─── Prestations ────────────────────────────────────────────────────────────

export const PRESTATIONS = [...PARENT_TYPES] as const;

export const PRESTATION_LABELS: Record<string, string> = { ...PARENT_LABELS };

// ─── Sociétés & Barèmes ─────────────────────────────────────────────────────

export interface BaremeRow {
  prestation: string;
  tauxCouverture: number;
  plafond: number;
  description: string;
  // ─── P1 « Validité datée » : versionnement et période (affichés côté UI) ──
  id?: string;
  version?: number;
  valideDu?: string | Date | null;
  valideAu?: string | Date | null;
}

export interface Societe {
  id: string;
  nom: string;
  baremes: BaremeRow[];
  nbDossiers?: number;
  nbBaremes?: number;
}

export const emptyBaremes = (): BaremeRow[] =>
  PRESTATIONS.map((p) => ({
    prestation: p,
    tauxCouverture: 0,
    plafond: 0,
    description: '',
  }));

// ─── Calcul ticket modérateur ───────────────────────────────────────────────

/** Assuré sélectionnable du simulateur (P2-04 : le calcul exige sa consommation). */
export interface AssureOption {
  id: string;
  nom: string;
  prenom: string | null;
  matricule: string | null;
  typeBeneficiaire: string;
}

/**
 * P2-04 : le résultat provient du BACKEND (POST /api/sante/simuler-acte →
 * src/lib/services/calcul-remboursement.ts, source unique de vérité). Le
 * simulateur n'additionne plus rien localement — il affiche la décomposition
 * métier : prise en charge théorique / autorisée, plafond restant,
 * part contractuelle de l'assuré, dépassement du plafond.
 */
export interface CalculResult {
  bareme: { tauxCouverture: number; plafond: number };
  /** Montant soumis au taux : min(dépense, plafond restant). */
  montantCouvert: number;
  /** Prise en charge AUTORISÉE de l'assureur (plafonnée après taux). */
  montantRembourse: number;
  /** Charge totale de l'assuré (part contractuelle + dépassement). */
  ticketModerateur: number;
  explication: string;
  // Décomposition métier (backend source de vérité)
  priseEnChargeTheorique?: number;
  consommationAnterieure?: number;
  plafondRestant?: number;
  partContractuelleAssure?: number;
  depassementPlafond?: number;
  autorise?: boolean;
}

// ─── Import ISA ─────────────────────────────────────────────────────────────

export interface ImportResult {
  nbLignes: number;
  nbSucces: number;
  nbErreurs: number;
  tauxSucces: number;
  erreurs: { ligne: number; message: string }[];
}

// ─── Exclusions / Dépassements ──────────────────────────────────────────────

export interface ExclusionRow {
  id: string;
  numeroDossier: string;
  beneficiaire: string;
  societeNom: string;
  typeDossier: string;
  montantReclame: number;
  montantValide: number | null;
  montantTheorique: number;
  plafondApplique: number | null;
  tauxCouverture: number | null;
  ticketModerateur: number | null;
  statut: string;
  motifRejet: string | null;
  typeEcart: 'depassement' | 'exclusion' | 'rejete';
  ecart: number;
  pourcentageCouvert: number;
}

// ─── Définitions d'affichage ────────────────────────────────────────────────

export const kpiDefs = [
  { key: 'totalAnalyses', label: 'Dossiers analysés', icon: ClipboardCheck, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/40' },
  { key: 'totalValides', label: 'Validés', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/40' },
  { key: 'totalRejetes', label: 'Rejetés', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40' },
  { key: 'enCours', label: 'En cours', icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'delaiMoyenAnalyse', label: 'Délai moyen (j)', icon: Clock, color: 'text-info-600', bg: 'bg-info-50 dark:bg-info-950/40' },
  { key: 'montantTotalValide', label: 'Montant validé', icon: Currency, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/40', format: true },
];

export const PIE_COLORS = ['#f59e0b', '#10b981', '#ef4444'];
