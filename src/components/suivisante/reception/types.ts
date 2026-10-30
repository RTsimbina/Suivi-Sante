/**
 * Types et constantes partagés du module Réception (refactoring P2).
 * Extraits tels quels de l'ancien monolithe reception-view.tsx.
 */
import { COURRIEL_STATUTS } from '@/lib/statuts';

export interface CourrielItem {
  id: string;
  type: string;
  expediteur: string;
  objet: string;
  societeId: string | null;
  societe: { id: string; nom: string } | null;
  beneficiaire: string | null;
  montant: number | null;
  dateCourriel: string;
  dateSoins: string | null;
  prestataire: string | null;
  statut: string;
  traitePar: string | null;
  dateTraitement: string | null;
  observations: string | null;
  dossierId: string | null;
  dossier: { id: string; numeroDossier: string } | null;
  createdAt: string;
}

export interface SocieteOption {
  id: string;
  nom: string;
}

/* ── Libellés et couleurs des types de courriel ── */

export const TYPE_LABELS: Record<string, string> = {
  FACTURE_PRESTATAIRE: 'Facture prestataire',
  DOSSIER_REMBOURSEMENT: 'Dossier remboursement',
};

export const TYPE_COLORS: Record<string, string> = {
  FACTURE_PRESTATAIRE: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 border-orange-200',
  DOSSIER_REMBOURSEMENT: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
};

/* ── Statuts courriel — délégués à la source de vérité (statuts.ts) ── */

export const COURRIEL_STATUT_COLORS: Record<string, string> = Object.fromEntries(
  COURRIEL_STATUTS.map((s) => [s.valeur, s.badge])
);

export const COURRIEL_STATUT_LABELS: Record<string, string> = Object.fromEntries(
  COURRIEL_STATUTS.map((s) => [s.valeur, s.label])
);
