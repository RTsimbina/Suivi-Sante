/**
 * Tests d'intégration du module KPI sur VRAIE base PostgreSQL (recette).
 * Sans DATABASE_URL, la suite est SAUTÉE (skipIf) — aucun mock : si ces tests
 * s'exécutent, ils parlent à un vrai PostgreSQL.
 *
 *   DATABASE_URL=postgresql://… npx vitest run src/lib/kpi-module.int.test.ts
 *
 * Scénarios couverts (cahier des charges §12) :
 *   - dossier transféré entre deux collaborateurs (périodes séparées) ;
 *   - dossier suspendu puis repris (temps actif) ;
 *   - dossier retourné pour correction (événement traçable) ;
 *   - plusieurs collaborateurs simultanés (non double comptage) ;
 *   - dossier dépassant le délai cible (alertes) ;
 *   - changement d'objectif de délai (versionnage + journal immuable) ;
 *   - cohérence tableau de bord ↔ export Excel ;
 *   - contrôles de la matrice de permissions (tentative d'accès à autrui).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { matchPermission } from '@/lib/api-permissions';
import { logParametreChange } from '@/lib/audit-log';
import {
  synchroniserEtapes, marquerDebutTraitement, suspendreEtape, reprendreEtape,
  enregistrerRetourCorrection, ouvrirEtapeControleMedical, fermerEtapeControleMedical,
} from '@/lib/kpi-etapes';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerPerformance,
  calculerAlertes, objectifPour,
} from '@/lib/kpi-performance';
import { genererExcelKpi } from '@/lib/kpi-export';

const URL_RECETTE = process.env.DATABASE_URL_RECETTE ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasourceUrl: URL_RECETTE });

const SOC = 'kpi-int-soc';
const G1 = 'kpi-int-gest1';
const G2 = 'kpi-int-gest2';
const ADMIN = 'kpi-int-admin';
const COL1 = 'kpi-int-col1';
const COL2 = 'kpi-int-col2';
const D1 = 'kpi-int-dossier1';
const D2 = 'kpi-int-dossier2';
const OBJ_ACCUEIL = 30;

async function sync(ctx: Parameters<typeof synchroniserEtapes>[1]) {
  await db.$transaction((tx) => synchroniserEtapes(tx, ctx));
}

describe.skipIf(!URL_RECETTE)('Module KPI — intégration PostgreSQL réelle', () => {
  beforeAll(async () => {
    // Nettoyage idempotent
    await db.etapeTraitement.deleteMany({ where: { dossier: { societeId: SOC } } });
    await db.objectifDelai.deleteMany({ where: { service: { in: ['ACCUEIL', 'TECHNIQUE'] }, creeParId: { in: [ADMIN, ''] } } });
    await db.dossier.deleteMany({ where: { societeId: SOC } });
    await db.gestionnaire.deleteMany({ where: { id: { in: [G1, G2] } } });
    await db.utilisateur.deleteMany({ where: { id: { in: [ADMIN, COL1, COL2] } } });
    await db.societe.deleteMany({ where: { id: SOC } });

    await db.societe.create({ data: { id: SOC, nom: 'Recette KPI Intégration', actif: true } });
    await db.gestionnaire.create({ data: { id: G1, nom: 'Gestionnaire 1', service: 'TECHNIQUE' } });
    await db.gestionnaire.create({ data: { id: G2, nom: 'Gestionnaire 2', service: 'TECHNIQUE' } });
    await db.utilisateur.create({ data: { id: ADMIN, email: 'kpi-admin@recette.test', nom: 'Admin Recette', password: 'x', role: 'ADMINISTRATEUR' } });
    await db.utilisateur.create({ data: { id: COL1, email: 'kpi-col1@recette.test', nom: 'Collaborateur 1', password: 'x', role: 'ACCUEIL' } });
    await db.utilisateur.create({ data: { id: COL2, email: 'kpi-col2@recette.test', nom: 'Collaborateur 2', password: 'x', role: 'TECHNIQUE' } });

    await db.dossier.create({
      data: {
        id: D1, numeroDossier: 'KPI-INT-0001', dateReception: new Date(),
        societeId: SOC, beneficiaire: 'Bénéficiaire 1', typeDossier: 'CONSULTATION',
        montantReclame: 10000, statut: 'RECU',
      },
    });
    await db.dossier.create({
      data: {
        id: D2, numeroDossier: 'KPI-INT-0002', dateReception: new Date(),
        societeId: SOC, beneficiaire: 'Bénéficiaire 2', typeDossier: 'CONSULTATION',
        montantReclame: 20000, statut: 'RECU',
      },
    });
  });

  afterAll(async () => {
    await db.etapeTraitement.deleteMany({ where: { dossier: { societeId: SOC } } });
    await db.objectifDelai.deleteMany({ where: { creeParId: { in: [ADMIN, ''] } } });
    await db.dossier.deleteMany({ where: { societeId: SOC } });
    await db.gestionnaire.deleteMany({ where: { id: { in: [G1, G2] } } });
    await db.utilisateur.deleteMany({ where: { id: { in: [ADMIN, COL1, COL2] } } });
    await db.societe.deleteMany({ where: { id: SOC } });
    await db.$disconnect();
  });

  it('cycle complet : création, transition, réaffectation, suspension, retour, clôture', async () => {
    // 1. Création → étape ACCUEIL ouverte
    await sync({ dossierId: D1, statutAvant: null, statutApres: 'RECU', gestionnairesApres: {}, userId: COL1, userRole: 'ACCUEIL' });
    let ouverte = await db.etapeTraitement.findFirst({ where: { dossierId: D1, dateFin: null } });
    expect(ouverte?.service).toBe('ACCUEIL');
    expect(ouverte?.userId).toBe(COL1);

    // 2. Transition RECU → EN_ANALYSE (effectuée par col1/accueil) :
    //    ACCUEIL fermé, TECHNIQUE ouvert
    await sync({ dossierId: D1, statutAvant: 'RECU', statutApres: 'EN_ANALYSE', gestionnairesApres: {}, userId: COL1, userRole: 'ACCUEIL' });
    const accueilFermee = await db.etapeTraitement.findFirst({ where: { dossierId: D1, service: 'ACCUEIL' } });
    expect(accueilFermee?.dateFin).not.toBeNull();
    const techOuverte = await db.etapeTraitement.findFirst({ where: { dossierId: D1, dateFin: null } });
    expect(techOuverte?.service).toBe('TECHNIQUE');

    // 3. RÉAFFECTATION du gestionnaire technique : deux périodes séparées
    await sync({ dossierId: D1, statutAvant: 'EN_ANALYSE', statutApres: null,
      gestionnairesApres: { TECHNIQUE: G1 }, userId: COL2, userRole: 'TECHNIQUE' });
    await new Promise((r) => setTimeout(r, 30)); // séparer les horodatages
    await sync({ dossierId: D1, statutAvant: 'EN_ANALYSE', statutApres: null,
      gestionnairesApres: { TECHNIQUE: G2 }, userId: COL2, userRole: 'TECHNIQUE' });
    const techEtapes = await db.etapeTraitement.findMany({
      where: { dossierId: D1, service: 'TECHNIQUE' }, orderBy: { dateAffectation: 'asc' },
    });
    expect(techEtapes).toHaveLength(2);
    expect(techEtapes[0].gestionnaireId).toBe(G1);
    expect(techEtapes[0].motifReaffectation).toContain('Réaffectation');
    expect(techEtapes[0].dateFin).not.toBeNull();
    expect(techEtapes[1].gestionnaireId).toBe(G2);
    expect(techEtapes[1].dateFin).toBeNull();

    // 4. Début de traitement marqué par col2 puis SUSPENSION/REPRISE
    await db.$transaction((tx) => marquerDebutTraitement(tx, D1, COL2, 'TECHNIQUE'));
    const suspension = await db.$transaction((tx) => suspendreEtape(tx, D1, 'Attente d\u2019une pièce complémentaire', COL2));
    const apres = await db.$transaction((tx) => reprendreEtape(tx, D1, COL2));
    expect(suspension.reprisA).toBeNull();
    expect(apres.reprisA).not.toBeNull();

    // 5. RETOUR POUR CORRECTION (statut conservé)
    const retour = await db.$transaction((tx) => enregistrerRetourCorrection(tx, D1, 'EN_ANALYSE', COL2, 'Montant incohérent avec les soins'));
    expect(retour.type).toBe('RETOUR_CORRECTION');
    expect(retour.dateFin).not.toBeNull();

    // 6. Transitions jusqu'à PAYE → plus d'étape ouverte
    await sync({ dossierId: D1, statutAvant: 'EN_ANALYSE', statutApres: 'VALIDE', gestionnairesApres: { TECHNIQUE: G2 }, userId: COL2, userRole: 'TECHNIQUE' });
    await sync({ dossierId: D1, statutAvant: 'VALIDE', statutApres: 'EN_COMPTABILITE', gestionnairesApres: {}, userId: COL2, userRole: 'TECHNIQUE' });
    const comptaOuverte = await db.etapeTraitement.findFirst({ where: { dossierId: D1, dateFin: null } });
    expect(comptaOuverte?.service).toBe('COMPTABILITE');
    await sync({ dossierId: D1, statutAvant: 'EN_COMPTABILITE', statutApres: 'PAYE', gestionnairesApres: {}, userId: COL2, userRole: 'COMPTABILITE' });
    const aucuneOuverte = await db.etapeTraitement.findFirst({ where: { dossierId: D1, dateFin: null } });
    expect(aucuneOuverte).toBeNull();
  }, 30000);

  it('KPI cohérents avec les étapes enregistrées (tableau de bord = moteur)', async () => {
    const periode = { debut: new Date(Date.now() - 24 * 3600 * 1000), fin: new Date(Date.now() + 24 * 3600 * 1000) };
    const [etapes, objectifs, seuils] = await Promise.all([
      chargerEtapesPeriode(periode, { societeId: SOC }),
      chargerObjectifs(),
      chargerSeuils(),
    ]);
    // D1 : 4 étapes TRAVAIL fermées (accueil, tech×2, compta) + 1 retour ;
    // D2 : 1 étape ACCUEIL ouverte (créée au beforeAll ? non — D2 n'a PAS d'étape)
    const d1 = etapes.filter((e) => e.dossierId === D1);
    expect(d1.filter((e) => e.type === 'TRAVAIL')).toHaveLength(4);
    expect(d1.filter((e) => e.type === 'RETOUR_CORRECTION')).toHaveLength(1);

    const perf = calculerPerformance(etapes, periode, objectifs, { inclureAnnuel: false });
    expect(perf.totalTraites).toBe(1); // distinct : D1 seul est clôturé
    expect(perf.enCours).toBe(0);
    const svcTech = perf.parService.find((s) => s.service === 'TECHNIQUE');
    expect(svcTech?.traites).toBe(2); // deux périodes de responsabilité fermées
    expect(svcTech?.tauxRetourCorrection).toBe(100); // 1 dossier retourné / 1 traité
    // 4 services présents dans le détail global (ADMINISTRATEUR voit tout)
    expect(perf.parService).toHaveLength(4);
  }, 30000);

  it('alertes : dossier dépassant son délai cible détecté', async () => {
    // D2 : ouvrir une étape ACCUEIL vieillie artificiellement (cible 30 min)
    const vieux = new Date(Date.now() - 120 * 60 * 1000);
    await db.etapeTraitement.create({
      data: {
        dossierId: D2, service: 'ACCUEIL', userId: COL1,
        type: 'TRAVAIL', source: 'CIRCUIT',
        dateAffectation: vieux, dateDebut: vieux,
        statutAvant: 'RECU',
      },
    });
    const periode = { debut: new Date(Date.now() - 24 * 3600 * 1000), fin: new Date(Date.now() + 24 * 3600 * 1000) };
    const [etapes, objectifs, seuils] = await Promise.all([
      chargerEtapesPeriode(periode, { societeId: SOC }),
      chargerObjectifs(),
      chargerSeuils(),
    ]);
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
    const depasse = alertes.dossiersDepasses.find((a) => a.dossierId === D2);
    expect(depasse).toBeDefined();
    expect(depasse?.service).toBe('ACCUEIL');
    expect((depasse?.pourcentageObjectif ?? 0) >= 100).toBe(true);
    // Nettoyage immédiat pour ne pas fausser l'autre test
    await db.etapeTraitement.deleteMany({ where: { dossierId: D2 } });
  }, 30000);

  it('changement d\u2019objectif : versionnage + journal immuable', async () => {
    const request = new Request('http://localhost/api/kpi/objectifs', {
      method: 'POST', headers: { 'user-agent': 'vitest-int' },
    });
    // Le test doit être auto-suffisant (base de recette propre) : si aucune
    // version TECHNIQUE n'est en vigueur (pas de backfill exécuté), on crée
    // soi-même la valeur initiale — c'est sa fermeture qui est vérifiée.
    const ancienne = await db.objectifDelai.findFirst({ where: { service: 'TECHNIQUE', typeDossier: null, valideAu: null } })
      ?? await db.objectifDelai.create({
        data: { service: 'TECHNIQUE', typeDossier: null, delaiMinutes: 240, motif: 'Valeur initiale de test (recette)', creeParId: ADMIN },
      });
    const nouvelle = await db.$transaction(async (tx) => {
      if (ancienne) {
        await tx.objectifDelai.update({ where: { id: ancienne.id }, data: { valideAu: new Date() } });
      }
      const cree = await tx.objectifDelai.create({
        data: { service: 'TECHNIQUE', typeDossier: null, delaiMinutes: 180, motif: 'Décision interne de test (recette)', creeParId: ADMIN },
      });
      await logParametreChange({
        entite: 'ObjectifDelai', entiteId: cree.id, champ: 'delaiMinutes',
        ancienneValeur: ancienne?.delaiMinutes ?? null, nouvelleValeur: 180,
        modifiePar: 'Admin Recette', modifieParId: ADMIN,
        action: 'MODIFICATION', module: 'KPI',
        objet: 'Délai cible TECHNIQUE', motif: 'Décision interne de test (recette)', request,
      });
      return cree;
    });
    // Ancienne valeur conservée, nouvelle en vigueur
    const historique = await db.objectifDelai.findMany({ where: { service: 'TECHNIQUE', valideAu: { not: null } } });
    expect(historique.length).toBeGreaterThanOrEqual(1);
    expect(await db.objectifDelai.count({ where: { id: nouvelle.id, valideAu: null } })).toBe(1);
    expect(objectifPour([{ service: 'TECHNIQUE', typeDossier: null, delaiMinutes: 180 }], 'TECHNIQUE', 'CONSULTATION')).toBe(180);
    // Journal immuable : la ligne d'audit existe
    const audit = await db.historiqueParametre.findFirst({
      where: { entite: 'ObjectifDelai', entiteId: nouvelle.id, champ: 'delaiMinutes' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.nouvelleValeur).toContain('180');
  }, 30000);

  it('contrôle médical : étape ouverte puis fermée, visible dans les KPI du service', async () => {
    await db.$transaction((tx) => ouvrirEtapeControleMedical(tx, D2, COL2));
    const ouverte = await db.etapeTraitement.findFirst({ where: { dossierId: D2, service: 'CONTROLE_MEDICAL' } });
    expect(ouverte?.dateFin).toBeNull();
    await db.$transaction((tx) => fermerEtapeControleMedical(tx, D2));
    const fermee = await db.etapeTraitement.findFirst({ where: { dossierId: D2, service: 'CONTROLE_MEDICAL' } });
    expect(fermee?.dateFin).not.toBeNull();
    const periode = { debut: new Date(Date.now() - 24 * 3600 * 1000), fin: new Date(Date.now() + 24 * 3600 * 1000) };
    const etapes = await chargerEtapesPeriode(periode, { societeId: SOC });
    const perf = calculerPerformance(etapes, periode, await chargerObjectifs(), { inclureAnnuel: false });
    const cm = perf.parService.find((s) => s.service === 'CONTROLE_MEDICAL');
    expect(cm?.traites).toBe(1);
  }, 30000);

  it('export Excel : cohérence avec le tableau de bord (mêmes chiffres)', async () => {
    const periode = { debut: new Date(Date.now() - 24 * 3600 * 1000), fin: new Date(Date.now() + 24 * 3600 * 1000) };
    const [etapes, objectifs, seuils] = await Promise.all([
      chargerEtapesPeriode(periode, { societeId: SOC }),
      chargerObjectifs(),
      chargerSeuils(),
    ]);
    const perf = calculerPerformance(etapes, periode, objectifs, { inclureAnnuel: false });
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
    const buffer = await genererExcelKpi({
      periode: 'Recette', generePar: 'Vitest',
      global: perf, alertes,
    });
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // Relire le classeur : la Synthèse doit porter le MÊME nombre de traités
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const synthese = wb.getWorksheet('Synthèse')!;
    const ligneTraites = synthese.getRow(4); // 1 en-tête + 2 contexte + 1 traités
    expect(ligneTraites.getCell(1).value).toBe('Dossiers traités');
    expect(Number(ligneTraites.getCell(2).value)).toBe(perf.totalTraites);
    const collabs = wb.getWorksheet('Collaborateurs')!;
    expect(collabs.rowCount).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('matrice de permissions : KPI global refusé hors ADMIN, personnel autorisé', () => {
    // Tentative d'accès global par un collaborateur → 403
    expect(matchPermission('/api/kpi/performance', 'GET', 'ACCUEIL').allowed).toBe(false);
    expect(matchPermission('/api/kpi/performance', 'GET', 'ADMINISTRATEUR').allowed).toBe(true);
    // Espace personnel : autorisé aux rôles internes, refusé aux rôles externes
    expect(matchPermission('/api/kpi/ma-performance', 'GET', 'ACCUEIL').allowed).toBe(true);
    expect(matchPermission('/api/kpi/ma-performance', 'GET', 'SANTE').allowed).toBe(true);
    expect(matchPermission('/api/kpi/ma-performance', 'GET', 'PORTAIL_CLIENT').allowed).toBe(false);
    // Exports/alertes/paramétrage : ADMINISTRATEUR seul
    expect(matchPermission('/api/kpi/export', 'GET', 'TECHNIQUE').allowed).toBe(false);
    expect(matchPermission('/api/kpi/objectifs', 'POST', 'ADMINISTRATEUR').allowed).toBe(true);
    expect(matchPermission('/api/kpi/objectifs', 'POST', 'COMPTABILITE').allowed).toBe(false);
    // Contrôle médical : SANTE autorisé, ACCUEIL refusé
    expect(matchPermission('/api/controle-medical/kpi-int-dossier1', 'POST', 'SANTE').allowed).toBe(true);
    expect(matchPermission('/api/controle-medical/kpi-int-dossier1', 'POST', 'ACCUEIL').allowed).toBe(false);
    // default-deny : route non déclarée
    expect(matchPermission('/api/kpi/inexistant', 'GET', 'ADMINISTRATEUR').allowed).toBe(false);
  });
});
