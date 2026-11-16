/**
 * Types et helpers d'assignation du Kanban (refactoring P2 — extraits du
 * monolithe kanban-view.tsx). Source unique partagée par le hook
 * use-kanban-board et les présentateurs.
 */
import { DOSSIER_STATUT_VALEURS } from '@/lib/statuts';

export interface Gestionnaire {
  id: string;
  nom: string;
  service: string;
}

export interface Dossier {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  typeDossier: string;
  statut: string;
  montantReclame: number;
  societe: { nom: string };
  gestionnaireAccueilId: string | null;
  gestionnaireTechniqueId: string | null;
  gestionnaireComptaId: string | null;
}

export const STATUTS_ORDER = DOSSIER_STATUT_VALEURS;

/** Quel champ gestionnaire est pertinent selon le statut du dossier */
export function champPourStatut(statut: string): 'ACCUEIL' | 'TECHNIQUE' | 'COMPTABILITE' | null {
  if (['RECU'].includes(statut)) return 'ACCUEIL';
  if (['EN_ANALYSE', 'VALIDE'].includes(statut)) return 'TECHNIQUE';
  if (['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)) return 'COMPTABILITE';
  return null;
}

export function champVersGestionnaireId(statut: string, d: Dossier): string | null {
  const champ = champPourStatut(statut);
  if (champ === 'ACCUEIL') return d.gestionnaireAccueilId;
  if (champ === 'TECHNIQUE') return d.gestionnaireTechniqueId;
  if (champ === 'COMPTABILITE') return d.gestionnaireComptaId;
  return null;
}

export const SERVICE_LABELS: Record<string, string> = {
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Technique',
  COMPTABILITE: 'Comptabilité',
};
