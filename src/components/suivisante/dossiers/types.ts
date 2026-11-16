/**
 * Types et constantes du détail dossier (refactoring P2 — extraits du
 * monolithe dossier-detail.tsx). Source unique partagée par le hook
 * use-dossier-detail et les présentateurs des onglets.
 */
import { TYPES_JUSTIFICATIF } from '@/lib/referentiels';

export interface DossierDetail {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  assure: string | null;
  nSS: string | null;
  typeDossier: string;
  statut: string;
  source: string;
  prestataire: string | null;
  dateSoins: string | null;
  moyenPaiement: string | null;
  observations: string | null;
  montantReclame: number;
  montantValide: number | null;
  ticketModerateur: number | null;
  partPatient: number | null;
  partEntreprise: number | null;
  motifRejet: string | null;
  dateTraitementTechnique: string | null;
  dateReceptionDecompte: string | null;
  datePaiement: string | null;
  referencePaiement: string | null;
  montantPaye: number | null;
  historiqueParsed: HistoriqueEntry[];
  societe: { id: string; nom: string };
  gestionnaireAccueil: { id: string; nom: string; service: string } | null;
  gestionnaireTechnique: { id: string; nom: string; service: string } | null;
  gestionnaireCompta: { id: string; nom: string; service: string } | null;
  createur: { id: string; nom: string; email: string; role: string } | null;
  commentaires: CommentaireWithAuteur[];
  justificatifs: JustificatifDossier[];
}

export interface CommentaireWithAuteur {
  id: string;
  contenu: string;
  prive: boolean;
  createdAt: string;
  auteur: { id: string; nom: string; email: string; role: string } | null;
}

export interface JustificatifDossier {
  id: string;
  type: string;
  nomFichier: string;
  chemin: string;
  tailleKo: number | null;
  createdAt: string;
}

export interface HistoriqueEntry {
  date: string;
  statut: string;
  commentaire?: string;
  userId?: string;
}

/** Alerte IA pertinente pour un dossier (retournée par use-dossier-alertes-ia). */
export interface AlerteIa {
  type: string;
  niveau: string;
  message: string;
}

export const JUSTIFICATIF_LABELS: Record<string, string> = Object.fromEntries(
  TYPES_JUSTIFICATIF.map((t) => [t.valeur, t.label])
);

export const JUSTIFICATIF_COLORS: Record<string, string> = {
  FACTURE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  ORDONNANCE: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  RIB: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  CARNET_SOINS: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  DECOMPTE: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 border-orange-200',
  AUTRE: 'bg-muted text-muted-foreground border-border',
};

// Points de couleur de la timeline — alignés sur les couleurs canoniques des statuts
export const HISTORIQUE_STATUT_COLORS: Record<string, string> = {
  RECU: 'bg-slate-400',
  EN_ANALYSE: 'bg-amber-500',
  VALIDE: 'bg-emerald-500',
  EN_COMPTABILITE: 'bg-orange-500',
  EN_PAIEMENT: 'bg-sky-500',
  PAYE: 'bg-teal-500',
  REJETE: 'bg-red-500',
};
