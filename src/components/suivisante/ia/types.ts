/**
 * Types, libellés et helpers de risque de la vue Intelligence IA (refactoring
 * P2 — extraits du monolithe ia-view.tsx). Source unique partagée par le hook
 * use-ia-data et les présentateurs.
 */

export interface RetardIa {
  numeroDossier: string;
  beneficiaire: string;
  statut: string;
  joursRetard: number;
  serviceEnCause: string;
}

export interface AnomalieIa {
  numeroDossier: string;
  typeAnomalie: string;
  details: string;
}

export interface PieceManquanteIa {
  numeroDossier: string;
  beneficiaire: string;
  societeNom: string;
  joursEnAnalyse: number;
}

export interface IncoherenceIa {
  numeroDossier: string;
  typeIncoherence: string;
  description: string;
}

export interface PrevisionIa {
  volumeAttendu: number;
  chargeParGestionnaire: {
    nom: string;
    service: string;
    dossiersActifs: number;
    chargeEstimee: number;
  }[];
  risqueRetard: number;
}

export interface IaData {
  retards: RetardIa[];
  anomalies: AnomalieIa[];
  piecesManquantes: PieceManquanteIa[];
  incoherences: IncoherenceIa[];
  previsions: PrevisionIa;
}

export const anomalieLabel: Record<string, string> = {
  ECART_MONTANT: 'Écart de montant',
  DECOMPTE_MANQUANT: 'Décompte manquant',
};

export const incoherenceLabel: Record<string, string> = {
  PAYE_SANS_MONTANT: 'Payé sans montant',
  PAIEMENT_SANS_DECOMPTE: 'Paiement sans décompte',
  VALIDE_SANS_MONTANT: 'Validé sans montant',
  REJET_SANS_MOTIF: 'Rejeté sans motif',
  DATE_INCOHERENTE: 'Date incohérente',
};

export function getRisqueColor(risque: number): string {
  if (risque > 30) return 'bg-red-50 dark:bg-red-950/400';
  if (risque > 15) return 'bg-amber-50 dark:bg-amber-950/400';
  return 'bg-emerald-50 dark:bg-emerald-950/400';
}

export function getRisqueTextColor(risque: number): string {
  if (risque > 30) return 'text-red-600';
  if (risque > 15) return 'text-amber-600';
  return 'text-emerald-600';
}

export function getRisqueLabel(risque: number): string {
  if (risque > 30) return 'Élevé';
  if (risque > 15) return 'Modéré';
  return 'Faible';
}
