/**
 * Types, constantes et helpers de la vue Profil (refactoring P2 — extraits du
 * monolithe profil-view.tsx). Source unique partagée par le hook use-profil
 * et les présentateurs.
 */

export interface ProfilData {
  id: string;
  email: string;
  nom: string;
  role: string;
  actif: boolean;
  avatar: string | null;
  dernierLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoriqueEntry {
  id: string;
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: string;
  nouvelleValeur: string;
  modifiePar: string;
  dateModification: string;
}

export const AVATARS = [
  { key: 'A', label: 'Émeraude', bg: 'bg-brand-500', ring: 'ring-brand-300 dark:ring-brand-700' },
  { key: 'B', label: 'Bleu',     bg: 'bg-info-500',   ring: 'ring-info-300 dark:ring-info-700' },
  { key: 'C', label: 'Ambré',    bg: 'bg-amber-500',  ring: 'ring-amber-300 dark:ring-amber-700' },
  { key: 'D', label: 'Violet',   bg: 'bg-violet-500', ring: 'ring-violet-300 dark:ring-violet-700' },
  { key: 'E', label: 'Rose',     bg: 'bg-rose-500',   ring: 'ring-rose-300 dark:ring-rose-700' },
  { key: 'F', label: 'Cyan',     bg: 'bg-cyan-500',   ring: 'ring-cyan-300 dark:ring-cyan-700' },
  { key: 'G', label: 'Orange',   bg: 'bg-orange-500', ring: 'ring-orange-300 dark:ring-orange-700' },
  { key: 'H', label: 'Slate',    bg: 'bg-slate-500',  ring: 'ring-slate-300 dark:ring-slate-700' },
];

export const CHAMP_LABELS: Record<string, string> = {
  password: 'Mot de passe',
  avatar: 'Avatar',
  nom: 'Nom',
  email: 'E-mail',
  role: 'Rôle',
  actif: 'Statut',
};

export const ROLE_COLORS: Record<string, string> = {
  ADMINISTRATEUR: 'bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300',
  ACCUEIL: 'bg-info-100 text-info-700 dark:bg-info-950/40 dark:text-info-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  COMPTABILITE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  SANTE: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  PORTAIL_CLIENT: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  CONTACT_ENTREPRISE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  PRESTATAIRE: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function getInitials(nom: string): string {
  return nom.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
