/**
 * Types et constantes du formulaire de création de dossier (refactoring P2 —
 * extraits du monolithe dossier-form.tsx). Source unique partagée par le hook
 * use-dossier-form et les présentateurs des sections.
 */
import { MOYENS_PAIEMENT, CATEGORIES_DOSSIER, TYPES_JUSTIFICATIF, TYPE_JUSTIFICATIF_VALEURS } from '@/lib/referentiels';

export interface Societe { id: string; nom: string; }
export interface Gestionnaire { id: string; nom: string; service: string; }
export interface AssureOption { id: string; nom: string; prenom: string | null; nSS: string | null; matricule: string | null; societeId: string; }
export interface PrestataireOption { id: string; nom: string; type: string; actif?: boolean; }

export interface PlafondAnnuelInfo {
  autorise: boolean;
  raison: string;
  message: string;
  details: {
    consommeActe?: number;
    plafondActe?: number;
    reliquatActe?: number;
    consommeGlobal?: number;
    plafondGlobal?: number;
    reliquatGlobal?: number;
    nbActesIdentiques?: number;
    tauxCouverture?: number;
  };
  alertes: { type: string; message: string }[];
}

export interface CalculResult {
  bareme: string;
  tauxCouverture: number;
  plafond: number;
  calcul: {
    montantRembourse: number;
    ticketModerateur: number;
  };
  plafondAtteint: boolean;
  explication: string;
  plafondAnnuel?: PlafondAnnuelInfo;
}

export interface UploadedFile { file: File; type: string; id: string; }

// Moyens de paiement / catégories / justificatifs — référentiels centraux
export const MOYENS = MOYENS_PAIEMENT.map((m) => ({ value: m.valeur, label: m.label }));

export const CATEGORIES = CATEGORIES_DOSSIER.map((c) => ({ value: c.valeur, label: c.label }));

export const JUSTIF_TYPES = TYPE_JUSTIFICATIF_VALEURS;
export const JUSTIF_LABELS: Record<string, string> = Object.fromEntries(
  TYPES_JUSTIFICATIF.map((t) => [t.valeur, t.label])
);

export function formatAr(amount: number) {
  return amount.toLocaleString('fr-FR') + ' Ar';
}
