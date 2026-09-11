/**
 * Utilitaires monétaires — arithmétique exacte en Decimal(18,2).
 *
 * Contexte (plan P3, Vague 1 — Stabilisation) :
 *   Les montants financiers étaient stockés en `Float` (double précision IEEE 754),
 *   ce qui produit des erreurs d'arrondi inacceptables pour une application de
 *   gestion d'assurance santé (0,1 + 0,2 ≠ 0,3 en flottant). Toutes les colonnes
 *   monétaires sont désormais `Decimal @db.Decimal(18,2)` en base.
 *
 * Règles du projet :
 *   1. Les CALCULS métier (sommes de consommation, reliquats, tickets modérateurs,
 *      parts patient/entreprise, diffs de budget) sont faits en Decimal via ce
 *      module — JAMAIS en reconversion number.
 *   2. Les réponses API sérialisent les Decimal en number (couche d'affichage,
 *      voir src/lib/decimal-serialization.ts) pour rester compatibles avec le
 *      frontend actuel. La bascule vers une sérialisation string précise se fera
 *      avec la refonte frontend (TanStack Query).
 *   3. Les interfaces d'entrée (Zod) continuent d'accepter des number — Prisma
 *      accepte number|string|Decimal en écriture d'un champ Decimal.
 *
 * Les coefficients (tauxCouverture, bareme assuré) restent des ratios en Float :
 * ce ne sont pas des montants.
 */

import { Prisma } from "@prisma/client";

/** Classe Decimal de Prisma (decimal.js) — constructible : new Decimal("12.30"). */
export const Decimal = Prisma.Decimal;
/** Type d'instance Decimal (réexporté pour les signatures). */
export type Decimal = Prisma.Decimal;

/** Toute valeur monétaire lisible : Decimal (DB), number (Zod/formulaire), string (import Excel/CSV/Sage). */
export type ValeurMontant = Decimal | number | string | null | undefined;

/** Arrondi comptable : 2 décimales, moitié vers le haut (comme l'ancien Math.round(x*100)/100 sur les positifs). */
const DECIMALES = 2;

/**
 * Convertit une valeur en Decimal exact.
 * Renvoie null pour null/undefined/chaîne vide/valeur non numérique ou non finie —
 * l'appelant décide du fallback (0, null, erreur).
 */
export function versDecimal(valeur: ValeurMontant): Decimal | null {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Prisma.Decimal) return valeur;
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) return null;
    return new Prisma.Decimal(valeur);
  }
  if (typeof valeur === "string") {
    const s = valeur.trim().replace(/\s/g, "").replace(",", ".");
    if (!s) return null;
    try {
      const d = new Prisma.Decimal(s);
      if (!d.isFinite()) return null;
      return d;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Convertit en number — UNIQUEMENT pour l'affichage, le formatage ou les
 * interfaces historiques typées number. Interdit dans un calcul métier
 * (précision flottante). Voir l'en-tête de ce module.
 */
export function enNombre(valeur: ValeurMontant): number | null {
  const d = versDecimal(valeur);
  return d === null ? null : d.toNumber();
}

/** Somme exacte d'une liste de valeurs (ignore null/undefined/non numériques). */
export function sommer(valeurs: ValeurMontant[]): Decimal {
  let acc = new Prisma.Decimal(0);
  for (const v of valeurs) {
    const d = versDecimal(v);
    if (d !== null) acc = acc.plus(d);
  }
  return acc;
}

/** Arrondi comptable à 2 décimales (ROUND_HALF_UP). */
export function arrondir2(valeur: ValeurMontant): Decimal | null {
  const d = versDecimal(valeur);
  return d === null ? null : d.toDecimalPlaces(DECIMALES, Prisma.Decimal.ROUND_HALF_UP);
}

/** a + b en Decimal, arrondi comptable. */
export function plus(a: ValeurMontant, b: ValeurMontant): Decimal | null {
  const da = versDecimal(a);
  const db_ = versDecimal(b);
  if (da === null || db_ === null) return null;
  return arrondir2(da.plus(db_));
}

/** a − b en Decimal, arrondi comptable. */
export function moins(a: ValeurMontant, b: ValeurMontant): Decimal | null {
  const da = versDecimal(a);
  const db_ = versDecimal(b);
  if (da === null || db_ === null) return null;
  return arrondir2(da.minus(db_));
}

/** montant × (tauxPourcent / 100) — ex : appliquerTaux(10000, 80) = 8000. Arrondi comptable. */
export function appliquerTaux(montant: ValeurMontant, tauxPourcent: number): Decimal | null {
  const d = versDecimal(montant);
  if (d === null || !Number.isFinite(tauxPourcent)) return null;
  return arrondir2(d.mul(tauxPourcent).div(100));
}

/** min(a, b) en comparaison exacte (pas via number). */
export function minDecimal(a: ValeurMontant, b: ValeurMontant): Decimal | null {
  const da = versDecimal(a);
  const db_ = versDecimal(b);
  if (da === null) return db_;
  if (db_ === null) return da;
  return da.comparedTo(db_) <= 0 ? da : db_;
}

/** max(0, a − b) — typiquement un reliquat. Arrondi comptable. */
export function reliquat(plafond: ValeurMontant, consomme: ValeurMontant): Decimal | null {
  const diff = moins(plafond, consomme);
  if (diff === null) return null;
  return diff.isNegative() ? new Prisma.Decimal(0) : diff;
}

/**
 * Comparaison exacte : renvoie −1 / 0 / +1 (a devant b), ou null si incomparable.
 * Remplace les opérateurs < > <= >= dès qu'un opérande vient de la base.
 */
export function comparer(a: ValeurMontant, b: ValeurMontant): number | null {
  const da = versDecimal(a);
  const db_ = versDecimal(b);
  if (da === null || db_ === null) return null;
  return da.comparedTo(db_);
}

/** a > b (exact). Renvoie false si incomparable — même sémantique que false de garde. */
export function superieurA(a: ValeurMontant, b: ValeurMontant): boolean {
  const c = comparer(a, b);
  return c !== null && c > 0;
}

/** a >= b (exact). */
export function superieurOuEgal(a: ValeurMontant, b: ValeurMontant): boolean {
  const c = comparer(a, b);
  return c !== null && c >= 0;
}

/** a <= b (exact). */
export function inferieurOuEgal(a: ValeurMontant, b: ValeurMontant): boolean {
  const c = comparer(a, b);
  return c !== null && c <= 0;
}

/** a < b (exact). */
export function inferieurA(a: ValeurMontant, b: ValeurMontant): boolean {
  const c = comparer(a, b);
  return c !== null && c < 0;
}

/** Test d'égalité exacte de deux valeurs monétaires (12,30 === "12.3"). */
export function egaux(a: ValeurMontant, b: ValeurMontant): boolean {
  const c = comparer(a, b);
  return c !== null && c === 0;
}

/**
 * Formate un nombre monétaire SANS devise : "1 234 567,89"
 * (pour les textes qui utilisent une autre devise : FCFA…).
 */
export function formaterNombre(valeur: ValeurMontant, sinon = "Non déterminé"): string {
  const d = versDecimal(valeur);
  if (d === null) return sinon;
  return d.toNumber().toLocaleString("fr-FR");
}

/**
 * Formate un montant pour affichage lisible : "1 234 567,89 Ar".
 * Renvoie `sinon` (défaut "Non déterminé") pour null/undefined/non numérique.
 */
export function formaterAr(valeur: ValeurMontant, sinon = "Non déterminé"): string {
  const d = versDecimal(valeur);
  if (d === null) return sinon;
  return `${d.toNumber().toLocaleString("fr-FR")} Ar`;
}

/** Formate un pourcentage à 1 décimale : ex 73,4%. */
export function formaterPourcent(part: ValeurMontant, total: ValeurMontant): string {
  const p = versDecimal(part);
  const t = versDecimal(total);
  if (p === null || t === null || t.isZero()) return "0%";
  const pct = p.div(t).mul(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
  return `${pct.toNumber().toLocaleString("fr-FR")}%`;
}
