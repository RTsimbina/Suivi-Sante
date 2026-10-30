/**
 * Types, constantes et helpers partagés du module Portail (refactoring P2).
 * Extraits tels quels de l'ancien monolithe portail-view.tsx.
 */

export interface PortailDossier {
  numeroDossier: string;
  statut: string;
  statutLabel: string;
  typeDossier: string;
  dateReception: string;
  montantReclame: number;
  montantPaye?: number;
  datePaiement?: string;
  referencePaiement?: string;
  prestataire?: string;
  motifRejet?: string;
}

export interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: Date;
}

export interface PortailKPI {
  totalDossiers: number;
  totalReclame: number;
  totalPaye: number;
  totalEnCours: number;
  totalRejete: number;
  delaiMoyen: number;
}

export interface ContratRow {
  id: string;
  societeNom: string;
  typeContrat: string;
  budget: number;
  utilise: number;
  solde: number;
  nbDossiers: number;
}

/* ─── Pipeline des étapes (simplifié côté client) ──────────────────────────── */

export const PIPELINE_STEPS = [
  { key: 'RECU', label: 'Réception' },
  { key: 'EN_ANALYSE', label: 'Analyse' },
  { key: 'VALIDE', label: 'Validation' },
  { key: 'EN_PAIEMENT', label: 'Paiement' },
  { key: 'PAYE', label: 'Terminé' },
];

export const STATUT_ORDER = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_PAIEMENT', 'PAYE'];

export function getPipelineIndex(statut: string): number {
  if (statut === 'EN_COMPTABILITE') return 3;
  if (statut === 'REJETE') return -1;
  const idx = STATUT_ORDER.indexOf(statut);
  return idx >= 0 ? idx : 0;
}
