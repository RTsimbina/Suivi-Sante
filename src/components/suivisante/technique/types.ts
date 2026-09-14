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
export type PrestationType = (typeof PRESTATIONS)[number];

export const PRESTATION_LABELS: Record<string, string> = { ...PARENT_LABELS };

// ─── Sociétés & Barèmes ─────────────────────────────────────────────────────

export interface BaremeRow {
  prestation: string;
  tauxCouverture: number;
  plafond: number;
  description: string;
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

export interface CalculResult {
  bareme: { tauxCouverture: number; plafond: number };
  montantCouvert: number;
  montantRembourse: number;
  ticketModerateur: number;
  explication: string;
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
  { key: 'totalAnalyses', label: 'Dossiers analysés', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'totalValides', label: 'Validés', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/40' },
  { key: 'totalRejetes', label: 'Rejetés', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40' },
  { key: 'enCours', label: 'En cours', icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'delaiMoyenAnalyse', label: 'Délai moyen (j)', icon: Clock, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40' },
  { key: 'montantTotalValide', label: 'Montant validé', icon: Currency, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', format: true },
];

export const PIE_COLORS = ['#f59e0b', '#10b981', '#ef4444'];
