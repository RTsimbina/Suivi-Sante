/**
 * Sérialisation JSON des Decimal — décision Vague 1 (plan P3).
 *
 * Par défaut, Prisma sérialise un champ Decimal en STRING dans les réponses
 * JSON (Decimal.prototype.toJSON → valueOf). Le frontend actuel traite les
 * montants comme des numbers (affichage, toFixed, graphiques) : basculer
 * brutalement en string casserait les vues (TypeError sur .toFixed).
 *
 * Décision : les réponses API sérialisent les Decimal en NUMBER —
 *   - compatibilité frontend totale (aucune vue à modifier) ;
 *   - la précision 2 décimales des montants en Ariary est préservée dans un
 *     double (≤ 2^53) pour l'AFFICHAGE ;
 *   - les calculs autoritaires restent en Decimal côté serveur (src/lib/money.ts)
 *     — c'est le point d'attention du plan P3 : la base stocke exact, les
 *     calculs calculent exact, seule la représentation d'affichage est un number.
 *
 * Le passage à une sérialisation string précise ("1234.56") se fera avec la
 * refonte frontend (TanStack Query + helpers de formatage) — Vague 2/3.
 *
 * Ce module est importé par src/lib/db.ts : il est donc actif dans chaque
 * process serveur qui touche la base, y compris les tests qui l'importent.
 */

import { Prisma } from "@prisma/client";

// decimal.js définit déjà Decimal.prototype.toJSON (→ string via valueOf).
// On le remplace par une conversion numérique contrôlée.
const decimalProto = Prisma.Decimal.prototype as { toJSON?: unknown };
decimalProto.toJSON = function (this: Prisma.Decimal): number {
  return this.toNumber();
};
