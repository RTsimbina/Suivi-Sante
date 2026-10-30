/**
 * Types et helpers partagés du module Contrôle Santé (refactoring P2).
 * Extraits tels quels de l'ancien monolithe sante-view.tsx — aucune
 * modification de structure ni de formatage des données.
 */

/* ── Vérification d'un assuré ── */

export interface AssureInfo {
  id: string; nom: string; prenom: string; nSS: string | null;
  dateNaissance: string | null; sexe: string | null; telephone: string | null;
  email: string | null; adresse: string | null; actif: boolean;
}

export interface Alerte {
  type: 'info' | 'warning' | 'danger'; message: string; code: string;
}

export interface VerificationResult {
  assure: AssureInfo;
  societe: { id: string; nom: string };
  plafonds: {
    annuelGlobal: number; totalConsomme: number; reliquatGlobal: number;
    tauxConsommationGlobal: number; seuil70: number; seuil100: number;
  };
  consommationParActe: Record<string, {
    consomme: number; plafond: number; tauxCouverture: number;
    nbActes: number; description: string;
  }>;
  dossiersRecent: {
    id: string; numeroDossier: string; typeDossier: string;
    dateReception: string; montantReclame: number; montantValide: number | null;
    montantPaye: number | null; statut: string; prestataire: string | null;
  }[];
  alertes: Alerte[];
}

/* ── Simulation multi-actes ── */

export interface SimulationResult {
  autorise: boolean; raison: string; message: string;
  details: {
    typeActe: string; plafondActe: number; consommeActe: number;
    reliquatActe: number; tauxCouverture: number; montantDemande: number;
    montantCouvert: number; partAssureur: number; partPatient: number;
    plafondGlobal: number; consommeGlobal: number; reliquatGlobal: number;
    nbActesIdentiques: number;
  };
  actesIdentiques: { numeroDossier: string; dateReception: string; montantReclame: number; montantPaye: number | null; statut: string }[];
  alertes: { type: 'info' | 'warning' | 'danger'; message: string }[];
}

export interface SimLigne {
  id: string;
  typeActe: string;
  montant: string;
}

export interface MultiSimResult {
  ligne: SimLigne;
  result: SimulationResult;
}

/* ── Autocomplétion ── */

export interface SearchResult {
  id: string; nom: string; prenom: string; nSS: string | null;
  actif: boolean; societe: { nom: string };
}

/* ── Historique des actes ── */

export interface ActeItem {
  id: string;
  numeroDossier: string;
  typeDossier: string;
  beneficiaire: string;
  dateReception: string;
  dateSoins: string | null;
  montantReclame: number;
  montantValide: number | null;
  montantPaye: number | null;
  partPatient: number | null;
  statut: string;
  prestataireId: string | null;
  prestataire: string | null;
  prestataireType: string | null;
}

export interface ActesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ActesFiltres {
  typesActe: string[];
  statuts: string[];
}

/* ── Helpers de formatage et de présentation (partagés par la fiche,
      l'historique, les plafonds et le simulateur) ── */

export function formatAr(n: number) {
  return n.toLocaleString('fr-FR') + ' Ar';
}

export function formatPercent(n: number) {
  return n.toFixed(1) + '%';
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR');
}

/* Statut badge color helper */
export function getStatutBadge(statut: string) {
  const map: Record<string, 'default' | 'outline' | 'destructive' | 'secondary'> = {
    RECU: 'secondary',
    EN_COURS_TECHNIQUE: 'outline',
    VALIDE: 'outline',
    EN_COURS_COMPTA: 'outline',
    PAYE: 'default',
    REJETE: 'destructive',
  };
  return map[statut] || 'outline';
}

/* Barres de progression colorées (seuils 70 % / 100 %) */
export function getBarColor(taux: number) {
  if (taux >= 100) return 'bg-red-500';
  if (taux >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function getBarDarkColor(taux: number) {
  if (taux >= 100) return 'dark:bg-red-400';
  if (taux >= 70) return 'dark:bg-amber-400';
  return 'dark:bg-emerald-400';
}
