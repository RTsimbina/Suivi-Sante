/**
 * Tests — R5 : digest quotidien des alertes de performance par courriel.
 * Anti-abus (rien si aucune alerte, un seul message agrégé, coupe-circuit),
 * résolution des destinataires (comptes actifs, à défaut adresse rapport) et
 * contenu HTML du digest. Modules externes (db / mail / email) simulés.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Simulations des dépendances ─────────────────────────────────────────────

const findManyUtilisateurs = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { utilisateur: { findMany: (...a: unknown[]) => findManyUtilisateurs(...a) } },
}));

const getEmailRapportDestinataire = vi.fn();
vi.mock('@/lib/email', () => ({
  getEmailRapportDestinataire: () => getEmailRapportDestinataire(),
}));

const envoyerCourriel = vi.fn();
vi.mock('@/lib/mail', () => ({ envoyerCourriel: (...a: unknown[]) => envoyerCourriel(...a) }));

// Moteur KPI : calculs réels, lectures DB simulées (étapes injectées par test).
let etapesInjectees: unknown[] = [];
vi.mock('./kpi-performance', async (importOriginal) => {
  const reel = await importOriginal<typeof import('./kpi-performance')>();
  return {
    ...reel,
    chargerEtapesPeriode: vi.fn(async () => etapesInjectees),
    chargerObjectifs: vi.fn(async () => []),
    chargerSeuils: vi.fn(async () => []),
  };
});

import {
  destinatairesAlertesKpi, envoyerDigestAlertesKpi, genererHtmlAlertesKpi,
  periodeDigest, serviceLabel,
} from './kpi-alertes-email';
import type { EtapeChargee } from './kpi-performance';

// ─── Fabrique d'étape (TRAVAIL ouverte, 4 h actives sur un objectif de 30 min) ─

function etapeDepassee(service: string, numero: string): EtapeChargee {
  const dateAffectation = new Date(Date.now() - 4 * 3_600_000);
  return {
    id: `etape-${numero}`, dossierId: `dos-${numero}`, service,
    type: 'TRAVAIL', userId: 'u1', gestionnaireId: null,
    statutAvant: null, statutApres: null,
    dateAffectation, dateDebut: dateAffectation, dateFin: null,
    motifReaffectation: null, motifRetour: null,
    suspensions: [],
    dossier: {
      id: `dos-${numero}`, typeDossier: 'CONSULTATION', societeId: 's1',
      statut: 'EN_ANALYSE', dateReception: dateAffectation, numeroDossier: numero,
    },
  } as unknown as EtapeChargee;
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyUtilisateurs.mockResolvedValue([{ email: 'admin@x.mg' }, { email: 'dg@x.mg' }]);
  getEmailRapportDestinataire.mockResolvedValue(null);
  envoyerCourriel.mockResolvedValue({ accepte: true, envoi: { livraison: { ok: true } } });
  etapesInjectees = [];
  delete process.env.KPI_ALERTES_EMAIL;
});
afterEach(() => { delete process.env.KPI_ALERTES_EMAIL; });

describe('R5 — destinatairesAlertesKpi', () => {
  it('comptes actifs ADMINISTRATEUR + DIRECTION_GENERALE', async () => {
    const d = await destinatairesAlertesKpi();
    expect(d).toEqual(['admin@x.mg', 'dg@x.mg']);
    expect(findManyUtilisateurs).toHaveBeenCalledTimes(1);
    expect(findManyUtilisateurs.mock.calls[0][0].where.role.in).toContain('DIRECTION_GENERALE');
  });

  it('à défaut de compte, retombe sur l\u2019adresse des rapports configurée', async () => {
    findManyUtilisateurs.mockResolvedValue([]);
    getEmailRapportDestinataire.mockResolvedValue('secours@x.mg');
    const d = await destinatairesAlertesKpi();
    expect(d).toEqual(['secours@x.mg']);
  });

  it('erreur de lecture → liste vide (jamais d\u2019exception remontée)', async () => {
    findManyUtilisateurs.mockRejectedValue(new Error('db down'));
    getEmailRapportDestinataire.mockRejectedValue(new Error('db down'));
    const d = await destinatairesAlertesKpi();
    expect(d).toEqual([]);
  });
});

describe('R5 — periodeDigest / serviceLabel', () => {
  it('la fenêtre couvre 30 jours glissants, fin = fin de jour', () => {
    const now = new Date('2026-11-23T10:00:00Z');
    const p = periodeDigest(now);
    expect(p.fin.getHours()).toBe(23);
    const jours = Math.round((p.fin.getTime() - p.debut.getTime()) / 86_400_000);
    expect(jours).toBe(30);
  });

  it('serviceLabel mappe les 4 services du référentiel', () => {
    expect(serviceLabel('ACCUEIL')).toBe('Accueil');
    expect(serviceLabel('CONTROLE_MEDICAL')).toBe('Contrôle médical');
    expect(serviceLabel('INCONNU')).toBe('INCONNU');
  });
});

describe('R5 — anti-abus du digest', () => {
  it('aucune alerte → AUCUN courriel (motif AUCUNE_ALERTE)', async () => {
    const r = await envoyerDigestAlertesKpi();
    expect(r.envoye).toBe(false);
    expect(r.motif).toBe('AUCUNE_ALERTE');
    expect(envoyerCourriel).not.toHaveBeenCalled();
  });

  it('coupe-circuit KPI_ALERTES_EMAIL=off → aucun calcul ni envoi', async () => {
    process.env.KPI_ALERTES_EMAIL = 'off';
    const r = await envoyerDigestAlertesKpi();
    expect(r.motif).toBe('DESACTIVE');
    expect(findManyUtilisateurs).not.toHaveBeenCalled();
    expect(envoyerCourriel).not.toHaveBeenCalled();
  });

  it('sans destinataire → SANS_DESTINATAIRE, aucun envoi', async () => {
    findManyUtilisateurs.mockResolvedValue([]);
    getEmailRapportDestinataire.mockResolvedValue(null);
    etapesInjectees = [etapeDepassee('ACCUEIL', 'D-001')];
    const r = await envoyerDigestAlertesKpi();
    expect(r.motif).toBe('SANS_DESTINATAIRE');
    expect(envoyerCourriel).not.toHaveBeenCalled();
  });

  it('alerte active → UN seul message agrégé (catégorie ALERTE_KPI)', async () => {
    etapesInjectees = [etapeDepassee('ACCUEIL', 'D-001'), etapeDepassee('TECHNIQUE', 'D-002')];
    const r = await envoyerDigestAlertesKpi();
    expect(r.envoye).toBe(true);
    expect(r.totalAlertes).toBe(2);
    expect(envoyerCourriel).toHaveBeenCalledTimes(1);
    const demande = envoyerCourriel.mock.calls[0][0];
    expect(demande.categorie).toBe('ALERTE_KPI');
    expect(demande.destinataires).toEqual(['admin@x.mg', 'dg@x.mg']);
    expect(demande.sujet).toContain('2 alertes');
  });

  it('échec d\u2019envoi → envoye=false + erreur rapportée (le cron journalise)', async () => {
    envoyerCourriel.mockResolvedValue({ accepte: false, motif: 'QUOTA' });
    etapesInjectees = [etapeDepassee('ACCUEIL', 'D-001')];
    const r = await envoyerDigestAlertesKpi();
    expect(r.envoye).toBe(false);
    expect(r.erreur).toBe('QUOTA');
  });
});

describe('R5 — contenu du digest HTML', () => {
  const periode = periodeDigest(new Date('2026-11-23T10:00:00Z'));

  it('liste les dossiers dépassés avec service et pourcentage', () => {
    const html = genererHtmlAlertesKpi(periode, {
      dossiersProches: [],
      dossiersDepasses: [
        { dossierId: 'd1', numeroDossier: 'REC-2026-0001', service: 'ACCUEIL', pourcentageObjectif: 420 },
      ],
      accumulations: [],
      degradations: [],
      hausseRetours: [],
    });
    expect(html).toContain('REC-2026-0001');
    expect(html).toContain('Accueil');
    expect(html).toContain('420');
    expect(html).toContain('Alertes de performance');
  });

  it('rend les alertes structurelles (accumulation, dégradation, retours)', () => {
    const html = genererHtmlAlertesKpi(periode, {
      dossiersProches: [], dossiersDepasses: [],
      accumulations: [{ service: 'COMPTABILITE', nbOuverts: 25, seuil: 20 }],
      degradations: [{ service: 'TECHNIQUE', tauxActuel: 55, tauxPrecedent: 70, seuil: 10 }],
      hausseRetours: [{ service: 'ACCUEIL', taux: 15, seuil: 10 }],
    });
    expect(html).toContain('Accumulation');
    expect(html).toContain('Dégradation');
    expect(html).toContain('Hausse des retours');
    expect(html).toContain('Comptabilité');
  });
});
