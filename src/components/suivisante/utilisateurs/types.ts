/**
 * Types, constantes et helpers partagés du module Utilisateurs (refactoring
 * P2). Extraits tels quels de l'ancien monolithe utilisateurs-view.tsx.
 */
import { ROLES as ROLES_REFERENTIEL, ROLE_LABELS, ROLE_COLORS } from '@/lib/referentiels';

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: string;
  roleLabel: string;
  actif: boolean;
  avatar: string | null;
  dernierLogin: string | null;
  failedAttempts: number | null;
  lockoutUntil: string | null;
  createdAt: string;
  updatedAt: string;
  // Rôles externes uniquement : true = assuré/contact avec cet e-mail trouvé,
  // false = liaison manquante (le portail affichera une erreur), null = interne.
  liaisonExterne?: boolean | null;
}

export interface FormData {
  email: string;
  nom: string;
  password: string;
  role: string;
  // CONTACT_ENTREPRISE uniquement : société à lier si aucun contact
  // d'entreprise n'existe encore avec cet e-mail (création en une étape).
  societeId: string;
}

// Société (référentiel, pour la liaison des comptes Contact Entreprise)
export interface SocieteRef {
  id: string;
  nom: string;
  contactPrincipal?: string | null;
  emailContactPrincipal?: string | null;
}

// Résultat de la vérification de liaison en direct (rôles externes)
export interface LiaisonInfo {
  etat: 'VERIFIE' | 'TROUVE' | 'CREABLE' | 'BLOQUE';
  detail: string;
}

/* ─── Constantes ──────────────────────────────────────────────────────────── */

// Rôles — délégués au référentiel central (libellés avec accents, couleurs canoniques)
export const ROLES: { value: string; label: string; color: string }[] = ROLES_REFERENTIEL.map((r) => ({
  value: r,
  label: ROLE_LABELS[r] || r,
  color: ROLE_COLORS[r] || 'bg-muted text-muted-foreground',
}));

export const EMPTY_FORM: FormData = { email: '', nom: '', password: '', role: 'ACCUEIL', societeId: '' };

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
