import { dossierStatutLabel, dossierStatutBadge } from '@/lib/statuts';

export function formatMontant(montant: number | undefined | null): string {
  const n = typeof montant === 'number' && isFinite(montant) ? montant : 0;
  return new Intl.NumberFormat('fr-FR').format(n) + ' Ar';
}

export function formatMontantCourt(montant: number | undefined | null): string {
  const n = typeof montant === 'number' && isFinite(montant) ? montant : 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' Mds Ar';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M Ar';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' K Ar';
  return new Intl.NumberFormat('fr-FR').format(n) + ' Ar';
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

// ─── Statuts — délégués à la source de vérité src/lib/statuts.ts ───────────
// Toutes les vues qui importent statutLabel / statutColor depuis format.ts
// consomment ainsi automatiquement les libellés et couleurs canoniques.

export function statutLabel(statut: string): string {
  return dossierStatutLabel(statut);
}

export function statutColor(statut: string): string {
  return dossierStatutBadge(statut);
}

// typeDossierLabel supprimé — utiliser getPrestationLabel depuis @/lib/prestations
export { getPrestationLabel as typeDossierLabel } from '@/lib/prestations';
