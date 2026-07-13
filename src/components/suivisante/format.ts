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
    RECU: 'bg-slate-100 text-slate-700 border-slate-200',
    EN_ANALYSE: 'bg-amber-50 text-amber-700 border-amber-200',
    VALIDE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    EN_COMPTABILITE: 'bg-orange-50 text-orange-700 border-orange-200',
    REJETE: 'bg-red-50 text-red-700 border-red-200',
    EN_PAIEMENT: 'bg-sky-50 text-sky-700 border-sky-200',
    PAYE: 'bg-teal-50 text-teal-700 border-teal-200',
  };
  return colors[statut] || 'bg-gray-100 text-gray-700';
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