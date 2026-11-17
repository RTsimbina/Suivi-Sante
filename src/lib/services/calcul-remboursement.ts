/**
 * calcul-remboursement.ts — SERVICE MÉTIER CENTRALISÉ du remboursement et du
 * ticket modérateur (P2-04).
 *
 * SOURCE UNIQUE de vérité du calcul : toutes les fonctionnalités de Suivi
 * Santé qui produisent un montant remboursé / ticket modérateur (plafond-check,
 * création de dossiers, simulation Contrôle Santé, simulateur Technique,
 * portail) passent par CE service — plus aucun calcul local parallèle.
 *
 * RÈGLE MÉTIER VALIDÉE (référentiel mission P2-04C) :
 *   1. Prise en charge THÉORIQUE (contrat) = montantFrais × tauxCouverture ;
 *   2. Plafond restant = plafondAnnuel − consommation antérieure (≥ 0) ;
 *   3. Prise en charge AUTORISÉE = min(théorique, plafondRestant) — le
 *      plafond plafonne ce que l'ASSUREUR prend en charge, après application
 *      du taux ;
 *   4. Dépassement du plafond = max(0, théorique − restant) : la part de la
 *      prise en charge contractuelle que le plafond absorbe ;
 *   5. Part CONTRACTUELLE de l'assuré = montantFrais − théorique ;
 *   6. TICKET MODÉRATEUR = montantFrais − autorisée = part contractuelle +
 *      dépassement — la charge TOTALE de l'assuré, décomposée.
 *
 * EXEMPLE DE RÉFÉRENCE (à respecter à l'identique) :
 *   Dépense 100 000 Ar · taux 80 % · plafond 500 000 Ar · consommé 450 000 Ar
 *   → théorique 80 000 · restant 50 000 · AUTORISÉE 50 000 · TM 50 000
 *     (part contractuelle 20 000 + dépassement 30 000).
 *
 * PRÉCISION MONÉTAIRE : tous les calculs intermédiaires en Decimal (prisma
 * decimal.js, arrondi comptable 2 décimales via src/lib/money.ts) — aucune
 * erreur d'arrondi IEEE 754. Les consommations concurrentes sont sérialisées
 * par le verrou consultatif PostgreSQL dans les appelants (POST /api/dossiers).
 */

import {
  Decimal,
  enNombre,
  appliquerTaux,
  minDecimal,
  moins,
  reliquat as calculerReliquat,
  formaterAr,
} from '../money';

/** Entrées du calcul — montants en Ariary (numbers, arrière-plan Decimal). */
export interface ParamsCalculRemboursement {
  /** Montant des frais médicaux réels (dépense de l'assuré). */
  montantFrais: number;
  /** Taux de couverture contractuel en % (ex. 80 pour 80 %). */
  tauxCouverture: number;
  /** Plafond annuel de l'acte (barème en vigueur, Ar). */
  plafondAnnuel: number;
  /** Consommation annuelle antérieure déjà comptabilisée (Ar). */
  consommationAnterieure: number;
}

/** Résultat complet et décomposé du calcul (tous montants en Ar). */
export interface ResultatCalculRemboursement {
  plafondAnnuel: number;
  consommationAnterieure: number;
  /** max(0, plafondAnnuel − consommé) */
  plafondRestant: number;
  /** true si le plafond est déjà épuisé (restant = 0). */
  plafondEpuise: boolean;
  /** montantFrais × tauxCouverture — ce que le contrat prévoit. */
  priseEnChargeTheorique: number;
  /** min(théorique, restant) — ce que l'assureur prend en charge. */
  priseEnChargeAutorisee: number;
  /** montantFrais − théorique — part prévue au contrat pour l'assuré. */
  partContractuelleAssure: number;
  /** max(0, théorique − restant) — part contractuelle absorbée par le plafond. */
  depassementPlafond: number;
  /** montantFrais − autorisée = partContractuelle + dépassement — charge totale. */
  ticketModerateur: number;
}

/**
 * Calcul centralisé du remboursement / ticket modérateur.
 * Fonction PURE : aucun accès base — la consommation antérieure est fournie
 * par l'appelant (plafond-check la calcule avec les règles d'exclusion
 * métier : RECU et REJETE ne consomment pas).
 */
export function calculerRemboursement(
  params: ParamsCalculRemboursement,
): ResultatCalculRemboursement {
  const { montantFrais, tauxCouverture, plafondAnnuel, consommationAnterieure } = params;

  // Plafond restant : jamais négatif (plafond déjà épuisé → 0).
  const plafondRestantDecimal = calculerReliquat(plafondAnnuel, consommationAnterieure) ?? new Decimal(0);

  // 1. Prise en charge théorique (contrat) — Decimal exact, arrondi comptable.
  const theoriqueDecimal = appliquerTaux(montantFrais, tauxCouverture) ?? new Decimal(0);

  // 3. Prise en charge autorisée : le plafond borne ce que l'ASSUREUR paie.
  const autoriseeDecimal = minDecimal(theoriqueDecimal, plafondRestantDecimal) ?? new Decimal(0);

  // 4. Dépassement : part contractuelle absorbée par le plafond (jamais négatif).
  const depassementBrut = moins(theoriqueDecimal, plafondRestantDecimal);
  const depassementDecimal = depassementBrut && depassementBrut.isNegative()
    ? new Decimal(0)
    : (depassementBrut ?? new Decimal(0));

  // 5. Part contractuelle de l'assuré.
  const contractuelleDecimal = moins(montantFrais, theoriqueDecimal) ?? new Decimal(0);

  // 6. Ticket modérateur = dépense − prise en charge autorisée = contractuelle + dépassement.
  // (Invariance contractuelle + dépassement = ticket : vérifiée par la suite de tests.)
  const ticketDecimal = moins(montantFrais, autoriseeDecimal) ?? new Decimal(0);

  return {
    plafondAnnuel: enNombre(versMontant(plafondAnnuel)) ?? 0,
    consommationAnterieure: enNombre(versMontant(consommationAnterieure)) ?? 0,
    plafondRestant: enNombre(plafondRestantDecimal) ?? 0,
    plafondEpuise: plafondRestantDecimal.comparedTo(0) <= 0,
    priseEnChargeTheorique: enNombre(theoriqueDecimal) ?? 0,
    priseEnChargeAutorisee: enNombre(autoriseeDecimal) ?? 0,
    partContractuelleAssure: enNombre(contractuelleDecimal) ?? 0,
    depassementPlafond: enNombre(depassementDecimal) ?? 0,
    ticketModerateur: enNombre(ticketDecimal) ?? 0,
  };
}

/**
 * Ligne d'explication lisible (utilisée par les écrans et plafond-check) :
 * distingue la part contractuelle de l'assuré et le dépassement du plafond.
 */
export function expliquerRemboursement(r: ResultatCalculRemboursement): string {
  const base = `Prise en charge théorique : ${formaterAr(r.priseEnChargeTheorique)} (taux appliqué).`;
  if (r.plafondEpuise) {
    return `${base} Plafond annuel déjà épuisé — aucun remboursement possible, ticket modérateur total : ${formaterAr(r.ticketModerateur)}.`;
  }
  if (r.depassementPlafond > 0) {
    return `${base} Plafond restant : ${formaterAr(r.plafondRestant)} — prise en charge autorisée : ${formaterAr(r.priseEnChargeAutorisee)}. Ticket modérateur : ${formaterAr(r.ticketModerateur)} (part contractuelle ${formaterAr(r.partContractuelleAssure)} + dépassement du plafond ${formaterAr(r.depassementPlafond)}).`;
  }
  return `${base} Plafond restant : ${formaterAr(r.plafondRestant)} — pris en charge dans la limite du plafond. Ticket modérateur : ${formaterAr(r.ticketModerateur)} (part contractuelle de l'assuré).`;
}

/** Convertit une entrée number en Decimal (arrondi comptable). */
function versMontant(v: number): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
