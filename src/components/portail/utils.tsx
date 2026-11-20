'use client';

/**
 * utils.tsx — Utilitaires d'affichage du portail (libellés, formats, icônes).
 * Les libellés/couleurs délèguent aux sources de vérité (lib/statuts, lib/referentiels).
 */

import { CheckCircle, XCircle, Clock, Info } from 'lucide-react';
import { DOSSIER_STATUTS } from '@/lib/statuts';
import { TYPES_BENEFICIAIRE } from '@/lib/referentiels';
import { cn } from '@/lib/utils';

export const STATUT_LABELS: Record<string, string> = Object.fromEntries(
  DOSSIER_STATUTS.map((s) => [s.valeur, s.label])
);

export const STATUT_COLORS: Record<string, string> = Object.fromEntries(
  DOSSIER_STATUTS.map((s) => [s.valeur, s.badge])
);

export const TYPE_BENEF_LABELS: Record<string, string> = Object.fromEntries(
  TYPES_BENEFICIAIRE.map((t) => [t.valeur, t.label])
);

export function formatMontant(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' Ar';
}

export function formatDate(d: string): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
}

export function StatutIcon({ statut }: { statut: string }) {
  if (statut === 'PAYE') return <CheckCircle className='h-3.5 w-3.5 text-teal-600' />;
  if (statut === 'REJETE') return <XCircle className='h-3.5 w-3.5 text-red-500' />;
  if (statut === 'EN_PAIEMENT' || statut === 'EN_COMPTABILITE') return <Clock className='h-3.5 w-3.5 text-accent-500' />;
  if (statut === 'EN_ANALYSE') return <Clock className='h-3.5 w-3.5 text-amber-500' />;
  return <Info className='h-3.5 w-3.5 text-info-500' />;
}

/** Boutons de filtre par statut — P2-02 : filtre SERVEUR (conservé entre pages). */
export const FILTRES_STATUT: { valeur: string; label: string }[] = [
  { valeur: '', label: 'Tous' },
  { valeur: 'en-cours', label: 'En cours' },
  { valeur: 'PAYE', label: 'Payés' },
  { valeur: 'REJETE', label: 'Rejetés' },
];

export function BoutonsStatut({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className='flex gap-1.5'>
      {FILTRES_STATUT.map((f) => (
        <button
          key={f.valeur || 'tous'}
          onClick={() => onChange(f.valeur)}
          className={cn(
            'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
            valeur === f.valeur
              ? 'bg-brand-600 text-white border-brand-600'
              : 'border-border hover:bg-muted'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
