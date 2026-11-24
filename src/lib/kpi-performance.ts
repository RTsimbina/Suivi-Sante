/**
 * kpi-performance.ts — Moteur de calcul des KPI de performance individuelle.
 * ────────────────────────────────────────────────────────────────────────────
 * SOURCE UNIQUE des chiffres : tableaux de bord, détail individuel, alertes et
 * exports (Excel/PDF) consomment tous les mêmes fonctions — la cohérence entre
 * surfaces est garantie par construction (exigence audit §11/§12).
 *
 * Formules (règle de non double comptage : une étape = une période de
 * responsabilité dossier × service ; un dossier traversant trois services
 * compte une fois PAR SERVICE dans les décomptes par service, une fois au
 * global grâce au distinct sur dossierId) :
 *
 *  attribués(S,C,P)    = étapes TRAVAIL de service S du collaborateur C dont
 *                        dateAffectation ∈ P
 *  traités(S,C,P)      = étapes TRAVAIL de S/C fermées (dateFin) dans P
 *                        — global : distinct dossierId
 *  enCours             = étapes TRAVAIL ouvertes (dateFin NULL) à la fin de P
 *  enRetard            = enCours dont le temps actif dépasse l'objectif du
 *                        (service, typeDossier)
 *  priseEnCharge       = dateDebut − dateAffectation (étapes avec dateDebut)
 *  tempsActif          = (dateFin − dateDebut) − Σ durées de suspension
 *                        intersectées ; si dateDebut est NULL à la fermeture,
 *                        il est posé à dateFin (« traitement instantané »)
 *  tempsMoyenTraitement= moyenne(tempsActif) des étapes fermées dans P
 *  délaiMédian         = médiane des mêmes tempsActif
 *  tauxRespect         = étapes fermées dans P avec tempsActif ≤ objectif /
 *                        étapes fermées dans P (« éligibles et terminées » ;
 *                        les dossiers suspendus restent éligibles car leur
 *                        suspension est déjà exclue du temps actif ; une
 *                        étape réaffectée compte pour chaque responsable sur
 *                        sa propre période)
 *  tauxRetour          = distinct dossiers avec événement RETOUR_CORRECTION
 *                        daté dans P ÷ traités (distinct) × 100
 *
 * Distinction des quatre notions de délai (exigence §4) :
 *   1. délai d'attente avant prise en charge = dateDebut − dateAffectation ;
 *   2. temps de traitement actif = tempsActif ci-dessus ;
 *   3. délai total de responsabilité = dateFin − dateAffectation − suspensions ;
 *   4. délai global réception→clôture = dateFin de la dernière étape −
 *      dateReception du dossier (calculé hors moteur, cf. delaiGlobalDossier).
 */

import { Prisma, type EtapeTraitement, type EtapeSuspension } from '@prisma/client';
import { db } from './db';
import {
  SERVICES_KPI, OBJECTIFS_DEFAUT_MINUTES, SEUILS_DEFAUT,
  type ServiceKpi,
} from './kpi-etapes';
import { round2 } from './kpi-queries';

type Tx = Prisma.TransactionClient;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PeriodeKpi { debut: Date; fin: Date; }

export interface FiltresKpi {
  service?: string;
  userId?: string;
  societeId?: string;
  typeDossier?: string;
  statut?: string;
}

export type EtapeChargee = EtapeTraitement & {
  suspensions: EtapeSuspension[];
  dossier: { id: string; typeDossier: string; societeId: string; statut: string; dateReception: Date; numeroDossier: string };
};

export interface KpiCollaborateur {
  userId: string;
  nom?: string;
  service?: string;
  attribues: number;
  traites: number;
  enCours: number;
  enRetard: number;
  delaiMoyenPriseEnChargeMin: number | null;
  tempsMoyenTraitementMin: number | null;
  delaiMedianTraitementMin: number | null;
  tauxRespectDelais: number | null;
  tauxRetourCorrection: number | null;
  evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
}

export interface KpiService extends Omit<KpiCollaborateur, 'userId' | 'nom' | 'service' | 'evolutionMensuelle'> {
  service: string;
  evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
}

export interface KpiGlobal {
  totalTraites: number;
  totalAffectes: number;
  enCours: number;
  enRetard: number;
  delaiMoyenTraitementMin: number | null;
  delaiMedianTraitementMin: number | null;
  delaiMoyenResponsabiliteMin: number | null;
  tauxRespectDelais: number | null;
  tauxRetourCorrection: number | null;
  parService: KpiService[];
  parCollaborateur: KpiCollaborateur[];
  evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
  evolutionAnnuelle: { annee: string; traites: number; tauxRespect: number | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_MIN = 60_000;

function minutes(ms: number): number { return round2(ms / MS_MIN); }

function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(tri.length / 2);
  return tri.length % 2 === 1 ? round2(tri[m]) : round2((tri[m - 1] + tri[m]) / 2);
}

function moyenne(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return round2(valeurs.reduce((s, v) => s + v, 0) / valeurs.length);
}

/** Intersection [a1,b1] ∩ [a2,b2] en ms (b2 null = ouverte). */
function intersectionMs(a1: Date, b1: Date, a2: Date, b2: Date | null): number {
  const debut = Math.max(a1.getTime(), a2.getTime());
  const fin = Math.min(b1.getTime(), (b2 ?? new Date(b1.getTime() + 1)).getTime());
  return Math.max(0, fin - debut);
}

/** Temps ACTIF d'une étape dans la fenêtre de mesure (suspensions exclues). */
export function tempsActifMs(
  etape: Pick<EtapeTraitement, 'dateAffectation' | 'dateDebut' | 'dateFin'>,
  suspensions: Array<Pick<EtapeSuspension, 'suspenduA' | 'reprisA' | 'motif'>>,
  finMesure: Date,
): number {
  const debut = (etape.dateDebut ?? etape.dateAffectation).getTime();
  const fin = Math.min((etape.dateFin ?? finMesure).getTime(), finMesure.getTime());
  if (fin <= debut) return 0;
  let actif = fin - debut;
  for (const s of suspensions) {
    actif -= intersectionMs(new Date(debut), new Date(fin), s.suspenduA, s.reprisA);
  }
  return Math.max(0, actif);
}

/** Délai global réception → clôture (dernière étape fermée) d'un dossier, min. */
export function delaiGlobalDossier(
  dateReception: Date,
  etapes: { dateFin: Date | null; service: string }[],
): number | null {
  const fins = etapes.filter((e) => e.dateFin).map((e) => (e.dateFin as Date).getTime());
  if (fins.length === 0) return null;
  return minutes(Math.max(...fins) - dateReception.getTime());
}

/** Clé mensuelle (fuseau plateforme Indian/Antananarivo, +03 sans DST). */
function cleMois(d: Date): string {
  const t = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
function cleAnnee(d: Date): string {
  const t = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return String(t.getUTCFullYear());
}

// ─── Objectifs et seuils ─────────────────────────────────────────────────────

export interface ObjectifLigne { service: string; typeDossier: string | null; delaiMinutes: number; }

/** Objectif effectif pour (service, typeDossier) — spécifique sinon général. */
export function objectifPour(
  objectifs: ObjectifLigne[], service: string, typeDossier: string | null,
): number {
  if (typeDossier) {
    const specifique = objectifs.find((o) => o.service === service && o.typeDossier === typeDossier);
    if (specifique) return specifique.delaiMinutes;
  }
  const general = objectifs.find((o) => o.service === service && o.typeDossier === null);
  if (general) return general.delaiMinutes;
  return OBJECTIFS_DEFAUT_MINUTES[service as ServiceKpi] ?? 480;
}

/** Versions d'objectifs EN VIGUEUR (valideAu NULL). */
export async function chargerObjectifs(tx?: Tx): Promise<ObjectifLigne[]> {
  return (tx ?? db).objectifDelai.findMany({
    where: { valideAu: null },
    select: { service: true, typeDossier: true, delaiMinutes: true },
  });
}

export interface SeuilLigne { service: string; typeAlerte: string; valeur: number; }

export async function chargerSeuils(tx?: Tx): Promise<SeuilLigne[]> {
  return (tx ?? db).seuilAlerteKpi.findMany({
    select: { service: true, typeAlerte: true, valeur: true },
  });
}

export function seuilPour(seuils: SeuilLigne[], service: string, typeAlerte: keyof typeof SEUILS_DEFAUT): number {
  const s = seuils.find((x) => x.service === service && x.typeAlerte === typeAlerte)
    ?? seuils.find((x) => x.service === 'GLOBAL' && x.typeAlerte === typeAlerte);
  return s ? s.valeur : SEUILS_DEFAUT[typeAlerte];
}

// ─── Chargement des étapes ───────────────────────────────────────────────────

/**
 * Étapes chevauchant la période (affectation avant `fin`, sortie après `debut`
 * ou encore ouvertes), avec suspensions et dossier associé.
 */
/**
 * Volume maximal d'étapes chargées en mémoire par une période du moteur KPI.
 * Le moteur agrège en JavaScript (multi-passes) : au-delà de ce seuil, la
 * requête est refusée AVANT le chargement (comptage SQL) avec une erreur
 * explicite au lieu d'épuiser la mémoire du processus (crash OOM constaté
 * sur /api/kpis avec 1 000 000 de dossiers). ~150 k étapes ≈ un mois
 * d'activité sur le jeu de démonstration ; le seuil laisse une large marge.
 */
export const LIMITE_ETAPES_PERIODE = 500_000;

export class KpiVolumeEtapesDepasse extends Error {
  constructor(readonly total: number, readonly limite: number = LIMITE_ETAPES_PERIODE) {
    super(
      `Période trop large pour le moteur KPI : ${total} étapes à charger (limite ${limite}). ` +
      'Restreindre la période (mensuel) ou filtrer par service/utilisateur.',
    );
    this.name = 'KpiVolumeEtapesDepasse';
  }
}

export async function chargerEtapesPeriode(periode: PeriodeKpi, filtres: FiltresKpi = {}, tx?: Tx): Promise<EtapeChargee[]> {
  const where: Prisma.EtapeTraitementWhereInput = {
    dateAffectation: { lt: periode.fin },
    OR: [{ dateFin: null }, { dateFin: { gte: periode.debut } }],
  };
  if (filtres.service) where.service = filtres.service;
  if (filtres.userId) where.userId = filtres.userId;
  // ─── Garde anti-OOM : comptage SQL AVANT tout chargement mémoire ────
  const volume = await (tx ?? db).etapeTraitement.count({ where });
  if (volume > LIMITE_ETAPES_PERIODE) throw new KpiVolumeEtapesDepasse(volume);
  const dossier: Prisma.DossierWhereInput = {};
  if (filtres.societeId) dossier.societeId = filtres.societeId;
  if (filtres.typeDossier) dossier.typeDossier = filtres.typeDossier;
  if (filtres.statut) dossier.statut = filtres.statut;
  if (Object.keys(dossier).length > 0) where.dossier = dossier;

  return (tx ?? db).etapeTraitement.findMany({
    where,
    include: {
      suspensions: true,
      dossier: { select: { id: true, typeDossier: true, societeId: true, statut: true, dateReception: true, numeroDossier: true } },
    },
    orderBy: { dateAffectation: 'asc' },
  }) as Promise<EtapeChargee[]>;
}

// ─── Agrégations ─────────────────────────────────────────────────────────────

interface StatsBrutes {
  attribues: number;
  traites: number;
  dossiersTraites: Set<string>;
  enCours: number;
  enRetard: number;
  temps: number[];
  priseEnCharge: number[];
  retoursDossiers: Set<string>;
  parMois: Map<string, { traites: number; conformes: number; total: number }>;
  parAnnee: Map<string, { traites: number; conformes: number; total: number }>;
}

function statsVides(): StatsBrutes {
  return {
    attribues: 0, traites: 0, dossiersTraites: new Set(), enCours: 0, enRetard: 0,
    temps: [], priseEnCharge: [], retoursDossiers: new Set(),
    parMois: new Map(), parAnnee: new Map(),
  };
}

function bucket(map: Map<string, { traites: number; conformes: number; total: number }>, cle: string) {
  return map.get(cle) ?? { traites: 0, conformes: 0, total: 0 };
}

/**
 * Agrège un sous-ensemble d'étapes (déjà filtrées par périmètre). Les événements
 * RETOUR_CORRECTION comptent pour les retours uniquement ; les étapes TRAVAIL
 * fermées forment les « traités » ; la mesure `finMesure` borne les étapes
 * ouvertes (now pour un tableau vivant, fin de période pour un historique).
 */
function agreger(
  etapes: EtapeChargee[], periode: PeriodeKpi, finMesure: Date,
  objectifs: ObjectifLigne[], inclureHistorique: boolean,
): StatsBrutes {
  const s = statsVides();
  for (const e of etapes) {
    const obj = objectifPour(objectifs, e.service, e.dossier.typeDossier);
    if (e.type === 'RETOUR_CORRECTION') {
      if (e.dateAffectation >= periode.debut && e.dateAffectation < periode.fin) {
        s.retoursDossiers.add(e.dossierId);
      }
      continue;
    }
    if (e.dateAffectation >= periode.debut && e.dateAffectation < periode.fin) s.attribues++;
    if (e.dateFin) {
      const finEtape = (e.dateFin as Date).getTime();
      if (finEtape >= periode.debut.getTime() && finEtape < periode.fin.getTime()) {
        s.traites++;
        s.dossiersTraites.add(e.dossierId);
        const actif = tempsActifMs(e, e.suspensions, finMesure);
        s.temps.push(minutes(actif));
        if (e.dateDebut) {
          s.priseEnCharge.push(minutes((e.dateDebut as Date).getTime() - e.dateAffectation.getTime()));
        }
        const conforme = actif <= obj * MS_MIN;
        for (const [map, cle] of [[s.parMois, cleMois(e.dateFin as Date)], [s.parAnnee, cleAnnee(e.dateFin as Date)]] as const) {
          if (inclureHistorique || map === s.parMois) {
            const b = bucket(map, cle);
            b.traites++; b.total++;
            if (conforme) b.conformes++;
            map.set(cle, b);
          }
        }
      }
    } else {
      // Ouverte à la mesure : « en cours » si affectée avant la fin de période
      s.enCours++;
      const actif = tempsActifMs(e, e.suspensions, finMesure);
      if (actif > obj * MS_MIN) s.enRetard++;
    }
  }
  return s;
}

/**
 * Calcul complet : global + par service + par collaborateur.
 * `nomsUtilisateurs` map optionnelle userId → nom (UI/exports).
 */
export function calculerPerformance(
  etapes: EtapeChargee[], periode: PeriodeKpi, objectifs: ObjectifLigne[],
  options: { noms?: Map<string, string>; inclureAnnuel?: boolean } = {},
): KpiGlobal {
  const finMesure = new Date(Math.min(periode.fin.getTime(), Date.now()));
  const inclureAnnuel = options.inclureAnnuel ?? true;

  // Global (toutes étapes du périmètre)
  const g = agreger(etapes, periode, finMesure, objectifs, inclureAnnuel);
  const tempsMsBruts: { actif: number; conforme: boolean }[] = [];
  for (const e of etapes) {
    if (e.type !== 'TRAVAIL' || !e.dateFin) continue;
    const finEtape = (e.dateFin as Date).getTime();
    if (finEtape < periode.debut.getTime() || finEtape >= periode.fin.getTime()) continue;
    const actif = tempsActifMs(e, e.suspensions, finMesure);
    tempsMsBruts.push({ actif, conforme: actif <= objectifPour(objectifs, e.service, e.dossier.typeDossier) * MS_MIN });
  }
  // Délai total de responsabilité (3e notion) : dateFin − dateAffectation − suspensions
  const responsabilite: number[] = etapes
    .filter((e) => e.type === 'TRAVAIL' && e.dateFin)
    .filter((e) => { const f = (e.dateFin as Date).getTime(); return f >= periode.debut.getTime() && f < periode.fin.getTime(); })
    .map((e) => minutes(tempsActifMs(
      { dateAffectation: e.dateAffectation, dateDebut: e.dateAffectation, dateFin: e.dateFin },
      e.suspensions, e.dateFin as Date,
    )));

  const globalKpi: KpiGlobal = {
    totalTraites: g.dossiersTraites.size,
    totalAffectes: etapes.filter((e) => e.type === 'TRAVAIL' && e.dateAffectation >= periode.debut && e.dateAffectation < periode.fin).length,
    enCours: g.enCours,
    enRetard: g.enRetard,
    delaiMoyenTraitementMin: moyenne(tempsMsBruts.map((x) => minutes(x.actif))),
    delaiMedianTraitementMin: mediane(tempsMsBruts.map((x) => minutes(x.actif))),
    delaiMoyenResponsabiliteMin: moyenne(responsabilite),
    tauxRespectDelais: tempsMsBruts.length > 0
      ? round2((tempsMsBruts.filter((x) => x.conforme).length / tempsMsBruts.length) * 100) : null,
    tauxRetourCorrection: g.dossiersTraites.size > 0
      ? round2((g.retoursDossiers.size / g.dossiersTraites.size) * 100) : null,
    parService: [],
    parCollaborateur: [],
    evolutionMensuelle: [],
    evolutionAnnuelle: [],
  };

  // Par service — les 4 services TOUJOURS présents (zéros affichés s'il n'y a
  // aucune activité : cohérence des tableaux entre les surfaces)
  for (const service of SERVICES_KPI) {
    const sous = etapes.filter((e) => e.service === service);
    const sg = agreger(sous, periode, finMesure, objectifs, inclureAnnuel);
    const tempsService: { actif: number; conforme: boolean }[] = sous
      .filter((e) => e.type === 'TRAVAIL' && e.dateFin
        && (e.dateFin as Date).getTime() >= periode.debut.getTime()
        && (e.dateFin as Date).getTime() < periode.fin.getTime())
      .map((e) => {
        const actif = tempsActifMs(e, e.suspensions, finMesure);
        return { actif, conforme: actif <= objectifPour(objectifs, service, e.dossier.typeDossier) * MS_MIN };
      });
    globalKpi.parService.push({
      service,
      attribues: sg.attribues,
      traites: sg.traites,
      enCours: sg.enCours,
      enRetard: sg.enRetard,
      tempsMoyenTraitementMin: moyenne(tempsService.map((x) => minutes(x.actif))),
      delaiMedianTraitementMin: mediane(tempsService.map((x) => minutes(x.actif))),
      tauxRespectDelais: tempsService.length > 0 ? round2((tempsService.filter((x) => x.conforme).length / tempsService.length) * 100) : null,
      tauxRetourCorrection: sg.dossiersTraites.size > 0 ? round2((sg.retoursDossiers.size / sg.dossiersTraites.size) * 100) : null,
      delaiMoyenPriseEnChargeMin: moyenne(sg.priseEnCharge),
      evolutionMensuelle: [...sg.parMois.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([mois, b]) => ({ mois, traites: b.traites, tauxRespect: b.total > 0 ? round2((b.conformes / b.total) * 100) : null })),
    });
  }

  // Par collaborateur (étapes avec un userId — identité de compte)
  const parUser = new Map<string, EtapeChargee[]>();
  for (const e of etapes) {
    if (!e.userId) continue;
    const list = parUser.get(e.userId) ?? [];
    list.push(e);
    parUser.set(e.userId, list);
  }
  for (const [userId, list] of parUser) {
    const su = agreger(list, periode, finMesure, objectifs, inclureAnnuel);
    const tempsUser: { actif: number; conforme: boolean }[] = list
      .filter((e) => e.type === 'TRAVAIL' && e.dateFin
        && (e.dateFin as Date).getTime() >= periode.debut.getTime()
        && (e.dateFin as Date).getTime() < periode.fin.getTime())
      .map((e) => {
        const actif = tempsActifMs(e, e.suspensions, finMesure);
        return { actif, conforme: actif <= objectifPour(objectifs, e.service, e.dossier.typeDossier) * MS_MIN };
      });
    const servicesUser = [...new Set(list.filter((e) => e.type === 'TRAVAIL').map((e) => e.service))];
    globalKpi.parCollaborateur.push({
      userId,
      nom: options.noms?.get(userId),
      service: servicesUser.length === 1 ? servicesUser[0] : servicesUser.join(', '),
      attribues: su.attribues,
      traites: su.traites,
      enCours: su.enCours,
      enRetard: su.enRetard,
      delaiMoyenPriseEnChargeMin: moyenne(su.priseEnCharge),
      tempsMoyenTraitementMin: moyenne(tempsUser.map((x) => minutes(x.actif))),
      delaiMedianTraitementMin: mediane(tempsUser.map((x) => minutes(x.actif))),
      tauxRespectDelais: tempsUser.length > 0 ? round2((tempsUser.filter((x) => x.conforme).length / tempsUser.length) * 100) : null,
      tauxRetourCorrection: su.dossiersTraites.size > 0 ? round2((su.retoursDossiers.size / su.dossiersTraites.size) * 100) : null,
      evolutionMensuelle: [...su.parMois.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([mois, b]) => ({ mois, traites: b.traites, tauxRespect: b.total > 0 ? round2((b.conformes / b.total) * 100) : null })),
    });
  }

  // Évolutions globales
  globalKpi.evolutionMensuelle = [...g.parMois.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([mois, b]) => ({ mois, traites: b.traites, tauxRespect: b.total > 0 ? round2((b.conformes / b.total) * 100) : null }));
  if (inclureAnnuel) {
    globalKpi.evolutionAnnuelle = [...g.parAnnee.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([annee, b]) => ({ annee, traites: b.traites, tauxRespect: b.total > 0 ? round2((b.conformes / b.total) * 100) : null }));
  }

  return globalKpi;
}

// ─── Alertes (§9) ────────────────────────────────────────────────────────────

export interface AlerteDossier { dossierId: string; numeroDossier: string; service: string; pourcentageObjectif: number; }

export interface AlertesKpi {
  dossiersProches: AlerteDossier[];
  dossiersDepasses: AlerteDossier[];
  accumulations: { service: string; nbOuverts: number; seuil: number }[];
  degradations: { service: string; tauxActuel: number; tauxPrecedent: number; seuil: number }[];
  hausseRetours: { service: string; taux: number; seuil: number }[];
}

export function calculerAlertes(
  etapes: EtapeChargee[], periode: PeriodeKpi, objectifs: ObjectifLigne[], seuils: SeuilLigne[],
): AlertesKpi {
  const finMesure = new Date(Math.min(periode.fin.getTime(), Date.now()));
  const alertes: AlertesKpi = { dossiersProches: [], dossiersDepasses: [], accumulations: [], degradations: [], hausseRetours: [] };

  const ouvertsParService = new Map<string, number>();
  for (const e of etapes) {
    if (e.type !== 'TRAVAIL' || e.dateFin) continue;
    const obj = objectifPour(objectifs, e.service, e.dossier.typeDossier);
    if (obj <= 0) continue;
    const actif = tempsActifMs(e, e.suspensions, finMesure);
    const pct = round2((actif / (obj * MS_MIN)) * 100);
    const seuilProche = seuilPour(seuils, e.service, 'PROCHE_CIBLE');
    if (pct >= 100) {
      alertes.dossiersDepasses.push({ dossierId: e.dossierId, numeroDossier: e.dossier.numeroDossier, service: e.service, pourcentageObjectif: pct });
    } else if (pct >= seuilProche) {
      alertes.dossiersProches.push({ dossierId: e.dossierId, numeroDossier: e.dossier.numeroDossier, service: e.service, pourcentageObjectif: pct });
    }
    ouvertsParService.set(e.service, (ouvertsParService.get(e.service) ?? 0) + 1);
  }
  for (const [service, nb] of ouvertsParService) {
    const seuil = seuilPour(seuils, service, 'ACCUMULATION');
    if (nb > seuil) alertes.accumulations.push({ service, nbOuverts: nb, seuil });
  }

  // Dégradation du taux de respect : période courante vs période précédente
  const duree = periode.fin.getTime() - periode.debut.getTime();
  const precedente: PeriodeKpi = { debut: new Date(periode.debut.getTime() - duree), fin: periode.debut };
  const taux = (p: PeriodeKpi) => {
    const fermees = etapes.filter((e) => e.type === 'TRAVAIL' && e.dateFin
      && (e.dateFin as Date).getTime() >= p.debut.getTime() && (e.dateFin as Date).getTime() < p.fin.getTime());
    if (fermees.length === 0) return null;
    const conformes = fermees.filter((e) =>
      tempsActifMs(e, e.suspensions, finMesure) <= objectifPour(objectifs, e.service, e.dossier.typeDossier) * MS_MIN).length;
    return round2((conformes / fermees.length) * 100);
  };
  for (const service of SERVICES_KPI) {
    const actuel = taux({ ...periode });
    const avant = taux(precedente);
    if (actuel === null || avant === null) continue;
    const seuil = seuilPour(seuils, service, 'DEGRADATION');
    if (avant - actuel >= seuil) {
      alertes.degradations.push({ service, tauxActuel: actuel, tauxPrecedent: avant, seuil });
    }
  }

  // Hausse du taux de retour
  for (const service of SERVICES_KPI) {
    const sous = etapes.filter((e) => e.service === service);
    const traites = new Set(sous.filter((e) => e.type === 'TRAVAIL' && e.dateFin
      && (e.dateFin as Date).getTime() >= periode.debut.getTime()
      && (e.dateFin as Date).getTime() < periode.fin.getTime()).map((e) => e.dossierId));
    const retours = new Set(sous.filter((e) => e.type === 'RETOUR_CORRECTION'
      && e.dateAffectation >= periode.debut && e.dateAffectation < periode.fin).map((e) => e.dossierId));
    if (traites.size === 0) continue;
    const tauxRetour = round2((retours.size / traites.size) * 100);
    const seuil = seuilPour(seuils, service, 'HAUSSE_RETOURS');
    if (tauxRetour > seuil) alertes.hausseRetours.push({ service, taux: tauxRetour, seuil });
  }

  return alertes;
}

// ─── Sécurité : périmètre autorisé (testable unitairement) ───────────────────

export type NiveauPerimetreKpi = 'GLOBAL' | 'SERVICE' | 'PERSONNEL';

export interface PerimetreKpi {
  niveau: NiveauPerimetreKpi;
  userIdEffective: string | null;
  /** Niveau SERVICE : service autorisé (forcé côté serveur) ; sinon null. */
  serviceEffective: string | null;
}

/**
 * Résout le périmètre autorisé d'une requête KPI. UN CÔTÉ SERVEUR uniquement :
 *   - ADMINISTRATEUR → GLOBAL (tous services, tout collaborateur) ;
 *   - DIRECTION_GENERALE (R1) → GLOBAL : consultation globale du module KPI,
 *     sans droit de paramétrage (objectifs/seuils restent admin, matrice) ;
 *   - RESPONSABLE_SERVICE (R2) → SERVICE : la consultation est BORNÉE au
 *     service associé au compte (Utilisateur.serviceResponsable). La route
 *     échoue (fail-closed) si le rôle n'a pas de service associé ; tout
 *     paramètre service contradictoire est écrasé par celui du compte ;
 *   - collaborateurs internes → PERSONNEL : le collaborateur ne peut JAMAIS
 *     consulter un autre identifiant — tout paramètre utilisateur est écrasé
 *     par l'id du JWT (immunité contre manipulation d'URL/requête) ;
 *   - rôles externes → jamais autorisés ( filtrés en amont par la matrice).
 */
export function resoudrePerimetreKpi(
  role: string | null, userIdAuth: string | null, userIdParametre?: string | null,
  serviceResponsable?: string | null,
): PerimetreKpi {
  if (role === 'ADMINISTRATEUR' || role === 'DIRECTION_GENERALE') {
    return { niveau: 'GLOBAL', userIdEffective: userIdParametre ?? null, serviceEffective: null };
  }
  if (role === 'RESPONSABLE_SERVICE') {
    return {
      niveau: 'SERVICE',
      userIdEffective: userIdParametre ?? null,
      serviceEffective: serviceResponsable ?? null,
    };
  }
  if (userIdAuth && ['ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'].includes(role ?? '')) {
    return { niveau: 'PERSONNEL', userIdEffective: userIdAuth, serviceEffective: null };
  }
  return { niveau: 'PERSONNEL', userIdEffective: userIdAuth, serviceEffective: null };
}
