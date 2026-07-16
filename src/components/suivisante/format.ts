export function formatMontant(montant: number): string {
  return new Intl.NumberFormat('fr-FR').format(montant) + ' Ar';
}

export function formatMontantCourt(montant: number): string {
  if (montant >= 1_000_000_000) return (montant / 1_000_000_000).toFixed(1) + ' Mds Ar';
  if (montant >= 1_000_000) return (montant / 1_000_000).toFixed(1) + ' M Ar';
  if (montant >= 1_000) return (montant / 1_000).toFixed(0) + ' K Ar';
  return new Intl.NumberFormat('fr-FR').format(montant) + ' Ar';
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}

export function statutLabel(statut: string): string {
  const labels: Record<string, string> = {
    RECU: 'Reçu',
    EN_ANALYSE: 'En analyse',
    VALIDE: 'Validé',
    EN_COMPTABILITE: 'En comptabilité',
    REJETE: 'Rejeté',
    EN_PAIEMENT: 'En paiement',
    PAYE: 'Payé',
  };
  return labels[statut] || statut;
}

export function statutColor(statut: string): string {
  const colors: Record<string, string> = {
    RECU: 'bg-muted text-muted-foreground border-border',
    EN_ANALYSE: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    VALIDE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    EN_COMPTABILITE: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 border-orange-200',
    REJETE: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    EN_PAIEMENT: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    PAYE: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200',
  };
  return colors[statut] || 'bg-muted text-muted-foreground';
}

export function typeDossierLabel(type: string): string {
  const labels: Record<string, string> = {
    HOSPITALISATION: 'Hospitalisation',
    CONSULTATION: 'Consultation',
    PHARMACIE: 'Pharmacie',
    MATERNITE: 'Maternité',
    CHIRURGIE: 'Chirurgie',
    EXAMEN: 'Examen',
    'SOINS DENTAIRES': 'Soins Dentaires',
    OPTIQUE: 'Optique',
  };
  return labels[type] || type;
}