// ─── Portail Prestataire — règles métier partagées ──────────────────────────
//
// RÉUTILISATION STRICTE des modèles existants (aucun modèle parallèle) :
//   - Acte médical      = Dossier (prestataireId renseigné) — vue médicale.
//   - Facture           = Dossier de catégorie REGLEMENT_PRESTATAIRE
//                         (règlement direct au prestataire ; les dossiers
//                         REMBOURSEMENT_ASSURE sont réglés à l'assuré, pas
//                         au prestataire — ils apparaissent en vue Actes).
//   - Montant facturé   = Dossier.montantReclame
//   - Montant réglé     = Dossier.montantPaye (datePaiement / referencePaiement)
//   - Solde             = max(0, (montantValide ?? montantReclame) − montantPaye)
//                         (0 pour un dossier REJETE)
//   - Barème applicable = Bareme { societeId, prestation = getParentType(typeDossier),
//                         active } — même résolution que plafond-check.ts.
//
// STATUTS DE FACTURE — DÉRIVÉS du workflow existant des dossiers
// (RECU → EN_ANALYSE → VALIDE → EN_COMPTABILITE → EN_PAIEMENT → PAYE / REJETE,
// voir VALID_TRANSITIONS dans /api/dossiers/[id]) et NON créés en
// contradiction avec la plateforme :
//   REJETE                              → REJETEE   « Rejetée »
//   PAYE (ou paiement ≥ dû)             → REGLEE    « Réglée »
//   0 < montantPaye < dû                → PARTIELLEMENT_REGLEE « Partiellement réglée »
//   VALIDE / EN_COMPTABILITE / EN_PAIEMENT → VALIDEE « Validée » (règlement à venir)
//   EN_ANALYSE                          → EN_TRAITEMENT « En cours de traitement »
//   RECU                                → SOUMISE   « Soumise »
// Le statut « Brouillon » n'existe pas côté plateforme : chaque acte soumis
// est enregistré dès sa réception (RECU = « Soumise ») — il n'est donc pas
// produit par la dérivation.
// ──────────────────────────────────────────────────────────────────────────

import { Decimal, versDecimal, moins, superieurA, inferieurA, superieurOuEgal } from '@/lib/money';

/** Zéro monétaire (Decimal). */
const ZERO = new Decimal(0);

/** Statut de facture dérivé (exposé au portail). */
export type StatutFacture =
  | 'SOUMISE'
  | 'EN_TRAITEMENT'
  | 'VALIDEE'
  | 'PARTIELLEMENT_REGLEE'
  | 'REGLEE'
  | 'REJETEE';

/** Libellés français des statuts de facture. */
export const STATUT_FACTURE_LABELS: Record<StatutFacture, string> = {
  SOUMISE: 'Soumise',
  EN_TRAITEMENT: 'En cours de traitement',
  VALIDEE: 'Validée',
  PARTIELLEMENT_REGLEE: 'Partiellement réglée',
  REGLEE: 'Réglée',
  REJETEE: 'Rejetée',
};

/** Classes Tailwind des badges de statut de facture. */
export const STATUT_FACTURE_COLORS: Record<StatutFacture, string> = {
  SOUMISE: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  EN_TRAITEMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  VALIDEE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  PARTIELLEMENT_REGLEE: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  REGLEE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  REJETEE: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

/** Liste des statuts proposés dans le filtre du portail. */
export const STATUTS_FACTURE: StatutFacture[] = [
  'SOUMISE',
  'EN_TRAITEMENT',
  'VALIDEE',
  'PARTIELLEMENT_REGLEE',
  'REGLEE',
  'REJETEE',
];

/** Entrée minimale pour dériver le statut d'une facture. */
export interface DossierPourStatut {
  statut: string;
  montantReclame: Decimal | number | string | null;
  montantValide: Decimal | number | string | null;
  montantPaye: Decimal | number | string | null;
}

/** Montant dû = montant validé s'il est renseigné, sinon montant réclamé. */
export function montantDu(d: DossierPourStatut): Decimal {
  const valide = versDecimal(d.montantValide);
  if (valide) return valide;
  return versDecimal(d.montantReclame) ?? ZERO;
}

/**
 * Solde restant d'une facture : 0 si rejetée, sinon max(0, dû − réglé).
 * Retourne un Decimal (précision monétaire garantie).
 */
export function soldeFacture(d: DossierPourStatut): Decimal {
  if (d.statut === 'REJETE') return ZERO;
  const du = montantDu(d);
  const paye = versDecimal(d.montantPaye) ?? ZERO;
  const reste = moins(du, paye) ?? ZERO;
  return reste.isNegative() ? ZERO : reste;
}

/**
 * Dérive le statut de facture depuis le workflow du dossier
 * (cf. table de correspondance en tête de fichier).
 */
export function deriveStatutFacture(d: DossierPourStatut): StatutFacture {
  if (d.statut === 'REJETE') return 'REJETEE';

  const du = montantDu(d);
  const paye = versDecimal(d.montantPaye) ?? null;

  // Paiement partiel : un règlement a été effectué, inférieur au dû —
  // préempte tout autre statut (un dossier PAYE avec un règlement partiel
  // n'est pas « Réglée » : la vérité comptable prime sur le statut workflow).
  if (paye && superieurA(paye, ZERO) && inferieurA(paye, du)) {
    return 'PARTIELLEMENT_REGLEE';
  }

  // Paiement complet : statut PAYE, ou montant réglé ≥ montant dû.
  if (d.statut === 'PAYE') return 'REGLEE';
  if (paye && superieurOuEgal(paye, du)) return 'REGLEE';

  switch (d.statut) {
    case 'VALIDE':
    case 'EN_COMPTABILITE':
    case 'EN_PAIEMENT':
      return 'VALIDEE';
    case 'EN_ANALYSE':
      return 'EN_TRAITEMENT';
    case 'RECU':
    default:
      return 'SOUMISE';
  }
}

/**
 * Masque un numéro de sécurité sociale pour l'affichage au portail
 * (donnée minimale : les 3 premiers et 2 derniers caractères).
 */
export function masquerNss(nss: string | null | undefined): string {
  const brut = (nss || '').trim();
  if (!brut) return '—';
  if (brut.length <= 5) return brut;
  return `${brut.slice(0, 3)}${'•'.repeat(Math.min(6, brut.length - 5))}${brut.slice(-2)}`;
}

/** Traduit un statut de dossier (workflow plateforme) en libellé français. */
export const STATUT_DOSSIER_LABELS: Record<string, string> = {
  RECU: 'Reçu',
  EN_ANALYSE: 'En analyse',
  VALIDE: 'Validé',
  EN_COMPTABILITE: 'En comptabilité',
  EN_PAIEMENT: 'En paiement',
  PAYE: 'Payé',
  REJETE: 'Rejeté',
};

/** Classes Tailwind des badges de statut de dossier (workflow plateforme). */
export const STATUT_DOSSIER_COLORS: Record<string, string> = {
  RECU: 'bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300',
  EN_ANALYSE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  VALIDE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  EN_COMPTABILITE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  EN_PAIEMENT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  PAYE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  REJETE: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};
