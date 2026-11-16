/**
 * Types, constantes et helpers du Journal de Bord (refactoring P2 — extraits
 * du monolithe journal-view.tsx). Source unique partagée par le hook
 * use-journal-data et les présentateurs.
 */
import {
  Info, AlertTriangle, AlertCircle, AlertOctagon,
} from 'lucide-react';

export interface HistoriqueEntry {
  id: string;
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  modifiePar: string;
  modifieParId: string | null;
  /** Rôle de l'utilisateur au moment de l'opération (figé côté serveur). */
  roleUtilisateur?: string | null;
  dateModification: string;
  action: string;
  niveau: string;
  module: string | null;
  objet: string | null;
  societeId: string | null;
  ipAdresse: string | null;
  navigateur: string | null;
  sessionId: string | null;
  motif: string | null;
  metadonnees?: string | null;
  journalNumero: string;
  moduleLibelle: string;
}

export interface Stats {
  total: number;
  creations: number;
  modifications: number;
  suppressions: number;
  derniereModification: string | null;
  dernierAdministrateur: string | null;
}

export interface FilterOption {
  id: string;
  label: string;
}

export const MODULE_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'Bareme', label: 'Barèmes' },
  { value: 'Contrat', label: 'Contrats' },
  { value: 'Utilisateur', label: 'Utilisateurs' },
  { value: 'Societe', label: 'Sociétés' },
  { value: 'Prestataire', label: 'Prestataires' },
  { value: 'PrestataireSociete', label: 'Prestataire/Société' },
  { value: 'Assure', label: 'Assurés' },
];

export const ACTION_OPTIONS = [
  { value: '', label: 'Toutes' },
  { value: 'CREATION', label: '➕ Création' },
  { value: 'MODIFICATION', label: '✏️ Modification' },
  { value: 'SUPPRESSION', label: '🗑 Suppression' },
  { value: 'EXCEPTION_DOUBLON', label: '⚠️ Exception doublon' },
  { value: 'CONSULTATION', label: '🔍 Consultation' },
];

export const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'INFO', label: '🟢 Information' },
  { value: 'STANDARD', label: '🟡 Standard' },
  { value: 'SENSIBLE', label: '🟠 Sensible' },
  { value: 'CRITIQUE', label: '🔴 Critique' },
];

export const NIVEAU_CONFIG: Record<string, { icon: typeof Info; bg: string; text: string; border: string; dot: string }> = {
  INFO:     { icon: Info,          bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900', dot: 'bg-emerald-500' },
  STANDARD: { icon: AlertTriangle,  bg: 'bg-amber-50 dark:bg-amber-950/40',    text: 'text-amber-700 dark:text-amber-400',    border: 'border-amber-200 dark:border-amber-900',    dot: 'bg-amber-500' },
  SENSIBLE: { icon: AlertCircle,    bg: 'bg-orange-50 dark:bg-orange-950/40',   text: 'text-orange-700 dark:text-orange-400',   border: 'border-orange-200 dark:border-orange-900',   dot: 'bg-orange-500' },
  CRITIQUE: { icon: AlertOctagon,   bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-400',       border: 'border-red-200 dark:border-red-900',       dot: 'bg-red-500' },
};

export const ACTION_CONFIG: Record<string, { icon: string; bg: string; text: string }> = {
  CREATION:     { icon: '➕', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400' },
  MODIFICATION: { icon: '✏️', bg: 'bg-blue-50 dark:bg-blue-950/40',    text: 'text-blue-700 dark:text-blue-400' },
  SUPPRESSION:  { icon: '🗑', bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-400' },
  CONSULTATION: { icon: '🔍', bg: 'bg-slate-100 dark:bg-slate-950/40',  text: 'text-slate-600 dark:text-slate-400' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export function getNiveauConfig(niveau: string) {
  return NIVEAU_CONFIG[niveau] || NIVEAU_CONFIG.STANDARD;
}

export function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || ACTION_CONFIG.MODIFICATION;
}

export function truncate(str: string | null, max: number): string {
  if (!str) return '-';
  return str.length > max ? str.slice(0, max) + '...' : str;
}
