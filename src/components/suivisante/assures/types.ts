/**
 * Types, constantes et helpers partagés du module Assurés (refactoring P2).
 * Extraits tels quels de l'ancien monolithe assures-view.tsx.
 */
import { TYPES_BENEFICIAIRE } from '@/lib/referentiels';

export interface Societe { id: string; nom: string; }

export interface Assure {
  id: string;
  nom: string;
  prenom: string | null;
  nSS: string | null;
  matricule: string | null;
  typeBeneficiaire: string;
  assurePrincipalId: string | null;
  codeFamille: string | null;
  dateNaissance: string | null;
  sexe: string | null;
  dateEffet: string | null;
  bareme: number | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  actif: boolean;
  societe: Societe;
  _count: { dossiers: number };
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  nbLignes: number;
  nbSucces: number;
  nbErreurs: number;
  tauxSucces: number;
  erreurs: { ligne: number; message: string }[];
}

/* ── Libellés délégués au référentiel central (uniformité portail ↔ vue) ── */

export const TYPE_BENEF_LABELS: Record<string, string> = Object.fromEntries(
  TYPES_BENEFICIAIRE.map((t) => [t.valeur, t.label])
);

export const TYPE_BENEF_COLORS: Record<string, string> = {
  ASSURE: 'bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300',
  CONJOINT: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  ENFANT: 'bg-info-100 text-info-700 dark:bg-info-950/40 dark:text-info-300',
};

/** Format « 01 janv. 2025 » propre à ce module (mois abrégé). */
export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatAge(d: string | null): string {
  if (!d) return '';
  const birth = new Date(d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age} ans` : '';
}
