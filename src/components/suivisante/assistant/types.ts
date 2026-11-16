/**
 * Types et constantes de l'assistant IA (refactoring P2 — extraits du
 * monolithe assistant-view.tsx). Source unique partagée par le hook
 * use-assistant et les présentateurs.
 */
import type { AssistantResult, ParamKey } from '@/lib/assistant/types';

export interface QuestionPublique {
  id: string;
  categorie: string;
  question: string;
  params: { key: ParamKey; label: string; required?: boolean; aide?: string }[];
  presentation: string;
  note: string | null;
}

export interface CatalogueResponse {
  role: string;
  total: number;
  questions: QuestionPublique[];
  options: Partial<Record<string, { id: string; label: string }[]>>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  texte?: string;
  resultat?: AssistantResult;
  erreur?: string;
}

export const PERIODE_PRESETS = [
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
