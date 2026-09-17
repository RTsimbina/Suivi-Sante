/**
 * ─── Système de filtrage par période (cœur réutilisable) ────────────────────
 *
 * Logique PURE (aucune dépendance) partagée par le client et le serveur :
 *
 * 1. Periodicités supportées : MENSUEL, BIMESTRIEL, TRIMESTRIEL, SEMESTRIEL,
 *    ANNUEL, PERSONNALISE (date début / date fin) + option "TOUTES"
 *    (« Toutes les périodes » = filtre désactivé).
 * 2. Fuseau de référence de la plateforme : Indian/Antananarivo (UTC+3),
 *    déjà utilisé par les rapports mensuels (api/reporting/rapport).
 *    Les bornes calculées sont converties en instants UTC pour Prisma.
 * 3. Contrat d'URL (identique client → serveur) :
 *      periodeMode    : TOUTES | MENSUEL | BIMESTRIEL | TRIMESTRIEL | SEMESTRIEL | ANNUEL | PERSONNALISE
 *      periodeAnnee   : ex. 2026
 *      periodeIndex   : 1..12 (mensuel), 1..6 (bimestriel), 1..4 (trimestriel), 1..2 (semestriel)
 *      periodeDebut   : YYYY-MM-DD (personnalisé, inclusif)
 *      periodeFin     : YYYY-MM-DD (personnalisé, inclusif)
 *    Absence de periodeMode (ou TOUTES) ⇒ aucun filtrage.
 * 4. Dates de référence par module (définies ici pour toute la plateforme) :
 *      - Dossiers / KPIs / Kanban / IA / Portail : Dossier.dateReception
 *      - Réception (courriels)                   : Courriel.dateCourriel
 *      - Reporting — contrats                    : Contrat.dateDebut
 *      - Reporting — appels de fonds             : AppelDeFonds.dateAppel
 *      - Journal de bord                         : HistoriqueParametre.dateModification
 * ────────────────────────────────────────────────────────────────────────── */

/** Fuseau horaire de référence de la plateforme (Madagascar, UTC+3, sans heure d'été). */
export const FUSEAU_PLATEFORME = 'Indian/Antananarivo';

/** Première année sélectionnable dans les filtres. */
export const ANNEE_MIN = 2023;

export type ModePeriode =
  | 'TOUTES'
  | 'MENSUEL'
  | 'BIMESTRIEL'
  | 'TRIMESTRIEL'
  | 'SEMESTRIEL'
  | 'ANNUEL'
  | 'PERSONNALISE';

export type Periodicite = Exclude<ModePeriode, 'TOUTES'>;

/** Sélection complète d'un filtre de période (état du composant). */
export interface SelectionPeriode {
  mode: ModePeriode;
  /** Année de référence (toutes les periodicités sauf PERSONNALISE). */
  annee: number;
  /** Index de la période dans l'année (1-based) selon la periodicité. */
  index?: number;
  /** Date de début YYYY-MM-DD (mode PERSONNALISE, inclusif). */
  debut?: string;
  /** Date de fin YYYY-MM-DD (mode PERSONNALISE, inclusif). */
  fin?: string;
}

/** Plage temporelle résolue. `fin` est EXCLUSIVE (borne ouverte, style Prisma `lt`). */
export interface PlagePeriode {
  debut: Date;
  /** Exclusif : la donnée doit vérifier `date >= debut && date < fin`. */
  fin: Date;
}

const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const;

/** Libellés des periodicités proposées à l'utilisateur. */
export const PERIODICITES: { value: ModePeriode; label: string }[] = [
  { value: 'TOUTES', label: 'Toutes les périodes' },
  { value: 'MENSUEL', label: 'Mensuel' },
  { value: 'BIMESTRIEL', label: 'Bimestriel' },
  { value: 'TRIMESTRIEL', label: 'Trimestriel' },
  { value: 'SEMESTRIEL', label: 'Semestriel' },
  { value: 'ANNUEL', label: 'Annuel' },
  { value: 'PERSONNALISE', label: 'Personnalisé' },
];

/* ──────────────────────────────────────────────────────────────
   Utilitaires fuseau horaire
   ────────────────────────────────────────────────────────────── */

/** Décalage (ms) du fuseau donné à l'instant donné : heure locale − UTC. */
export function decalageFuseauMs(date: Date, fuseau: string = FUSEAU_PLATEFORME): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  const heure = p.hour === 24 ? 0 : p.hour; // certains moteurs renvoient 24 pour minuit
  const asUTC = Date.UTC(p.year, (p.month ?? 1) - 1, p.day ?? 1, heure, p.minute ?? 0, p.second ?? 0);
  return asUTC - date.getTime();
}

/**
 * Convertit une date/heures LOCALES (dans le fuseau de la plateforme)
 * en instant UTC équivalent. Ex. : 2026-01-01 00:00 Antananarivo → 2025-12-31T21:00:00Z.
 */
export function zonedVersUtc(
  annee: number,
  mois: number,
  jour: number,
  heure = 0,
  minute = 0,
  fuseau: string = FUSEAU_PLATEFORME,
): Date {
  const base = Date.UTC(annee, mois - 1, jour, heure, minute, 0, 0);
  const decalage = decalageFuseauMs(new Date(base), fuseau);
  return new Date(base - decalage);
}

/** Année courante dans le fuseau de la plateforme. */
export function anneeCouranteFuseau(fuseau: string = FUSEAU_PLATEFORME): number {
  try {
    const annee = new Intl.DateTimeFormat('en-US', { timeZone: fuseau, year: 'numeric' })
      .formatToParts(new Date())
      .find((p) => p.type === 'year')?.value;
    const n = annee ? parseInt(annee, 10) : NaN;
    return Number.isInteger(n) ? n : new Date().getFullYear();
  } catch {
    return new Date().getFullYear();
  }
}

/** Formate un instant en date ISO courte YYYY-MM-DD (dans le fuseau plateforme). */
export function versDateISO(date: Date, fuseau: string = FUSEAU_PLATEFORME): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(date); // en-CA ⇒ "YYYY-MM-DD"
}

/** Formate un instant en date française dd/mm/yyyy (dans le fuseau plateforme). */
export function formatDateFrFuseau(date: Date, fuseau: string = FUSEAU_PLATEFORME): string {
  const dtf = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return dtf.format(date);
}

/** Décompose un instant en composantes locales du fuseau plateforme. */
export function partiesLocales(
  date: Date,
  fuseau: string = FUSEAU_PLATEFORME,
): { annee: number; mois: number; jour: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return { annee: p.year, mois: p.month, jour: p.day };
}

/** Analyse une chaîne YYYY-MM-DD stricte. Retourne null si invalide. */
export function parserDateISO(valeur: string | undefined | null): { annee: number; mois: number; jour: number } | null {
  if (!valeur) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const annee = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10);
  const jour = parseInt(m[3], 10);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const sonde = new Date(Date.UTC(annee, mois - 1, jour));
  if (sonde.getUTCMonth() !== mois - 1 || sonde.getUTCDate() !== jour) return null;
  return { annee, mois, jour };
}

/* ──────────────────────────────────────────────────────────────
   Options et libellés (français)
   ────────────────────────────────────────────────────────────── */

/** Nombre de périodes par année pour une periodicité donnée (0 si non applicable). */
export function nbPeriodesParAnnee(mode: ModePeriode): number {
  switch (mode) {
    case 'MENSUEL': return 12;
    case 'BIMESTRIEL': return 6;
    case 'TRIMESTRIEL': return 4;
    case 'SEMESTRIEL': return 2;
    case 'ANNUEL': return 1;
    default: return 0;
  }
}

/** Mois de début (0-based) de la i-ème période de l'année. */
function moisDebutIndex(mode: Periodicite, index: number): number {
  return (index - 1) * (12 / nbPeriodesParAnnee(mode));
}

/** Libellé français d'une période (ex. « Janvier 2026 », « T1 2026 », « S2 2026 »). */
export function libelleOptionPeriode(mode: Periodicite, annee: number, index: number): string {
  const nb = nbPeriodesParAnnee(mode);
  if (nb === 0 || !Number.isInteger(index) || index < 1 || index > nb) return '—';
  switch (mode) {
    case 'MENSUEL': {
      const m = moisDebutIndex(mode, index);
      return `${MOIS_NOMS[m]} ${annee}`;
    }
    case 'BIMESTRIEL': {
      const m = moisDebutIndex(mode, index);
      return `${MOIS_NOMS[m]} – ${MOIS_NOMS[m + 1]} ${annee}`;
    }
    case 'TRIMESTRIEL':
      return `T${index} ${annee}`;
    case 'SEMESTRIEL':
      return `S${index} ${annee}`;
    case 'ANNUEL':
      return `Année ${annee}`;
    default:
      return '—';
  }
}

/** Options de la liste « période » pour une periodicité + année. */
export function getOptionsPeriode(mode: ModePeriode, annee: number): { value: string; label: string }[] {
  const nb = nbPeriodesParAnnee(mode);
  const options: { value: string; label: string }[] = [];
  for (let i = 1; i <= nb; i++) {
    // nb > 0 garantit que mode est une periodicité bornée (pas TOUTES/PERSONNALISE)
    options.push({ value: String(i), label: libelleOptionPeriode(mode as Periodicite, annee, i) });
  }
  return options;
}

/** Années proposées dans le sélecteur (ANNEE_MIN → année courante + 1). */
export function getOptionsAnnee(): { value: string; label: string }[] {
  const fin = anneeCouranteFuseau() + 1;
  const options: { value: string; label: string }[] = [];
  for (let a = fin; a >= ANNEE_MIN; a--) options.push({ value: String(a), label: String(a) });
  return options;
}

/* ──────────────────────────────────────────────────────────────
   Calcul des plages
   ────────────────────────────────────────────────────────────── */

/**
 * Résout une sélection en plage temporelle UTC (fin EXCLUSIVE).
 * Retourne null si la sélection ne filtre rien (TOUTES) ou est invalide/incomplète.
 */
export function calculePlage(selection: SelectionPeriode | null | undefined): PlagePeriode | null {
  if (!selection || !selection.mode || selection.mode === 'TOUTES') return null;

  const annee = selection.annee;
  if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) return null;

  switch (selection.mode) {
    case 'MENSUEL':
    case 'BIMESTRIEL':
    case 'TRIMESTRIEL':
    case 'SEMESTRIEL': {
      const nb = nbPeriodesParAnnee(selection.mode);
      const index = selection.index;
      if (!Number.isInteger(index) || index! < 1 || index! > nb) return null;
      const moisDebut = moisDebutIndex(selection.mode, index!) + 1; // 1-based
      const moisFin = moisDebut + (12 / nb); // exclu
      const debut = moisFin <= 12 ? zonedVersUtc(annee, moisFin, 1) : zonedVersUtc(annee + 1, 1, 1);
      return { debut: zonedVersUtc(annee, moisDebut, 1), fin: debut };
    }
    case 'ANNUEL':
      return { debut: zonedVersUtc(annee, 1, 1), fin: zonedVersUtc(annee + 1, 1, 1) };
    case 'PERSONNALISE': {
      const d = parserDateISO(selection.debut);
      const f = parserDateISO(selection.fin);
      if (!d || !f) return null;
      const debut = zonedVersUtc(d.annee, d.mois, d.jour);
      // Fin exclusive = lendemain de la date de fin (Date.UTC gère les débordements de mois).
      const fin = zonedVersUtc(f.annee, f.mois, f.jour + 1);
      if (fin.getTime() <= debut.getTime()) return null;
      return { debut, fin };
    }
    default:
      return null;
  }
}

/** Libellé français principal d'une sélection (ex. « Janvier 2026 », « T1 2026 »). */
export function libellePeriode(selection: SelectionPeriode | null | undefined): string {
  if (!selection || !selection.mode || selection.mode === 'TOUTES') return 'Toutes les périodes';
  if (selection.mode === 'PERSONNALISE') {
    const d = parserDateISO(selection.debut);
    const f = parserDateISO(selection.fin);
    if (!d || !f) return 'Période personnalisée (incomplète)';
    return `du ${String(d.jour).padStart(2, '0')}/${String(d.mois).padStart(2, '0')}/${d.annee}` +
      ` au ${String(f.jour).padStart(2, '0')}/${String(f.mois).padStart(2, '0')}/${f.annee}`;
  }
  return libelleOptionPeriode(selection.mode, selection.annee, selection.index ?? 1);
}

/** Détail des bornes d'une plage résolue : « 01/01/2026 → 31/01/2026 » (fuseau plateforme). */
export function libellePlage(plage: PlagePeriode | null | undefined): string {
  if (!plage) return '';
  const dernierInstant = new Date(plage.fin.getTime() - 1);
  return `${formatDateFrFuseau(plage.debut)} → ${formatDateFrFuseau(dernierInstant)}`;
}

/* ──────────────────────────────────────────────────────────────
   Sérialisation URL (client → serveur)
   ────────────────────────────────────────────────────────────── */

/** Sérialise une sélection en paramètres d'URL. « TOUTES » ⇒ paramètres vides. */
export function selectionVersParams(selection: SelectionPeriode | null | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!selection || !selection.mode || selection.mode === 'TOUTES') return params;
  params.set('periodeMode', selection.mode);
  if (selection.mode === 'PERSONNALISE') {
    if (selection.debut) params.set('periodeDebut', selection.debut);
    if (selection.fin) params.set('periodeFin', selection.fin);
  } else {
    if (Number.isInteger(selection.annee)) params.set('periodeAnnee', String(selection.annee));
    if (Number.isInteger(selection.index) && selection.mode !== 'ANNUEL') {
      params.set('periodeIndex', String(selection.index));
    }
  }
  return params;
}

/* ──────────────────────────────────────────────────────────────
   Côté serveur : lecture des paramètres + builder Prisma
   ────────────────────────────────────────────────────────────── */

/**
 * Lit les paramètres de période d'une requête et retourne la plage résolue.
 * Retourne null si absents / « TOUTES » / invalides ⇒ aucun filtrage (comportement sûr).
 */
export function plageDepuisParams(params: URLSearchParams): PlagePeriode | null {
  const mode = (params.get('periodeMode') || '').toUpperCase() as ModePeriode;
  if (!mode || mode === 'TOUTES') return null;
  if (!PERIODICITES.some((p) => p.value === mode)) return null;

  if (mode === 'PERSONNALISE') {
    return calculePlage({
      mode,
      annee: anneeCouranteFuseau(),
      debut: params.get('periodeDebut') || undefined,
      fin: params.get('periodeFin') || undefined,
    });
  }

  const annee = parseInt(params.get('periodeAnnee') || '', 10);
  const index = parseInt(params.get('periodeIndex') || '', 10);
  return calculePlage({
    mode,
    annee: Number.isInteger(annee) ? annee : anneeCouranteFuseau(),
    index: Number.isInteger(index) ? index : 1,
  });
}

/**
 * Construit le fragment de filtre Prisma `{ champ: { gte, lt } }` pour une plage.
 * À fusionner dans un `where` existant (sémantique AND entre champs).
 */
export function filtreDateChamp(
  champ: string,
  plage: PlagePeriode | null | undefined,
): Record<string, { gte: Date; lt: Date }> {
  if (!plage) return {};
  return { [champ]: { gte: plage.debut, lt: plage.fin } };
}
