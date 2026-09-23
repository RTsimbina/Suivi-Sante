// ─── Statuts conventionnels — Source de vérité unique ───────────────────────
// Toute la plateforme (vues, portail, APIs, bots, emails, imports) doit
// consommer CE module pour :
//   - les valeurs techniques autorisées,
//   - les libellés affichés,
//   - les couleurs de badges (classes Tailwind dark-mode-safe),
//   - les couleurs hexadécimales (emails, graphiques),
//   - les transitions autorisées et les rôles habilités.
//
// ⚠️ Ne JAMAIS redéfinir un libellé, une couleur ou une liste de statuts
//    ailleurs dans le code. Ajouter/modifier un statut = modifier ce fichier.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StatutConfig {
  /** Valeur technique stockée en base */
  valeur: string;
  /** Libellé français affiché (identique partout) */
  label: string;
  /** Classes Tailwind du badge (fond, texte, bordure) — dark-mode-safe */
  badge: string;
  /** Couleur hexadécimale pour emails HTML et graphiques */
  hex: string;
}

// ─── Dossier.statut ─────────────────────────────────────────────────────────

/** Statuts du cycle de vie d'un dossier, dans l'ordre du workflow. */
export const DOSSIER_STATUTS: StatutConfig[] = [
  {
    valeur: 'RECU',
    label: 'Reçu',
    badge: 'bg-muted text-muted-foreground border-border',
    hex: '#94a3b8',
  },
  {
    valeur: 'EN_ANALYSE',
    label: 'En analyse',
    badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    hex: '#f59e0b',
  },
  {
    valeur: 'VALIDE',
    label: 'Validé',
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hex: '#10b981',
  },
  {
    valeur: 'EN_COMPTABILITE',
    label: 'En comptabilité',
    badge: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 border-orange-200',
    hex: '#f97316',
  },
  {
    valeur: 'EN_PAIEMENT',
    label: 'En paiement',
    badge: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    hex: '#0ea5e9',
  },
  {
    valeur: 'PAYE',
    label: 'Payé',
    badge: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200',
    hex: '#14b8a6',
  },
  {
    valeur: 'REJETE',
    label: 'Rejeté',
    badge: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    hex: '#ef4444',
  },
];

/** Valeurs techniques autorisées (dossiers + imports qui créent des dossiers). */
export const DOSSIER_STATUT_VALEURS: string[] = DOSSIER_STATUTS.map((s) => s.valeur);

/** Transitions autorisées du workflow dossier. */
export const DOSSIER_TRANSITIONS: Record<string, string[]> = {
  RECU: ['EN_ANALYSE', 'REJETE'],
  EN_ANALYSE: ['VALIDE', 'REJETE'],
  VALIDE: ['EN_COMPTABILITE', 'REJETE'],
  EN_COMPTABILITE: ['EN_PAIEMENT', 'REJETE'],
  EN_PAIEMENT: ['PAYE', 'REJETE'],
  PAYE: [],
  REJETE: [],
};

/** Rôles habilités par transition (clé `${DE}_${VERS}`). */
export const DOSSIER_ROLE_TRANSITIONS: Record<string, string[]> = {
  RECU_EN_ANALYSE: ['ADMINISTRATEUR', 'ACCUEIL'],
  RECU_REJETE: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE'],
  EN_ANALYSE_VALIDE: ['ADMINISTRATEUR', 'TECHNIQUE'],
  EN_ANALYSE_REJETE: ['ADMINISTRATEUR', 'TECHNIQUE'],
  VALIDE_EN_COMPTABILITE: ['ADMINISTRATEUR', 'TECHNIQUE'],
  VALIDE_REJETE: ['ADMINISTRATEUR', 'TECHNIQUE'],
  EN_COMPTABILITE_EN_PAIEMENT: ['ADMINISTRATEUR', 'COMPTABILITE'],
  EN_COMPTABILITE_REJETE: ['ADMINISTRATEUR', 'COMPTABILITE'],
  EN_PAIEMENT_PAYE: ['ADMINISTRATEUR', 'COMPTABILITE'],
  EN_PAIEMENT_REJETE: ['ADMINISTRATEUR', 'COMPTABILITE'],
};

// ─── Contrat.statut ─────────────────────────────────────────────────────────

export const CONTRAT_STATUTS: StatutConfig[] = [
  {
    valeur: 'ACTIF',
    label: 'Actif',
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hex: '#10b981',
  },
  {
    valeur: 'EXPIRE',
    label: 'Expiré',
    badge: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    hex: '#ef4444',
  },
  {
    valeur: 'SUSPENDU',
    label: 'Suspendu',
    badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    hex: '#f59e0b',
  },
];

export const CONTRAT_STATUT_VALEURS: string[] = CONTRAT_STATUTS.map((s) => s.valeur);

// ─── AppelDeFonds.statut ────────────────────────────────────────────────────

export const APPEL_FONDS_STATUTS: StatutConfig[] = [
  {
    valeur: 'EN_ATTENTE',
    label: 'En attente',
    badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    hex: '#f59e0b',
  },
  {
    valeur: 'REGLE',
    label: 'Réglé',
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hex: '#10b981',
  },
  {
    valeur: 'ANNULE',
    label: 'Annulé',
    badge: 'bg-muted text-muted-foreground border-border',
    hex: '#94a3b8',
  },
];

export const APPEL_FONDS_STATUT_VALEURS: string[] = APPEL_FONDS_STATUTS.map((s) => s.valeur);

/** Transitions autorisées d'un appel de fonds (corrections possibles vers EN_ATTENTE). */
export const APPEL_FONDS_TRANSITIONS: Record<string, string[]> = {
  EN_ATTENTE: ['REGLE', 'ANNULE'],
  REGLE: ['EN_ATTENTE', 'ANNULE'],
  ANNULE: ['EN_ATTENTE'],
};

// ─── Courriel.statut ────────────────────────────────────────────────────────
// RECU utilise volontairement le même affichage que DOSSIER RECU
// (valeur identique → affichage identique sur toute la plateforme).

export const COURRIEL_STATUTS: StatutConfig[] = [
  {
    valeur: 'RECU',
    label: 'Reçu',
    badge: 'bg-muted text-muted-foreground border-border',
    hex: '#94a3b8',
  },
  {
    valeur: 'TRAITE',
    label: 'Traité',
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hex: '#10b981',
  },
  {
    valeur: 'REJETE',
    label: 'Rejeté',
    badge: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    hex: '#ef4444',
  },
];

export const COURRIEL_STATUT_VALEURS: string[] = COURRIEL_STATUTS.map((s) => s.valeur);

// ─── Helpers génériques ─────────────────────────────────────────────────────

/** Retourne la config complète d'un statut, ou undefined si valeur inconnue. */
export function getStatutConfig(
  configs: StatutConfig[],
  valeur: string
): StatutConfig | undefined {
  return configs.find((s) => s.valeur === valeur);
}

/** Liste des options { value, label } pour les selects / filtres. */
export function statutOptions(configs: StatutConfig[]): { value: string; label: string }[] {
  return configs.map((s) => ({ value: s.valeur, label: s.label }));
}

// ─── Helpers Dossier (compatibilité avec l'ancien format.ts) ────────────────

/** Libellé français d'un statut dossier (fallback : valeur brute). */
export function dossierStatutLabel(statut: string): string {
  return getStatutConfig(DOSSIER_STATUTS, statut)?.label ?? statut;
}

/** Classes de badge d'un statut dossier (fallback : muted). */
export function dossierStatutBadge(statut: string): string {
  return (
    getStatutConfig(DOSSIER_STATUTS, statut)?.badge ??
    'bg-muted text-muted-foreground border-border'
  );
}

/** Couleur hex d'un statut dossier (fallback : gris). */
export function dossierStatutHex(statut: string): string {
  return getStatutConfig(DOSSIER_STATUTS, statut)?.hex ?? '#94a3b8';
}

/**
 * Vérifie qu'une transition de statut dossier est autorisée.
 * @returns true si la transition DE→VERS est dans la matrice.
 */
export function transitionDossierAutorisee(de: string, vers: string): boolean {
  return (DOSSIER_TRANSITIONS[de] || []).includes(vers);
}

/**
 * Vérifie que le rôle est habilité à effectuer la transition DE→VERS.
 * Si aucune règle de rôle n'existe pour cette transition, l'accès est permis
 * (comportement historique conservé).
 */
export function roleAutoriseTransitionDossier(
  de: string,
  vers: string,
  role: string | undefined | null
): boolean {
  const allowed = DOSSIER_ROLE_TRANSITIONS[`${de}_${vers}`];
  if (!allowed) return true;
  if (!role) return true;
  return allowed.includes(role);
}

/** Vérifie qu'une transition appel de fonds est autorisée. */
export function transitionAppelFondsAutorisee(de: string, vers: string): boolean {
  return (APPEL_FONDS_TRANSITIONS[de] || []).includes(vers);
}
