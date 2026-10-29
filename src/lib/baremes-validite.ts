/**
 * baremes-validite.ts — Validité datée et versionnement des barèmes (P1).
 * ────────────────────────────────────────────────────────────────────────────
 * AVANT : le modèle Bareme n'avait qu'une ligne par (societeId, prestation),
 * écrasée à chaque modification — les anciens taux étaient perdus et aucun
 * remboursement passé n'était justifiable. La sélection du tarif reposait sur
 * le seul flag administratif `active`, sans dimension temporelle.
 *
 * APRÈS (conception documentée) :
 *   - Chaque barème porte une PÉRIODE DE VALIDITÉ : valideDu (obligatoire)
 *     et valideAu (facultatif — NULL = version en cours).
 *   - Chaque combinaison (societeId, prestation) peut porter PLUSIEURS
 *     VERSIONS : modifier un taux CLÔTURE la version courante (valideAu =
 *     veille du nouveau début) et CRÉE une nouvelle version. Aucune donnée
 *     historique n'est écrasée ni supprimée (soft-delete `supprime`).
 *   - `active` reste un statut ADMINISTRATIF (suspension) DISTINCT de la
 *     validité temporelle : un barème clôturé (valideAu passé) reste
 *     consultable pour la justification des remboursements passés, même s'il
 *     ne peut plus servir un nouveau calcul.
 *   - Les calculs de remboursement sélectionnent la version VALIDE À LA DATE
 *     DE LA PRESTATION (dossier.dateSoins, à défaut dateReception).
 *
 * Sémantique des bornes : INCLUSIVE des deux côtés ([du, au] — les périodes
 * se chevauchent dès qu'elles partagent un seul jour). La clôture « à la
 * veille » (valideAu = nouveau valideDu − 1 jour) garantit une continuité
 * sans chevauchement ni trou.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Champs minimum requis par les fonctions de validité (Prisma ou mock). */
export interface BaremeDated {
  id: string;
  societeId: string;
  prestation: string;
  tauxCouverture: number;
  plafond: unknown; // Decimal | number — les calculs restent côté appelant
  description: string | null;
  active: boolean;
  valideDu: Date;
  valideAu: Date | null;
  version: number;
  supprime: boolean;
}

/**
 * Délégate Prisma minimal (client ou transaction `tx`). Les arguments sont
 * typés largement (any) volontairement : le délégué généré par Prisma est
 * générique et ne serait pas assigné à une signature stricte — le typage
 * STRICT s'applique aux RETOURS (BaremeDated) consommés par les calculs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BaremeDelegate {
  findFirst(args: any): Promise<BaremeDated | null>;
  findMany(args: any): Promise<BaremeDated[]>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Prédicats purs (testés unitairement) ────────────────────────────────────

/** Normalise une prestation pour la recherche (trim + casse des barèmes). */
export function normaliserPrestation(prestation: string): string {
  return prestation.trim().toUpperCase();
}

/**
 * true si la version est valide à la date donnée (bornes INCLUSIVES).
 * Un barème administrativement désactivé peut rester « valide » sur sa
 * période passée : la distinction active/validité est assumée — le calcul
 * d'un NOUVEAU remboursement combine les deux filtres (voir ci-dessous).
 */
export function estValideALaDate(bareme: BaremeDated, date: Date): boolean {
  if (bareme.supprime) return false;
  if (bareme.valideDu.getTime() > date.getTime()) return false;
  if (bareme.valideAu && bareme.valideAu.getTime() < date.getTime()) return false;
  return true;
}

/**
 * Version en vigueur pour un NOUVEAU calcul à la date donnée :
 * non supprimée + administrativement active + période couvrant la date.
 */
export function estEnVigueurPourCalcul(bareme: BaremeDated, date: Date): boolean {
  return bareme.active && estValideALaDate(bareme, date);
}

/**
 * true si les deux périodes se chevauchent (au moins un jour partagé).
 * NULL signifie « ouvert » (+∞ pour la borne de fin).
 */
export function periodesSeChevauchent(
  aDu: Date, aAu: Date | null,
  bDu: Date, bAu: Date | null,
): boolean {
  const aFin = aAu?.getTime() ?? Number.POSITIVE_INFINITY;
  const bFin = bAu?.getTime() ?? Number.POSITIVE_INFINITY;
  return aDu.getTime() <= bFin && bDu.getTime() <= aFin;
}

export interface ChevauchementDetecte {
  id: string;
  version: number;
  valideDu: Date;
  valideAu: Date | null;
}

/**
 * Détecte les versions EN CONFLIT de période parmi les versions existantes
 * (non supprimées) d'une même combinaison (societeId, prestation).
 * `excludeId` permet d'exclure la version en cours de modification.
 */
export function detecterChevauchements(
  existants: BaremeDated[],
  candidat: { valideDu: Date; valideAu: Date | null; excludeId?: string },
): ChevauchementDetecte[] {
  return existants
    .filter((b) => !b.supprime && b.id !== candidat.excludeId)
    .filter((b) =>
      periodesSeChevauchent(candidat.valideDu, candidat.valideAu, b.valideDu, b.valideAu),
    )
    .map((b) => ({ id: b.id, version: b.version, valideDu: b.valideDu, valideAu: b.valideAu }));
}

/**
 * Déduit la version suivante pour une combinaison : max(version) + 1.
 */
export function prochaineVersion(existants: BaremeDated[]): number {
  return existants.reduce((max, b) => Math.max(max, b.version), 0) + 1;
}

/**
 * Veille d'une date (clôture d'une version remplacée) : valideDu − 1 jour.
 * La période clôturée [ancienDu, veille] et la nouvelle [du, …] ne se
 * chevauchent pas (bornes inclusives) et ne laissent aucun trou.
 */
export function veilleDe(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/**
 * Déduplique une liste plate de barèmes (toutes sociétés / toutes versions)
 * en ne gardant que la version EN VIGUEUR à la date donnée, une par
 * combinaison (societeId, prestation). Utilisé par les vues et les contrôles
 * globaux (plafond annuel global, portails) pour éviter le double comptage
 * des versions historiques. Les combinaisons sans version en vigueur
 * (période future ou entièrement clôturée) sont exclues.
 */
export function dedupliquerEnVigueur(baremes: BaremeDated[], date: Date): BaremeDated[] {
  const parCombinaison = new Map<string, BaremeDated>();
  for (const b of baremes) {
    if (!estEnVigueurPourCalcul(b, date)) continue;
    const cle = `${b.societeId}::${normaliserPrestation(b.prestation)}`;
    const actuelle = parCombinaison.get(cle);
    if (
      !actuelle ||
      b.valideDu.getTime() > actuelle.valideDu.getTime() ||
      (b.valideDu.getTime() === actuelle.valideDu.getTime() && b.version > actuelle.version)
    ) {
      parCombinaison.set(cle, b);
    }
  }
  return [...parCombinaison.values()];
}

// ─── Accès base (client ou transaction) ──────────────────────────────────────

/**
 * Sélectionne la version du barème à utiliser pour un calcul à la date de
 * prestation : la plus récente parmi les versions couvrant la date
 * (valideDu DESC, version DESC), non supprimée, administrativement active.
 * Renvoie null si aucun tarif ne couvre la combinaison à cette date —
 * l'appelant répond « non couvert » (fail-closed, comme avant le P1).
 */
export async function trouverBaremeValide(
  db: BaremeDelegate,
  params: { societeId: string; prestation: string; date: Date },
): Promise<BaremeDated | null> {
  return db.bareme.findFirst({
    where: {
      societeId: params.societeId,
      prestation: normaliserPrestation(params.prestation),
      supprime: false,
      active: true,
      valideDu: { lte: params.date },
      OR: [{ valideAu: null }, { valideAu: { gte: params.date } }],
    },
    orderBy: [{ valideDu: 'desc' }, { version: 'desc' }],
    take: 1,
  });
}

/**
 * Filtre Prisma réutilisable « en vigueur à la date donnée » (clause where du
 * modèle Bareme) : vivant, administrativement actif, période couvrant la
 * date. Combinable avec d'autres critères (societeId, prestation, …).
 * L'anti-chevauchement garanti à l'écriture fait qu'UNE seule version par
 * combinaison satisfait ce filtre à un instant donné.
 */
export function filtreEnVigueur(date: Date = new Date()): Record<string, unknown> {
  return {
    supprime: false,
    active: true,
    valideDu: { lte: date },
    OR: [{ valideAu: null }, { valideAu: { gte: date } }],
  };
}

/**
 * Charge TOUTES les versions d'une combinaison — y compris les versions
 * soft-supprimées : le calcul de la prochaine version doit tenir compte des
 * numéros déjà consommés (l'unicité (societeId, prestation, version) couvre
 * toutes les lignes). Les filtres (supprime, période) s'appliquent ensuite
 * selon l'usage (courante = !supprime && valideAu === null).
 */
export async function chargerVersionsCombinaison(
  db: BaremeDelegate,
  params: { societeId: string; prestation: string },
): Promise<BaremeDated[]> {
  return db.bareme.findMany({
    where: {
      societeId: params.societeId,
      prestation: normaliserPrestation(params.prestation),
    },
    orderBy: [{ version: 'asc' }],
  });
}
