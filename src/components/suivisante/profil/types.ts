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
  { key: 'A', label: 'Émeraude', bg: 'bg-emerald-500', ring: 'ring-emerald-300 dark:ring-emerald-700' },
  { key: 'B', label: 'Bleu',     bg: 'bg-blue-500',   ring: 'ring-blue-300 dark:ring-blue-700' },
  { key: 'C', label: 'Ambré',    bg: 'bg-amber-500',  ring: 'ring-amber-300 dark:ring-amber-700' },
  { key: 'D', label: 'Violet',   bg: 'bg-violet-500', ring: 'ring-violet-300 dark:ring-violet-700' },
  { key: 'E', label: 'Rose',     bg: 'bg-pink-500',   ring: 'ring-pink-300 dark:ring-pink-700' },
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
  ADMINISTRATEUR: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  ACCUEIL: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  COMPTABILITE: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  SANTE: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  PORTAIL_CLIENT: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  CONTACT_ENTREPRISE: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
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
