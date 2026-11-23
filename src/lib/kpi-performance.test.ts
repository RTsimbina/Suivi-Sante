/**
 * Tests unitaires du moteur KPI (formules, sans base de données).
 * Scénarios du cahier des charges couverts au niveau moteur :
 * collaborateur multi-dossiers, transfert, suspension/reprise, retour pour
 * correction, dépassement de délai cible, collaborateurs simultanés,
 * changement d'objectif, périmètre de sécurité.
 */

import { describe, it, expect } from 'vitest';
import {
  tempsActifMs, calculerPerformance, calculerAlertes, objectifPour,
  resoudrePerimetreKpi, delaiGlobalDossier, type EtapeChargee,
} from './kpi-performance';
import { OBJECTIFS_DEFAUT_MINUTES, SEUILS_DEFAUT } from './kpi-etapes';

const MIN = 60_000;

// ─── Fabriques d'étapes synthétiques ─────────────────────────────────────────

function etape(
  survol: Partial<EtapeChargee> & {
    id: string; dossierId: string; service: string; userId?: string | null;
    dateAffectation: Date; dateFin?: Date | null; dateDebut?: Date | null;
    suspensions?: { suspenduA: Date; reprisA: Date | null; motif: string }[];
  },
): EtapeChargee {
  return {
    id: survol.id,
    dossierId: survol.dossierId,
    service: survol.service,
    userId: survol.userId ?? null,
    gestionnaireId: null,
    type: survol.type ?? 'TRAVAIL',
    source: 'CIRCUIT',
    statutAvant: null,
    statutApres: null,
    motifReaffectation: null,
    motifRetour: null,
    createdAt: survol.dateAffectation,
    dateAffectation: survol.dateAffectation,
    dateDebut: survol.dateDebut ?? null,
    dateFin: survol.dateFin ?? null,
    suspensions: (survol.suspensions ?? []) as EtapeChargee['suspensions'],
    dossier: {
      id: survol.dossierId,
      numeroDossier: `D-${survol.dossierId}`,
      typeDossier: 'CONSULTATION',
      societeId: 'soc-1',
      statut: 'VALIDE',
      dateReception: survol.dateAffectation,
    },
  } as EtapeChargee;
}

const OBJECTIFS = [
  { service: 'ACCUEIL', typeDossier: null, delaiMinutes: 30 },
  { service: 'TECHNIQUE', typeDossier: null, delaiMinutes: 240 },
  { service: 'CONTROLE_MEDICAL', typeDossier: null, delaiMinutes: 240 },
  { service: 'COMPTABILITE', typeDossier: null, delaiMinutes: 120 },
];

const T0 = new Date('2026-06-01T08:00:00Z');
const PERIODE = { debut: new Date('2026-06-01T00:00:00Z'), fin: new Date('2026-07-01T00:00:00Z') };

// ─── Temps actif ─────────────────────────────────────────────────────────────

describe('tempsActifMs', () => {
  it('exclut la durée suspendue d\u2019un dossier suspendu puis repris', () => {
    // 100 minutes de traitement, dont 40 suspendues → 60 actives
    const t = tempsActifMs(
      { dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 100 * MIN) },
      [{ suspenduA: new Date(T0.getTime() + 30 * MIN), reprisA: new Date(T0.getTime() + 70 * MIN), motif: 'Attente pièce' }],
      new Date(T0.getTime() + 120 * MIN),
    );
    expect(t).toBe(60 * MIN);
  });

  it('borne le temps actif à la fin de mesure pour une étape ouverte', () => {
    const t = tempsActifMs(
      { dateAffectation: T0, dateDebut: T0, dateFin: null }, [],
      new Date(T0.getTime() + 45 * MIN),
    );
    expect(t).toBe(45 * MIN);
  });
});

// ─── Scénarios exigés ────────────────────────────────────────────────────────

describe('KPI collaborateur — plusieurs dossiers', () => {
  it('compte les dossiers traités sans double comptage et calcule médiane/moyennes', () => {
    const etapes = [
      // Col1 : 2 dossiers traités (60 et 120 min de traitement actif)
      etape({ id: 'e1', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 60 * MIN) }),
      etape({ id: 'e2', dossierId: 'd2', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 120 * MIN) }),
      // d1 aussi traité par l'accueil (un dossier = 1 fois PAR SERVICE)
      etape({ id: 'e3', dossierId: 'd1', service: 'ACCUEIL', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 20 * MIN) }),
    ];
    const perf = calculerPerformance(etapes, PERIODE, OBJECTIFS, { inclureAnnuel: false });
    const col1 = perf.parCollaborateur.find((c) => c.userId === 'col1');
    expect(col1).toBeDefined();
    expect(col1!.traites).toBe(3);          // 2 technique + 1 accueil (étapes distinctes)
    expect(col1!.attribues).toBe(3);
    expect(col1!.tempsMoyenTraitementMin).toBe(66.67); // round2((60+120+20)/3)
    expect(col1!.delaiMedianTraitementMin).toBe(60);
    // Global : distinct dossiers = d1 + d2 = 2 (anti double comptage global)
    expect(perf.totalTraites).toBe(2);
  });
});

describe('KPI — dossier transféré entre deux collaborateurs', () => {
  it('attribue chaque période de responsabilité à son titulaire', () => {
    // Col1 travaille 60 min puis réaffectation ; Col2 termine en 30 min
    const etapes = [
      etape({ id: 'e1', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 60 * MIN),
        motifReaffectation: 'Réaffectation' }),
      etape({ id: 'e2', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col2',
        dateAffectation: new Date(T0.getTime() + 60 * MIN), dateDebut: new Date(T0.getTime() + 60 * MIN),
        dateFin: new Date(T0.getTime() + 90 * MIN) }),
    ];
    const perf = calculerPerformance(etapes, PERIODE, OBJECTIFS, { inclureAnnuel: false });
    const col1 = perf.parCollaborateur.find((c) => c.userId === 'col1');
    const col2 = perf.parCollaborateur.find((c) => c.userId === 'col2');
    expect(col1!.traites).toBe(1);
    expect(col1!.tempsMoyenTraitementMin).toBe(60);
    expect(col2!.traites).toBe(1);
    expect(col2!.tempsMoyenTraitementMin).toBe(30);
    // Global : 1 dossier traité ; délai moyen de responsabilité = moyenne des
    // périodes (60 min pour col1 + 30 min pour col2) = 45 min
    expect(perf.totalTraites).toBe(1);
    expect(perf.delaiMoyenResponsabiliteMin).toBe(45);
  });
});

describe('KPI — retour pour correction et dépassement de cible', () => {
  it('calcule le taux de retour et repère les étapes en retard', () => {
    const etapes = [
      // Conforme : 100 min < 240 min
      etape({ id: 'e1', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 100 * MIN) }),
      // Dépasse : 300 min > 240 min
      etape({ id: 'e2', dossierId: 'd2', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 300 * MIN) }),
      // Événement de retour sur d1
      etape({ id: 'e3', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col1', type: 'RETOUR_CORRECTION' as const,
        dateAffectation: T0, dateDebut: T0, dateFin: T0 }),
      // Étape encore ouverte et dépassée (d3) → en cours ET en retard
      etape({ id: 'e4', dossierId: 'd3', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: null }),
    ];
    const perf = calculerPerformance(etapes, PERIODE, OBJECTIFS, { inclureAnnuel: false });
    const col1 = perf.parCollaborateur.find((c) => c.userId === 'col1');
    expect(col1!.traites).toBe(2);
    // Retours : 1 dossier avec retour / 2 traités = 50 %
    expect(col1!.tauxRetourCorrection).toBe(50);
    expect(col1!.enCours).toBe(1);
    // 400 min de mesure au-delà de l'affectation → d3 dépasse les 240 min
    expect(col1!.enRetard).toBe(1);
    // Taux de respect : 1 conforme / 2 fermées = 50 %
    expect(col1!.tauxRespectDelais).toBe(50);
  });
});

describe('KPI — collaborateurs simultanés', () => {
  it('ne compte qu\u2019une fois chaque dossier au global malgré le parallélisme', () => {
    const mk = (i: number, user: string) => etape({
      id: `e${i}`, dossierId: `d${i}`, service: 'ACCUEIL', userId: user,
      dateAffectation: T0, dateDebut: T0, dateFin: new Date(T0.getTime() + 15 * MIN),
    });
    const etapes = [1, 2, 3, 4].flatMap((i) => [mk(i, `col${i}`), mk(10 + i, `col${i}`)]);
    const perf = calculerPerformance(etapes, PERIODE, OBJECTIFS, { inclureAnnuel: false });
    expect(perf.parCollaborateur).toHaveLength(4);
    expect(perf.parCollaborateur.every((c) => c.traites === 2)).toBe(true);
    expect(perf.totalTraites).toBe(8); // 8 dossiers distincts
  });
});

describe('objectifs et seuils', () => {
  it('résout l\u2019objectif spécifique par type puis général, sinon le défaut', () => {
    const objectifs = [...OBJECTIFS, { service: 'TECHNIQUE', typeDossier: 'HOSPITALISATION', delaiMinutes: 90 }];
    expect(objectifPour(objectifs, 'TECHNIQUE', 'HOSPITALISATION')).toBe(90);
    expect(objectifPour(objectifs, 'TECHNIQUE', 'CONSULTATION')).toBe(240);
    expect(objectifPour([], 'CONTROLE_MEDICAL', 'X')).toBe(OBJECTIFS_DEFAUT_MINUTES.CONTROLE_MEDICAL);
  });

  it('expose les seuils par défaut', () => {
    expect(SEUILS_DEFAUT.PROCHE_CIBLE).toBe(80);
    expect(SEUILS_DEFAUT.ACCUMULATION).toBe(20);
  });
});

describe('alertes', () => {
  it('classe proche cible / dépassé et signale l\u2019accumulation', () => {
    const etapes = [
      // Ouverte à 85 % de la cible (255/300 min) → proche
      etape({ id: 'e1', dossierId: 'd1', service: 'TECHNIQUE', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: null }),
      // Ouverte à 200 % d'une cible ACCUEIL 30 min (60 min) → dépassé
      etape({ id: 'e2', dossierId: 'd2', service: 'ACCUEIL', userId: 'col1',
        dateAffectation: T0, dateDebut: T0, dateFin: null }),
    ];
    const finMesure = new Date(T0.getTime() + 210 * MIN);
    // e1 : 210 min / cible 240 = 87,5 % → proche ; e2 : 210/30 = 700 % → dépassé
    const alertes = calculerAlertes(etapes, { debut: T0, fin: finMesure }, OBJECTIFS, []);
    expect(alertes.dossiersProches.map((a) => a.numeroDossier)).toContain('D-d1');
    expect(alertes.dossiersDepasses.map((a) => a.numeroDossier)).toContain('D-d2');
  });
});

describe('délai global réception → clôture', () => {
  it('utilise la dernière étape fermée', () => {
    const minutes = delaiGlobalDossier(T0, [
      { dateFin: new Date(T0.getTime() + 60 * MIN), service: 'ACCUEIL' },
      { dateFin: new Date(T0.getTime() + 500 * MIN), service: 'COMPTABILITE' },
      { dateFin: null, service: 'TECHNIQUE' },
    ]);
    expect(minutes).toBe(500);
  });
});

// ─── Sécurité : périmètre résolu côté serveur ────────────────────────────────

describe('resoudrePerimetreKpi (anti-usurpation d\u2019identité)', () => {
  it('un collaborateur ne peut JAMAIS consulter un autre identifiant', () => {
    const r = resoudrePerimetreKpi('ACCUEIL', 'col1', 'col2');
    expect(r.niveau).toBe('PERSONNEL');
    expect(r.userIdEffective).toBe('col1'); // le paramètre est écrasé par le JWT
  });
  it('l\u2019administrateur accède au périmètre global', () => {
    const r = resoudrePerimetreKpi('ADMINISTRATEUR', 'admin1', 'col2');
    expect(r.niveau).toBe('GLOBAL');
    expect(r.userIdEffective).toBe('col2');
  });
  it('sans identité, aucun accès personnel fonctionnel', () => {
    const r = resoudrePerimetreKpi('ACCUEIL', null, 'col2');
    expect(r.userIdEffective).toBeNull();
  });
});
