/**
 * generer-donnees-test.mjs — Jeu de données de démonstration Suivi Santé.
 *
 * Mission « renouvellement des données » : 100 sociétés clientes, 100 familles
 * par société (assurés principaux + ayants droit), 100 dossiers par famille
 * (1 000 000 au total), 1 000 prestataires, organisation complète d'utilisateurs,
 * étapes KPI réelles (EtapeTraitement 1 ligne par service traversé).
 *
 * Propriétés :
 *  - DÉTERMINISTE  : setseed(0.4242) + tirages SQL — deux exécutions après
 *                    purge produisent le même jeu (clé de génération).
 *  - IDEMPOTENT    : détecte le jeu démo (sociétés email *@demo.suivisante.mg,
 *                    prestataires code DEM-*) ; sans --reset il refuse de
 *                    re-exécuter ; avec --reset il purge UNIQUEMENT les lignes
 *                    démo (FK inverses), jamais les données réelles.
 *  - SET-BASED     : tout le volume passe par INSERT…SELECT / generate_series /
 *                    fenêtrage SQL exécuté par psql — pas de boucle Prisma.
 *  - RÈGLES MÉTIER : statuts du référentiel (RECU→…→PAYE/REJETE), champs posés
 *                    comme le fait l'application (dateTraitementTechnique à
 *                    EN_ANALYSE, dateReceptionDecompte à EN_COMPTABILITE,
 *                    montantPaye PAYE, motifRejet REJETE), ticketModerateur =
 *                    frais − prise en charge, plafond annuel par
 *                    (assuré, année, prestation) parmi les statuts qui
 *                    consomment, barème versionné figé sur le dossier,
 *                    numeroDossier DOS-<année>-<séquence 6 chiffres> sans trou
 *                    (compat. genererNumeroDossier = count+1).
 *  - ÉTAPES KPI    : 1 EtapeTraitement TRAVAIL par service traversé
 *                    (source='MIGRATION', marqueur prévu pour le bulk),
 *                    dates cohérentes avec les champs du dossier, durées
 *                    réalistes vs ObjectifDelai (30/240/120 min) — les KPI du
 *                    module Performance sont donc ALIMENTÉS PAR LES DONNÉES,
 *                    jamais par des valeurs arbitraires.
 *
 * Usage :
 *   DATABASE_URL=postgresql://… node scripts/generer-donnees-test.mjs            # création
 *   DATABASE_URL=postgresql://… node scripts/generer-donnees-test.mjs --reset    # purge démo + recréation
 *   DATABASE_URL=postgresql://… node scripts/generer-donnees-test.mjs --reset-only
 *   DATABASE_URL=postgresql://… node scripts/generer-donnees-test.mjs --statistiques
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hash } from 'bcryptjs';

// ─── Paramètres ──────────────────────────────────────────────────────────────
const SEED = 0.4242;
const NB_SOCIETES = parseInt(process.env.GDT_SOCIETES || '100', 10);
const FAMILLES_PAR_SOCIETE = parseInt(process.env.GDT_FAMILLES || '100', 10);
const DOSSIERS_PAR_FAMILLE = parseInt(process.env.GDT_DOSSIERS || '100', 10);
const NB_PRESTATAIRES = parseInt(process.env.GDT_PRESTATAIRES || '1000', 10);
const PWD_INTERNE = 'SuiviSante@2026';
const ANNEES = [
  { annee: 2024, famillesDe: 1, famillesA: 30 },
  { annee: 2025, famillesDe: 31, famillesA: 65 },
  { annee: 2026, famillesDe: 66, famillesA: 100 },
];
const FIN_FENETRE_2026 = '2026-11-17'; // laisse la place aux traitements ouverts
const AUJOURDHUI = '2026-11-24 12:00:00+00';

const PG_BIN = '/home/z/my-project/scripts/pg-tools/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql';
const SORTIE = '/home/z/my-project/recette-pg';
const FICHIER_SQL = `${SORTIE}/generation.sql`;

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const RESET_ONLY = args.includes('--reset-only');
const STATS = args.includes('--statistiques');

// ─── Vocabulaire métier (référentiels du code) ───────────────────────────────
const TYPES_DOSSIER = [
  ['CONSULTATION_SIMPLE', 'CONSULTATION', 0.20], ['CONSULTATION_SPECIALISE', 'CONSULTATION', 0.10],
  ['CONSULTATION_PRE_NATAL', 'CONSULTATION', 0.03], ['PHARMACIE', 'PHARMACIE', 0.22],
  ['EXAMEN', 'EXAMEN', 0.13], ['IMAGERIE', 'IMAGERIE', 0.06],
  ['HOSPITALISATION_MEDICAL', 'HOSPITALISATION', 0.05], ['HOSPITALISATION_CHIRURGICAL', 'HOSPITALISATION', 0.02],
  ['ACCOUCHEMENT_NORMAL', 'ACCOUCHEMENT', 0.03], ['ACCOUCHEMENT_CHIRURGICAL', 'ACCOUCHEMENT', 0.01],
  ['DENTAIRES_SOIN', 'DENTAIRES', 0.04], ['DENTAIRES_DETARTRAGE', 'DENTAIRES', 0.02],
  ['DENTAIRES_EXTRACTION', 'DENTAIRES', 0.02], ['DENTAIRES_PROTHESE', 'DENTAIRES', 0.01],
  ['DENTAIRES_ORTHODONTIE', 'DENTAIRES', 0.005], ['OPTIQUE', 'OPTIQUE', 0.065],
];
const MONTANTS = { // [min, max] en Ariary — bornes réalistes par sous-type
  CONSULTATION_SIMPLE: [15000, 60000], CONSULTATION_SPECIALISE: [30000, 120000],
  CONSULTATION_PRE_NATAL: [25000, 90000], PHARMACIE: [5000, 90000],
  EXAMEN: [10000, 150000], IMAGERIE: [30000, 300000],
  HOSPITALISATION_MEDICAL: [300000, 2000000], HOSPITALISATION_CHIRURGICAL: [800000, 6000000],
  ACCOUCHEMENT_NORMAL: [300000, 1000000], ACCOUCHEMENT_CHIRURGICAL: [800000, 3000000],
  DENTAIRES_SOIN: [10000, 60000], DENTAIRES_DETARTRAGE: [20000, 80000],
  DENTAIRES_EXTRACTION: [30000, 150000], DENTAIRES_PROTHESE: [150000, 600000],
  DENTAIRES_ORTHODONTIE: [200000, 900000], OPTIQUE: [50000, 400000],
};
const TAUX = { CONSULTATION: [70, 80], PHARMACIE: [60, 70], EXAMEN: [60, 80], IMAGERIE: [60, 80],
  HOSPITALISATION: [70, 90], ACCOUCHEMENT: [80, 100], DENTAIRES: [50, 70], OPTIQUE: [50, 60] };
const PLAFONDS = { CONSULTATION: 500000, PHARMACIE: 1200000, EXAMEN: 1000000, IMAGERIE: 900000,
  HOSPITALISATION: 6000000, ACCOUCHEMENT: 2500000, DENTAIRES: 800000, OPTIQUE: 400000 };
const MOTIFS_REJET = {
  ACCUEIL: ['Assuré inactif : couverture résiliée avant la date de soins',
    'Prestataire suspendu au moment des soins',
    'Convention du prestataire inactive pour cette société'],
  TECHNIQUE: ['Montant au-delà du plafond garanti — accord préalable non obtenu',
    'Garantie OPTIQUE inactive pour ce contrat',
    'Pièces justificatives illisibles ou non conformes'],
  COMPTABILITE: ['Coordonnées bancaires erronées — paiement impossible',
    'Doublon détecté avec un dossier déjà réglé'],
};
const MOTIFS_RETOUR = ['Dossier incomplet : feuille de soins manquante',
  'Pièce d\'identité de l\'ayant droit à fournir', 'Écart entre facture et prescription'];
const MOTIFS_SUSPENSION = ['Attente de pièces complémentaires', 'Validation externe requise',
  'Attente de la facture détaillée du prestataire'];
const SOURCES = [['EXCEL', 0.55], ['MANUEL', 0.25], ['SAGE', 0.15], ['ISA', 0.05]];
const MOYENS = [['VIREMENT', 0.60], ['MOBILE_MONEY', 0.20], ['CHEQUE', 0.15], ['ESPECES', 0.05]];

// ─── Noms malgaches et sociétés réalistes ────────────────────────────────────
const NOMS = ['Rakotoarison', 'Ratsimbazafy', 'Andrianarivo', 'Razafindrakoto', 'Randrianasolo',
  'Rajaonarivelo', 'Rakotomalala', 'Andriamalala', 'Rasolofoson', 'Rabemananjara',
  'Ramanantsoa', 'Rakotondrainibe', 'Razanadrakoto', 'Ravelomanana', 'Rasoanaivo',
  'Andriantsitohaina', 'Ratsimihah', 'Randriamampionona', 'Rakotoarimanana', 'Razafimahatratra'];
const PRENOMS_H = ['Hery', 'Tojo', 'Fidy', 'Lanto', 'Mamy', 'Onja', 'Naina', 'Tahina', 'Sitraka',
  'Faniry', 'Jaona', 'Rivo', 'Malaza', 'Tovo', 'Ny Aina', 'Rakoto'];
const PRENOMS_F = ['Mialy', 'Soa', 'Ravao', 'Fanja', 'Voahangy', 'Lovasoa', 'Tsiky', 'Viviane',
  'Narindra', 'Hanta', 'Sahondra', 'Noro', 'Fara', 'Lalaina', 'Miadana', 'Hanitra'];
const SECTEURS = ['BANQUE', 'BTP', 'TEXTILE', 'AGRO', 'MINES', 'TELECOM', 'TRANSPORT',
  'COMMERCE', 'SANTE', 'ENERGIE', 'HOTELLERIE', 'EDUCATION', 'ONG', 'Pêche industrielle'];
const VILLES = ['Antananarivo', 'Toamasina', 'Antsirabe', 'Fianarantsoa', 'Mahajanga',
  'Toliara', 'Antsiranana', 'Nosy Be'];
const PREFIXES_SOC = {
  BANQUE: ['Banque', 'Assurance', 'Financière'], BTP: ['Bâtiment', 'Travaux', 'Construction'],
  TEXTILE: ['Textile', 'Cotonnier', 'Confection'], AGRO: ['Agroalimentaire', 'Sucrière', 'Agricole'],
  MINES: ['Mines', 'Minier', 'Nickel'], TELECOM: ['Télécoms', 'Réseaux', 'Numérique'],
  TRANSPORT: ['Transport', 'Logistique', 'Maritime'], COMMERCE: ['Distribution', 'Commerces', 'Grands Magasins'],
  SANTE: ['Santé', 'Médicale', 'Pharmaceutique'], ENERGIE: ['Énergie', 'Hydro', 'Pétrolière'],
  HOTELLERIE: ['Hôtellerie', 'Tourisme', 'Loisirs'], EDUCATION: ['Éducation', 'Formation', 'Académie'],
  ONG: ['ONG', 'Fondation', 'Association'], 'Pêche industrielle': ['Pêche', 'Maritime Sud'],
};
const NOMS_PROPRE = ['Vaovao', 'Mora Mora', 'Fihavanana', 'Tanjona', 'Lalana', 'Vintsy',
  'Tsena Be', 'Sofia', 'Onive', 'Betsiboka', 'Tsiribihina', 'Masoandro', 'Volamena',
  'Fitiavana', 'Fanantenana', 'Ravorombo', 'Ampela', 'Hazomanga', 'Tsimanampy', 'Kotomanga'];

// Génération déterministe des listes Node (noms, sociétés) — RNG mulberry32.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x20261124);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ─── Construction des sociétés ───────────────────────────────────────────────
const societes = [];
for (let n = 1; n <= NB_SOCIETES; n++) {
  const secteur = pick(SECTEURS);
  const prefix = pick(PREFIXES_SOC[secteur]);
  const nom = `${prefix} ${pick(NOMS_PROPRE)} ${pick(['SA', 'SARL', 'SUARL'])}`;
  const taille = n <= 10 ? 'GRANDE' : n <= 70 ? 'MOYENNE' : 'PETITE';
  const ville = pick(VILLES);
  societes.push({
    id: `soc-${String(n).padStart(3, '0')}`, n, nom, nomNormalise: slug(nom), secteur, taille, ville,
    adresse: `${pick(['Lot II M', 'Lot IV B', 'Immeuble', 'Rue', 'Zone'])} ${Math.floor(rnd() * 200) + 1} ${pick(['Antaninandro', 'Ankorondrano', 'Tsaralalana', 'Behoririka', 'Andraharo', 'Ambohimanarina', 'centre-ville'])}, ${ville}`,
    telephone: `+261 3${Math.floor(rnd() * 5)} ${String(Math.floor(rnd() * 100)).padStart(2, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')}`,
    email: `contact@${slug(nom)}-soc-${n}.demo.mg`,
    nif: `4000${String(n).padStart(4, '0')}${Math.floor(rnd() * 9)}`,
    budgetBase: taille === 'GRANDE' ? 150000000 + Math.floor(rnd() * 250000000)
      : taille === 'MOYENNE' ? 40000000 + Math.floor(rnd() * 110000000)
      : 12000000 + Math.floor(rnd() * 28000000),
    suspendue2026: [7, 23, 41, 68, 89].includes(n),
    optiqueInactif: [13, 29, 52, 77].includes(n),
    contactNom: `${pick(PRENOMS_H)} ${pick(NOMS)}`,
  });
}

// ─── Utilisateurs et gestionnaires ───────────────────────────────────────────
const PERSONNEL = [
  ['admin@suivisante.mg', 'Ravao Administrateur', 'ADMINISTRATEUR', null],
  ['direction@suivisante.mg', 'Hery Razafy', 'DIRECTION_GENERALE', null],
  ['chef.accueil@suivisante.mg', 'Mialy Rasoanaivo', 'RESPONSABLE_SERVICE', 'ACCUEIL'],
  ['chef.technique@suivisante.mg', 'Fidy Andriamampianina', 'RESPONSABLE_SERVICE', 'TECHNIQUE'],
  ['chef.medical@suivisante.mg', 'Voahangy Rakotoarison', 'RESPONSABLE_SERVICE', 'CONTROLE_MEDICAL'],
  ['chef.comptabilite@suivisante.mg', 'Soa Ratsimba', 'RESPONSABLE_SERVICE', 'COMPTABILITE'],
  ['accueil@suivisante.mg', 'Ravao Andrianjaka', 'ACCUEIL', null],
  ['accueil2@suivisante.mg', 'Naina Rakotomalala', 'ACCUEIL', null],
  ['accueil3@suivisante.mg', 'Fanja Razanadrakoto', 'ACCUEIL', null],
  ['technique@suivisante.mg', 'Lanto Rajaonarivelo', 'TECHNIQUE', null],
  ['technique2@suivisante.mg', 'Tahina Ramanantsoa', 'TECHNIQUE', null],
  ['technique3@suivisante.mg', 'Mamy Rakotondrainibe', 'TECHNIQUE', null],
  ['technique4@suivisante.mg', 'Sitraka Randriamampianina', 'TECHNIQUE', null],
  ['technique5@suivisante.mg', 'Onja Razafindrakoto', 'TECHNIQUE', null],
  ['compta@suivisante.mg', 'Narindra Rabemananjara', 'COMPTABILITE', null],
  ['compta2@suivisante.mg', 'Hantalalaina Ranaivoson', 'COMPTABILITE', null],
  ['finance1@suivisante.mg', 'Viviane Rasoarimanana', 'COMPTABILITE', null],
  ['finance2@suivisante.mg', 'Tojo Rakotoarimanana', 'COMPTABILITE', null],
  ['sante@suivisante.mg', 'Lovasoa Ravelomanana', 'SANTE', null],
  ['sante2@suivisante.mg', 'Tsiky Rajaobelina', 'SANTE', null],
];
const UTIL_ACCUEIL = ['accueil@suivisante.mg', 'accueil2@suivisante.mg', 'accueil3@suivisante.mg'];
const UTIL_TECHNIQUE = ['technique@suivisante.mg', 'technique2@suivisante.mg', 'technique3@suivisante.mg', 'technique4@suivisante.mg', 'technique5@suivisante.mg'];
const UTIL_COMPTA = ['compta@suivisante.mg', 'compta2@suivisante.mg', 'finance1@suivisante.mg', 'finance2@suivisante.mg'];
const UTIL_SANTE = ['sante@suivisante.mg', 'sante2@suivisante.mg'];
// Gestionnaires (référentiel, sans compte) — même noms que les comptes (liaison logique par nom)
const GESTIONNAIRES = [
  ...UTIL_ACCUEIL.map((e, i) => [`grs-acc-${i + 1}`, PERSONNEL.find(p => p[0] === e)[1], 'ACCUEIL']),
  ...UTIL_TECHNIQUE.map((e, i) => [`grs-tec-${i + 1}`, PERSONNEL.find(p => p[0] === e)[1], 'TECHNIQUE']),
  ['grs-cmp-1', 'Narindra Rabemananjara', 'COMPTABILITE'], ['grs-cmp-2', 'Hantalalaina Ranaivoson', 'COMPTABILITE'],
  ['grs-cmp-3', 'Viviane Rasoarimanana', 'COMPTABILITE'], ['grs-cmp-4', 'Tojo Rakotoarimanana', 'COMPTABILITE'],
  ['grs-cm-1', 'Tsiky Rajaobelina', 'CONTROLE_MEDICAL'], ['grs-cm-2', 'Voahangy Rakotoarison', 'CONTROLE_MEDICAL'],
];
const GRS_ACCUEIL = ['grs-acc-1', 'grs-acc-2', 'grs-acc-3'];
const GRS_TECHNIQUE = GESTIONNAIRES.filter(([, , s]) => s === 'TECHNIQUE').map(([id]) => id);
const GRS_COMPTA = ['grs-cmp-1', 'grs-cmp-2', 'grs-cmp-3', 'grs-cmp-4'];
const GRS_CM = ['grs-cm-1', 'grs-cm-2'];

// ─── Prestataires ────────────────────────────────────────────────────────────
const REPART_TYPES = [
  ['PHARMACIE', 300], ['CABINET_MEDICAL', 200], ['LABORATOIRE', 120], ['CLINIQUE', 80],
  ['HOPITAL', 40], ['DENTAIRE', 80], ['OPTICIEN', 80], ['AUTRE', 100],
];
const PREFIXES_PRS = {
  PHARMACIE: ['Pharmacie', 'Officine'], CABINET_MEDICAL: ['Dr', 'Cabinet Médical Dr', 'Centre Médical Dr'],
  LABORATOIRE: ['Laboratoire', 'Centre d\'Analyses'], CLINIQUE: ['Clinique', 'Polyclinique'],
  HOPITAL: ['Hôpital', 'Centre Hospitalier'], DENTAIRE: ['Cabinet Dentaire Dr', 'Centre Dentaire'],
  OPTICIEN: ['Optique', 'Centre Optique'], AUTRE: ['Centre de Santé', 'Dispensaire', 'Clinique Mobile'],
};
const GROUPES_PRS = ['Chaîne Pharmacies Santé+', 'Réseau Cliniques Île Rouge', 'Groupement Laboratoires BioMada',
  'Chaîne Optique Vision+', 'Réseau Dentaire SmilMada', 'Groupe Hospitalier SoinsUnis'];
const prestataires = [];
let pNum = 0;
const slugsVus = new Set();
for (const [type, nb] of REPART_TYPES) {
  for (let i = 1; i <= nb; i++) {
    pNum++;
    let nom = `${pick(PREFIXES_PRS[type])} ${pick(NOMS)} ${pick(VILLES)}`.replace(/\s+/g, ' ');
    if (slugsVus.has(slug(nom))) nom = `${nom} ${pick(NOMS_PROPRE)}`;
    if (slugsVus.has(slug(nom))) nom = `${nom} ${pNum}`;
    slugsVus.add(slug(nom));
    const suspendu = pNum % 20 === 7;
    prestataires.push({
      id: `prs-${String(pNum).padStart(4, '0')}`, code: `DEM-${String(pNum).padStart(4, '0')}`,
      nom, nomNormalise: slug(nom), type,
      ville: pick(VILLES),
      statutJuridique: type === 'PHARMACIE' ? pick(['SUARL', 'SARL']) : pick(['SUARL', 'SA', 'SARL', 'SAS', 'EI', 'AUTO_ENTREPRENEUR', 'CABINET_LIBERAL', 'GROUPEMENT', 'ETABLISSEMENT_PUBLIC', 'AUTRE']),
      suspendu,
      groupe: pNum % 7 === 3 ? `grp-${Math.floor(rnd() * 6) + 1}` : null,
      telephone: `+261 3${Math.floor(rnd() * 5)} ${String(Math.floor(rnd() * 100)).padStart(2, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')}`,
      nif: `3000${String(pNum).padStart(4, '0')}`, stat: `STAT-${String(pNum).padStart(5, '0')}`,
      rib: `0000${String(pNum).padStart(6, '0')} MG44 0001 ${String(Math.floor(rnd() * 99999)).padStart(5, '0')}`,
    });
  }
}
const BUCKETS = { PHARMACIE: 'PHAR', DENTAIRE: 'DENT', OPTICIEN: 'OPT', CLINIQUE: 'HOSP', HOPITAL: 'HOSP', CABINET_MEDICAL: 'CONS', LABORATOIRE: 'LABO', AUTRE: 'LABO' };
const BUCKET_PAR_TYPE_DOSSIER = {
  PHARMACIE: 'PHAR', DENTAIRES: 'DENT', OPTIQUE: 'OPT', HOSPITALISATION: 'HOSP', ACCOUCHEMENT: 'HOSP',
  CONSULTATION: 'CONS', EXAMEN: 'LABO', IMAGERIE: 'LABO',
};

function ecrirePhase(titre, sql) {
  phases.push(`\n\\echo ${q(`── ${titre} ──`)}\n${sql}`);
}
const phases = [];

// ─── Phase 0 : purge du jeu démo existant (idempotence) ──────────────────────
const SOCS_DEMO = `SELECT id FROM "Societe" WHERE email LIKE '%.demo.mg'`;
const PRESTS_DEMO = `SELECT id FROM "Prestataire" WHERE code LIKE 'DEM-%'`;
ecrirePhase('Purge du jeu de démonstration (uniquement les lignes démo)', `
DELETE FROM "ImportDossier" WHERE "dossierId" IN (SELECT id FROM "Dossier" WHERE "societeId" IN (${SOCS_DEMO}));
DELETE FROM "Dossier" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "Assure" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "Bareme" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "AppelDeFonds" WHERE "contratId" IN (SELECT id FROM "Contrat" WHERE "societeId" IN (${SOCS_DEMO}));
DELETE FROM "Contrat" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "ModeCalculAppelFonds" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "EntrepriseContact" WHERE "societeId" IN (${SOCS_DEMO});
DELETE FROM "PrestataireSociete" WHERE "societeId" IN (${SOCS_DEMO}) OR "prestataireId" IN (${PRESTS_DEMO});
DELETE FROM "Prestataire" WHERE code LIKE 'DEM-%';
DELETE FROM "Societe" WHERE email LIKE '%.demo.mg';`);

// ─── Phase 1 : utilisateurs + gestionnaires + objectifs + seuils ─────────────
async function phasePersonnel() {
  const pwdHash = await hash(PWD_INTERNE, 10);
  const lignes = PERSONNEL.map(([email, nom, role, service]) =>
    `('usr-${email.split('@')[0].replace(/\./g, '-')}', ${q(email)}, ${q(nom)}, ${q(pwdHash)}, ${q(role)}, ${service ? q(service) : 'NULL'}, true, 1, '2026-11-01 08:00:00+00'::timestamptz, '2026-11-01 08:00:00+00'::timestamptz)`)
    .join(',\n  ');
  ecrirePhase('Utilisateurs — organisation complète (rôles du référentiel)', `
INSERT INTO "Utilisateur" (id, email, nom, password, role, "serviceResponsable", actif, "sessionVersion", "createdAt", "updatedAt")
VALUES
  ${lignes}
ON CONFLICT (email) DO NOTHING;`);
  const gest = GESTIONNAIRES.map(([id, nom, service]) => `(${q(id)}, ${q(nom)}, ${q(service)})`).join(',\n  ');
  ecrirePhase('Gestionnaires de référentiel (4 services, noms alignés sur les comptes)', `
INSERT INTO "Gestionnaire" (id, nom, service) VALUES
  ${gest}
ON CONFLICT (id) DO NOTHING;`);
  ecrirePhase('Objectifs de délai par service (30/240/240/120 min)', `
INSERT INTO "ObjectifDelai" (id, service, "typeDossier", "delaiMinutes", "valideDu", "valideAu", motif, "creeParId")
SELECT 'obj-' || v.s, v.s, NULL,
       CASE v.s WHEN 'ACCUEIL' THEN 30 WHEN 'TECHNIQUE' THEN 240 WHEN 'CONTROLE_MEDICAL' THEN 240 ELSE 120 END,
       '2024-01-01'::timestamptz, NULL, 'Valeurs de référence du module KPI',
       (SELECT id FROM "Utilisateur" WHERE email = 'admin@suivisante.mg')
FROM (VALUES ('ACCUEIL'), ('TECHNIQUE'), ('CONTROLE_MEDICAL'), ('COMPTABILITE')) v(s)
WHERE NOT EXISTS (SELECT 1 FROM "ObjectifDelai" o WHERE o."valideAu" IS NULL AND o."typeDossier" IS NULL AND o.service = v.s);`);
  ecrirePhase('Seuils d\'alerte KPI globaux', `
INSERT INTO "SeuilAlerteKpi" (id, service, "typeAlerte", valeur, "updatedAt")
SELECT 'seuil-' || t, 'GLOBAL', t, v::float, now() FROM (VALUES ('PROCHE_CIBLE', 80), ('ACCUMULATION', 20), ('DEGRADATION', 10), ('HAUSSE_RETOURS', 10)) x(t, v)
ON CONFLICT (service, "typeAlerte") DO NOTHING;`);
}

// ─── Phase 2 : sociétés, contrats, barèmes, contacts ─────────────────────────
function phaseSocietes() {
  const soc = societes.map(s => `(${q(s.id)}, ${q(s.nom)}, ${q(s.nomNormalise)}, ${s.suspendue2026 ? 'false' : 'true'}, ${q(s.adresse)}, ${q(s.telephone)}, ${q(s.email)}, ${q(s.nif)}, ${q(s.contactNom)}, ${q('rh@' + slug(s.nom) + '.demo.mg')}, '2023-0${(s.n % 9) + 1}-15 09:00:00+00'::timestamptz)`).join(',\n  ');
  ecrirePhase(`Sociétés clientes (${NB_SOCIETES})`, `
INSERT INTO "Societe" (id, nom, "nomNormalise", actif, adresse, telephone, email, nif, "contactPrincipal", "emailContactPrincipal", "createdAt")
VALUES
  ${soc};`);
  const contrat = societes.flatMap(s => ANNEES.map(a => {
    const statut = a.annee < 2026 ? 'EXPIRE' : (s.suspendue2026 ? 'SUSPENDU' : 'ACTIF');
    const budget = Math.round(s.budgetBase * (a.annee === 2024 ? 1.0 : a.annee === 2025 ? 1.15 : 1.3) / 1000) * 1000;
    return `(${q(`ctr-${s.n}-${a.annee}`)}, ${q(s.id)}, ${q(`CT-${String(s.n).padStart(3, '0')}-${a.annee}`)}, ${budget}, 0, '${a.annee}-01-01'::timestamptz, '${a.annee}-12-31'::timestamptz, ${q(statut)}, now())`;
  })).join(',\n  ');
  ecrirePhase('Contrats annuels 2024-2026 par société (actifs, expirés, suspendus)', `
INSERT INTO "Contrat" (id, "societeId", reference, "budgetAnnuel", "budgetUtilise", "dateDebut", "dateFin", statut, "updatedAt")
VALUES
  ${contrat};`);
  const baremes = societes.flatMap(s => Object.entries(TAUX).map(([parent, [t1, t2]]) => {
    const taux = Math.round(t1 + rnd() * (t2 - t1));
    const plafond = Math.round(PLAFONDS[parent] * (0.8 + rnd() * 0.5) / 1000) * 1000;
    const actif = !(parent === 'OPTIQUE' && s.optiqueInactif);
    return `(${q(`bar-${s.n}-${parent}`)}, ${q(s.id)}, ${q(parent)}, ${taux}, ${plafond}, ${q(`Garantie ${parent.toLowerCase()} — version initiale`)}, ${actif}, '2024-01-01'::timestamptz, NULL, 1, now())`;
  })).join(',\n  ');
  ecrirePhase('Barèmes par société × 8 prestations (taux %, plafond annuel, version 1)', `
INSERT INTO "Bareme" (id, "societeId", prestation, "tauxCouverture", plafond, description, active, "valideDu", "valideAu", version, "updatedAt")
VALUES
  ${baremes};`);
  // Version 2 (révision tarifaire mi-2025) pour 12 sociétés — la v1 est clôturée
  const v2 = societes.filter(s => s.n % 8 === 3).flatMap(s => ['PHARMACIE', 'CONSULTATION'].map(parent => {
    const taux = Math.min(100, Math.round(TAUX[parent][0] + rnd() * (TAUX[parent][1] - TAUX[parent][0])) + 5);
    const plafond = Math.round(PLAFONDS[parent] * (0.8 + rnd() * 0.5) * 1.1 / 1000) * 1000;
    return `UPDATE "Bareme" SET "valideAu" = '2025-06-30'::timestamptz WHERE id = ${q(`bar-${s.n}-${parent}`)};
INSERT INTO "Bareme" (id, "societeId", prestation, "tauxCouverture", plafond, description, active, "valideDu", "valideAu", version, "updatedAt")
VALUES (${q(`bar-${s.n}-${parent}-v2`)}, ${q(s.id)}, ${q(parent)}, ${taux}, ${plafond}, 'Révision tarifaire 2025 (version 2)', true, '2025-07-01'::timestamptz, NULL, 2, now())
ON CONFLICT ("societeId", prestation, version) DO NOTHING;`;
  })).join('\n');
  ecrirePhase('Versionnement des barèmes — révision 2025 pour 12 sociétés (P1 validité datée)', v2);
  const modes = societes.map((s, i) => `(${q(`mcaf-${s.n}`)}, ${q(s.id)}, ${q(['DEPENSE_MENSUELLE', 'FONDS_ROULEMENT', 'BUDGET_ANNUEL'][i % 3])}, '{}', ${q(['MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE'][i % 3])}, '2026-01-01'::timestamptz, true, now())`).join(',\n  ');
  ecrirePhase('Modes de calcul des appels de fonds par société', `
INSERT INTO "ModeCalculAppelFonds" (id, "societeId", mode, parametres, periodicite, "dateDebut", actif, "updatedAt")
VALUES
  ${modes};`);
  const contacts = societes.map(s => `(${q(`ctc-${s.n}`)}, ${q(s.id)}, ${q('Raharimalala')}, ${q(s.contactNom.split(' ')[0])}, 'Responsable RH', ${q(s.telephone)}, ${q('rh@' + slug(s.nom) + '.demo.mg')}, now())`).join(',\n  ');
  ecrirePhase('Contacts entreprises', `
INSERT INTO "EntrepriseContact" (id, "societeId", nom, prenom, fonction, telephone, email, "updatedAt")
VALUES
  ${contacts};`);
}

// ─── Phase 3 : prestataires, groupes, conventions, tables de travail ─────────
function phasePrestataires() {
  const grp = GROUPES_PRS.map((nom, i) => `(${q(`grp-${i + 1}`)}, ${q(nom)}, ${q('Groupe de prestataires — établissements du même opérateur')}, now())`).join(',\n  ');
  ecrirePhase('Groupes de prestataires (6 chaînes)', `
INSERT INTO "GroupePrestataire" (id, nom, description, "updatedAt") VALUES
  ${grp}
ON CONFLICT (nom) DO NOTHING;`);
  const prs = prestataires.map(p => `(${q(p.id)}, ${q(p.code)}, ${q(p.nom)}, ${q(p.nomNormalise)}, ${q(p.type)}, ${q(p.telephone)}, ${q('contact@' + slug(p.nom) + '-' + p.id + '.demo.mg')}, ${q(`${p.ville}, ${pick(['Avenue', 'Rue', 'Boulevard'])} ${pick(NOMS_PROPRE)}`)}, ${q(p.nif)}, ${q(p.stat)}, ${q(p.statutJuridique)}, ${q(p.suspendu ? 'SUSPENDU' : 'CONVENTIONNE')}, ${q(p.rib)}, ${p.suspendu ? 'false' : 'true'}, ${p.groupe ? q(p.groupe) : 'NULL'}, now())`).join(',\n  ');
  ecrirePhase(`Prestataires (${NB_PRESTATAIRES}) — codes DEM-*, quelques suspendus`, `
INSERT INTO "Prestataire" (id, code, nom, "nomNormalise", type, telephone, email, adresse, nif, stat, "statutJuridique", statut, rib, actif, "groupePrestataireId", "updatedAt")
VALUES
  ${prs};`);
  // Conventions prestataire ↔ société : nombre réaliste selon le type
  const nbParType = { PHARMACIE: [6, 20], CABINET_MEDICAL: [2, 8], LABORATOIRE: [2, 8], CLINIQUE: [3, 10], HOPITAL: [3, 8], DENTAIRE: [2, 6], OPTICIEN: [2, 6], AUTRE: [2, 5] };
  const liaisons = [];
  for (const p of prestataires) {
    const [a, b] = nbParType[p.type];
    const nb = a + Math.floor(rnd() * (b - a + 1));
    const vues = new Set();
    for (let i = 0; i < nb; i++) {
      const socN = 1 + Math.floor(rnd() * NB_SOCIETES);
      if (vues.has(socN)) continue;
      vues.add(socN);
      const inactif = rnd() < 0.03 ? 'false' : 'true';
      liaisons.push(`(${q(`lps-${p.id}-${socN}`)}, ${q(p.id)}, ${q(societes[socN - 1].id)}, ${inactif}, now())`);
    }
  }
  ecrirePhase(`Conventions prestataire ↔ société (${liaisons.length} liaisons, quelques inactives)`, `
INSERT INTO "PrestataireSociete" (id, "prestataireId", "societeId", actif, "updatedAt")
VALUES
  ${liaisons.join(',\n  ')}
ON CONFLICT ("prestataireId", "societeId") DO NOTHING;`);
  // Tables de travail : prestataires par (société, compartiment de soins) + tout-venant
  ecrirePhase('Tables de travail — compartiments prestataires par société', `
CREATE TEMP TABLE tmp_ps AS
SELECT ps."societeId",
       CASE p.type WHEN 'PHARMACIE' THEN 'PHAR' WHEN 'DENTAIRE' THEN 'DENT' WHEN 'OPTICIEN' THEN 'OPT'
                   WHEN 'CLINIQUE' THEN 'HOSP' WHEN 'HOPITAL' THEN 'HOSP' WHEN 'CABINET_MEDICAL' THEN 'CONS'
                   ELSE 'LABO' END AS bucket,
       array_agg(ps."prestataireId" ORDER BY ps."prestataireId") AS ids
FROM "PrestataireSociete" ps JOIN "Prestataire" p ON p.id = ps."prestataireId"
WHERE ps.actif AND p.actif AND p.statut = 'CONVENTIONNE'
GROUP BY 1, 2;
CREATE INDEX ON tmp_ps ("societeId", bucket);
CREATE TEMP TABLE tmp_ps_tous AS
SELECT ps."societeId", array_agg(ps."prestataireId" ORDER BY ps."prestataireId") AS ids
FROM "PrestataireSociete" ps JOIN "Prestataire" p ON p.id = ps."prestataireId"
WHERE ps.actif AND p.actif AND p.statut = 'CONVENTIONNE'
GROUP BY 1;`);
}

// ─── Phase 4 : familles — assurés principaux et ayants droit ─────────────────
function phaseAssures() {
  const nss = { n: 0 };
  const lignes = [];
  for (const s of societes) {
    for (let f = 1; f <= FAMILLES_PAR_SOCIETE; f++) {
      const base = `${s.n}-${f}`;
      const nom = pick(NOMS);
      const homme = rnd() < 0.55;
      const prenom = homme ? pick(PRENOMS_H) : pick(PRENOMS_F);
      const anNaiss = 1965 + Math.floor(rnd() * 34);
      const naiP = `${anNaiss}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
      const gros = rnd() < 0.03;
      const radiee = f % 97 === 0;
      const nssP = () => `${100000000000 + (++nss.n)}`;
      const tel = () => `+261 3${Math.floor(rnd() * 5)} ${String(Math.floor(rnd() * 100)).padStart(2, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')} ${String(Math.floor(rnd() * 1000)).padStart(3, '0')}`;
      const coeff = (0.8 + rnd() * 0.4).toFixed(2);
      const email = (p, n) => rnd() < 0.6 ? `${slug(p)}.${slug(n)}${base}@demo.mg` : null;
      lignes.push(`('ass-${base}-P', ${q(s.id)}, ${q(nom)}, ${q(prenom)}, ${q(nssP())}, ${q(`MAT-${base}-P`)}, 'ASSURE', 'ass-${base}-P', ${q(`FAM-${base}`)}, ${q(naiP)}::timestamptz, ${homme ? "'M'" : "'F'"}, '2024-01-01'::timestamptz, ${coeff}, ${q(tel())}, ${q(email(prenom, nom))}, ${q(s.adresse)}, ${radiee ? 'false' : 'true'}, now())`);
      if (rnd() < 0.45) {
        const preC = homme ? pick(PRENOMS_F) : pick(PRENOMS_H);
        const anC = Math.max(1950, anNaiss + Math.floor(rnd() * 9) - 4);
        const naiC = `${anC}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
        lignes.push(`('ass-${base}-C', ${q(s.id)}, ${q(nom)}, ${q(preC)}, ${q(nssP())}, NULL, 'CONJOINT', 'ass-${base}-P', ${q(`FAM-${base}`)}, ${q(naiC)}::timestamptz, ${homme ? "'F'" : "'M'"}, '2024-01-01'::timestamptz, ${coeff}, ${q(tel())}, ${q(email(preC, nom))}, ${q(s.adresse)}, ${radiee ? 'false' : 'true'}, now())`);
      }
      const nbE = rnd() < 0.35 ? 0 : rnd() < 0.55 ? 1 : rnd() < 0.70 ? 2 : rnd() < 0.78 ? 3 : 4;
      for (let e = 1; e <= nbE; e++) {
        const preE = rnd() < 0.5 ? pick(PRENOMS_H) : pick(PRENOMS_F);
        const anE = Math.max(2002, anNaiss + 20) + Math.floor(rnd() * 8);
        lignes.push(`('ass-${base}-E${e}', ${q(s.id)}, ${q(nom)}, ${q(preE)}, ${q(nssP())}, NULL, 'ENFANT', 'ass-${base}-P', ${q(`FAM-${base}`)}, ${q(`${anE}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`)}::timestamptz, ${rnd() < 0.5 ? "'M'" : "'F'"}, '2024-01-01'::timestamptz, ${coeff}, ${q(tel())}, ${q(email(preE, nom))}, ${q(s.adresse)}, ${radiee ? 'false' : 'true'}, now())`);
      }
    }
  }
  ecrirePhase(`Familles : assurés principaux + ayants droit (${lignes.length} assurés)`, `
INSERT INTO "Assure" (id, "societeId", nom, prenom, "nSS", matricule, "typeBeneficiaire", "assurePrincipalId", "codeFamille", "dateNaissance", sexe, "dateEffet", bareme, telephone, email, adresse, actif, "updatedAt")
VALUES
  ${lignes.join(',\n  ')};`);
  ecrirePhase('Table de travail — composition des familles (poids de tirage des bénéficiaires)', `
CREATE TEMP TABLE tmp_fam AS
SELECT ROW_NUMBER() OVER (ORDER BY a."societeId", a."codeFamille") AS fnum,
       a."societeId",
       (regexp_replace(a."codeFamille", 'FAM-(\\d+)-(\\d+)', '\\1'))::int AS socn,
       (regexp_replace(a."codeFamille", 'FAM-(\\d+)-(\\d+)', '\\2'))::int AS famn,
       a.id AS principalId,
       ARRAY(SELECT x FROM (SELECT a.id x UNION ALL SELECT a.id) t) AS ids_p,
       (SELECT array_agg(m.id) FROM "Assure" m WHERE m."assurePrincipalId" = a.id AND m."typeBeneficiaire" = 'CONJOINT') AS ids_c,
       (SELECT array_agg(m.id ORDER BY m.id) FROM "Assure" m WHERE m."assurePrincipalId" = a.id AND m."typeBeneficiaire" = 'ENFANT') AS ids_e,
       ARRAY(SELECT x FROM (SELECT (a.nom || ' ' || COALESCE(a.prenom, '')) x UNION ALL SELECT (a.nom || ' ' || COALESCE(a.prenom, ''))) t) AS noms_p,
       (SELECT array_agg(m.nom || ' ' || COALESCE(m.prenom, '')) FROM "Assure" m WHERE m."assurePrincipalId" = a.id AND m."typeBeneficiaire" = 'CONJOINT') AS noms_c,
       (SELECT array_agg(m.nom || ' ' || COALESCE(m.prenom, '') ORDER BY m.id) FROM "Assure" m WHERE m."assurePrincipalId" = a.id AND m."typeBeneficiaire" = 'ENFANT') AS noms_e,
       (a.id LIKE '%-E%' OR a.id LIKE '%-C%') AND false AS gros
FROM "Assure" a WHERE a."typeBeneficiaire" = 'ASSURE';
UPDATE tmp_fam SET gros = (famn % 33 = 0);  -- ≈3 % de familles à forte consommation
CREATE UNIQUE INDEX ON tmp_fam (socn, famn);`);
}

// ─── Phase 5 : dossiers (par année, set-based, règles métier) ────────────────
function sqlPickExpr(colPrefix) {
  // Tirage pondéré : branches WHEN pour tous les types sauf le dernier = ELSE
  let acc = 0; const bT = [], bP = [];
  const total = TYPES_DOSSIER.reduce((a, [, , w]) => a + w, 0);
  for (let i = 0; i < TYPES_DOSSIER.length; i++) {
    const [t, parent, w] = TYPES_DOSSIER[i];
    acc += w;
    if (i === TYPES_DOSSIER.length - 1) {
      bT.push(`ELSE ${q(t)}`);
      bP.push(`ELSE ${q(parent)}`);
    } else {
      bT.push(`WHEN ${colPrefix}r_t < ${(acc / total).toFixed(4)} THEN ${q(t)}`);
      bP.push(`WHEN ${colPrefix}r_t < ${(acc / total).toFixed(4)} THEN ${q(parent)}`);
    }
  }
  return { typeExpr: `CASE\n    ${bT.join('\n    ')}\n  END`, parentExpr: `CASE\n    ${bP.join('\n    ')}\n  END` };
}
function sqlMontantCase(col) {
  const branches = TYPES_DOSSIER.map(([t]) =>
    `WHEN ${col} = ${q(t)} THEN ${MONTANTS[t][0]} + floor(random() * ${MONTANTS[t][1] - MONTANTS[t][0]})::int`);
  return `CASE\n    ${branches.join('\n    ')}\n  END`;
}
const TC = (ts) => `to_char(${ts}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const UTIL_ID = (email) => `usr-${email.split('@')[0].replace(/\./g, '-')}`;

function phaseDossiers(offsets) {
  const ARR_GRS_ACC = `ARRAY[${GRS_ACCUEIL.map(q).join(',')}]`;
  const ARR_GRS_TEC = `ARRAY[${GRS_TECHNIQUE.map(q).join(',')}]`;
  const ARR_GRS_CMP = `ARRAY[${GRS_COMPTA.map(q).join(',')}]`;
  const ARR_GRS_CM = `ARRAY[${GRS_CM.map(q).join(',')}]`;
  const ARR_USR_ACC = `ARRAY[${UTIL_ACCUEIL.map((e) => q(UTIL_ID(e))).join(',')}]`;
  const { typeExpr, parentExpr } = sqlPickExpr('');
  for (const a of ANNEES) {
    const y = a.annee;
    const nbFam = (a.famillesA - a.famillesDe + 1) * NB_SOCIETES;
    const N = nbFam * DOSSIERS_PAR_FAMILLE;
    const jours = y === 2024 ? 365 : y === 2025 ? 364 : 320;
    const offset = offsets[y] || 0;
    ecrirePhase(`Dossiers ${y} — ${N.toLocaleString('fr-FR')} dossiers (séquences sans trou, compat. genererNumeroDossier)`, `
WITH grille AS (
  SELECT gs, ((gs - 1) % ${nbFam}) + 1 AS famIdx,
         random() r_m, random() r_t, random() r_s, random() r_rs, random() r_mot,
         random() r_d1, random() r_d2, random() r_d3, random() r_src, random() r_cat,
         random() r_mp, random() r_pay, random() r_obs, random() r_g1, random() r_g2, random() r_g3, random() r_cm
  FROM generate_series(1, ${N}) gs
),
ord AS (
  SELECT g.*, (ROW_NUMBER() OVER (ORDER BY md5(g.gs::text || '${y}')) + ${offset}) AS seq FROM grille g
),
cal AS (
  SELECT o.*, '${y}-01-01'::timestamptz + (floor(((o.seq - ${offset} - 1) * ${jours}.0 / ${N}))::int * interval '1 day')
           + (floor(o.r_d1 * 9) * interval '1 hour') + (floor(o.r_d2 * 55) * interval '1 minute') AS dateReception
  FROM ord o
),
fam AS (
  SELECT c.*, t."societeId", t.socn, t.gros, t.ids_p, t.ids_c, t.ids_e, t.noms_p, t.noms_c, t.noms_e
  FROM cal c
  JOIN tmp_fam t ON t.socn = ((c.famIdx - 1) % ${NB_SOCIETES}) + 1
                AND t.famn = ${a.famillesDe} + ((c.famIdx - 1) / ${NB_SOCIETES})::int
),
memb AS (
  SELECT f.*,
         CASE WHEN f.r_m < 0.72 THEN 0
              WHEN f.r_m < 0.90 AND f.ids_c IS NOT NULL THEN 1
              WHEN f.ids_e IS NOT NULL THEN 2
              ELSE 0 END AS mtyp,
         1 + (floor(f.r_m * 997)::int % GREATEST(1, COALESCE(array_length(f.ids_e, 1), 1))) AS eidx,
         ${typeExpr} AS typeDossier,
         ${parentExpr} AS parentType,
         CASE WHEN f.r_src < 0.55 THEN 'EXCEL' WHEN f.r_src < 0.80 THEN 'MANUEL'
              WHEN f.r_src < 0.95 THEN 'SAGE' ELSE 'ISA' END AS source,
         CASE WHEN f.r_cat < 0.40 THEN 'REGLEMENT_PRESTATAIRE' ELSE 'REMBOURSEMENT_ASSURE' END AS categorie
  FROM fam f
),
sel AS (
  SELECT m.*,
         CASE m.mtyp WHEN 0 THEN m.ids_p[1] WHEN 1 THEN m.ids_c[1] ELSE m.ids_e[m.eidx] END AS assureId,
         CASE m.mtyp WHEN 0 THEN m.noms_p[1] WHEN 1 THEN m.noms_c[1] ELSE m.noms_e[m.eidx] END AS beneficiaire,
         GREATEST('${y}-01-01'::timestamptz, date_trunc('day', m.dateReception - (floor(m.r_d3 * 20)::int * interval '1 day'))) AS dateSoins,
         CASE m.mtyp WHEN 0 THEN m.ids_p[1] WHEN 1 THEN COALESCE(m.ids_c[1], m.ids_p[1])
              ELSE COALESCE(m.ids_e[m.eidx], m.ids_p[1]) END AS idMembre
  FROM memb m
),
brm AS (
  SELECT s.*, b.id AS baremeId, b."tauxCouverture" AS baremeTaux, b.plafond AS baremePlafond,
         b."valideDu" AS bvd, b."valideAu" AS bva, b.active AS baremeActif,
         CASE WHEN s.parentType = 'OPTIQUE' THEN (s.socn IN (13, 29, 52, 77)) ELSE false END AS optiqueInactif
  FROM sel s
  LEFT JOIN "Bareme" b ON b."societeId" = s."societeId" AND b.prestation = s.parentType
         AND b."valideDu" <= s.dateSoins AND (b."valideAu" IS NULL OR b."valideAu" >= s.dateSoins)
),
stat AS (
  SELECT t.*,
         EXTRACT(EPOCH FROM ('${AUJOURDHUI}'::timestamptz - t.dateReception)) / 3600.0 AS ageH
  FROM brm t
),
st1 AS (
  SELECT s.*,
         CASE WHEN s.ageH < 24 THEN
                CASE WHEN s.r_s < 0.40 THEN 'RECU' WHEN s.r_s < 0.70 THEN 'EN_ANALYSE'
                     WHEN s.r_s < 0.85 THEN 'VALIDE' WHEN s.r_s < 0.95 THEN 'REJETE'
                     ELSE 'EN_COMPTABILITE' END
              WHEN s.ageH < 504 THEN
                CASE WHEN s.r_s < 0.10 THEN 'RECU' WHEN s.r_s < 0.22 THEN 'EN_ANALYSE'
                     WHEN s.r_s < 0.34 THEN 'VALIDE' WHEN s.r_s < 0.42 THEN 'REJETE'
                     WHEN s.r_s < 0.57 THEN 'EN_COMPTABILITE' ELSE 'EN_PAIEMENT' END
              ELSE
                CASE WHEN s.r_s < 0.60 THEN 'PAYE' WHEN s.r_s < 0.69 THEN 'VALIDE'
                     WHEN s.r_s < 0.76 THEN 'EN_PAIEMENT' WHEN s.r_s < 0.84 THEN 'EN_COMPTABILITE'
                     WHEN s.r_s < 0.90 THEN 'EN_ANALYSE' WHEN s.r_s < 0.94 THEN 'RECU' ELSE 'REJETE' END
              END AS statut0
  FROM stat s
),
st2 AS (
  SELECT s1.*,
         CASE WHEN s1.parentType = 'OPTIQUE' AND s1.optiqueInactif THEN 'ACCUEIL'
              WHEN s1.statut0 = 'REJETE' THEN CASE WHEN s1.r_rs < 0.20 THEN 'ACCUEIL'
                     WHEN s1.r_rs < 0.65 THEN 'TECHNIQUE' ELSE 'COMPTABILITE' END
              ELSE NULL END AS stageRejet,
         CASE WHEN s1.parentType = 'OPTIQUE' AND s1.optiqueInactif THEN 'REJETE'
              ELSE s1.statut0 END AS statut1
  FROM st1 s1
),
del AS (
  SELECT s2.*,
         (CASE WHEN s2.r_d1 < 0.80 THEN 5 + floor(s2.r_d1 * 31) ELSE 35 + floor((s2.r_d1 - 0.80) * 425) END)::int AS accMin,
         (CASE WHEN s2.r_d2 < 0.70 THEN 60 + floor(s2.r_d2 * 243) ELSE 300 + floor((s2.r_d2 - 0.70) * 9000) END)::int AS techMin,
         (CASE WHEN s2.r_d3 < 0.80 THEN 20 + floor(s2.r_d3 * 95) ELSE 150 + floor((s2.r_d3 - 0.80) * 5000) END)::int AS comptaMin,
         CASE WHEN s2.statut1 = 'PAYE' AND s2.ageH < 504 THEN 'EN_PAIEMENT' ELSE s2.statut1 END AS statutFin
  FROM st2 s2
),
dts AS (
  SELECT d.*,
         CASE WHEN d.statutFin = 'RECU' OR (d.statutFin = 'REJETE' AND d.stageRejet = 'ACCUEIL') THEN NULL
              ELSE d.dateReception + (d.accMin || ' minutes')::interval END AS dateTraitementTechnique,
         CASE WHEN d.statutFin = 'REJETE' THEN
                CASE d.stageRejet WHEN 'ACCUEIL' THEN
                  CASE floor(d.r_mot * 3)::int WHEN 0 THEN ${q(MOTIFS_REJET.ACCUEIL[0])} WHEN 1 THEN ${q(MOTIFS_REJET.ACCUEIL[1])} ELSE ${q(MOTIFS_REJET.ACCUEIL[2])} END
                WHEN 'TECHNIQUE' THEN
                  CASE floor(d.r_mot * 3)::int WHEN 0 THEN ${q(MOTIFS_REJET.TECHNIQUE[0])} WHEN 1 THEN ${q(MOTIFS_REJET.TECHNIQUE[1])} ELSE ${q(MOTIFS_REJET.TECHNIQUE[2])} END
                ELSE
                  CASE floor(d.r_mot * 2)::int WHEN 0 THEN ${q(MOTIFS_REJET.COMPTABILITE[0])} ELSE ${q(MOTIFS_REJET.COMPTABILITE[1])} END
                END
              ELSE NULL END AS motifRejet
  FROM del d
),
dates2 AS (
  SELECT d.*,
         CASE WHEN d.statutFin IN ('EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
                   OR (d.statutFin = 'REJETE' AND d.stageRejet = 'COMPTABILITE')
                THEN d.dateTraitementTechnique + (d.techMin || ' minutes')::interval END AS dateReceptionDecompte
  FROM dts d
),
dates3 AS (
  SELECT d2.*,
         CASE WHEN d2.statutFin = 'PAYE'
                THEN d2.dateReceptionDecompte + ((d2.comptaMin + 2880 + floor(d2.r_pay * 12960)) || ' minutes')::interval END AS datePaiement
  FROM dates2 d2
),
mtr AS (
  SELECT d3.*, ROUND((CASE WHEN d3.gros THEN 2.5 ELSE 1.0 END * (${sqlMontantCase('d3.typeDossier')}))::numeric, 2) AS montantReclame
  FROM dates3 d3
),
mont AS (
  SELECT m.*,
         SUM(CASE WHEN m.statutFin IN ('EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
                  THEN ROUND((m.montantReclame * m.baremeTaux / 100.0)::numeric, 2) ELSE 0 END)
           OVER (PARTITION BY m.assureId, m.parentType ORDER BY m.seq
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS cumulAvant
  FROM mtr m
),
final AS (
  SELECT mo.*,
         CASE WHEN mo.baremeActif AND mo.statutFin IN ('EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
                THEN LEAST(ROUND((mo.montantReclame * mo.baremeTaux / 100.0)::numeric, 2),
                           GREATEST(0, COALESCE(mo.baremePlafond, 0) - COALESCE(mo.cumulAvant, 0))) END AS montantValide
  FROM mont mo
)
INSERT INTO "Dossier" (id, "numeroDossier", "dateReception", "societeId", beneficiaire, "typeDossier", "categorieDossier",
  "gestionnaireAccueilId", "gestionnaireControleMedicalId", "createurId", "assureId", "nSS", "prestataireId",
  "dateSoins", "moyenPaiement", observations, "dateTraitementTechnique",
  "montantReclame", "montantValide", "ticketModerateur", "partPatient", "partEntreprise",
  "baremeId", "baremePrestation", "baremeTaux", "baremePlafond", "baremeValideDu", "baremeValideAu",
  "gestionnaireTechniqueId", "motifRejet", "dateReceptionDecompte", "datePaiement", "referencePaiement",
  "montantPaye", "gestionnaireComptaId", statut, source, historique, "createdAt", "updatedAt")
SELECT
  'dos-' || ${y} || '-' || lpad(f.seq::text, 7, '0'),
  'DOS-' || ${y} || '-' || lpad(f.seq::text, 6, '0'),
  f.dateReception, f."societeId", f.beneficiaire, f.typeDossier, f.categorie,
  (${ARR_GRS_ACC})[1 + floor(f.r_g1 * ${GRS_ACCUEIL.length})::int],
  CASE WHEN f.r_cm < 0.08 THEN (${ARR_GRS_CM})[1 + floor(f.r_g1 * ${GRS_CM.length})::int] END,
  CASE WHEN f.source = 'MANUEL' THEN (${ARR_USR_ACC})[1 + floor(f.r_g2 * ${UTIL_ACCUEIL.length})::int] END,
  f.assureId, am."nSS",
  (COALESCE(ps.ids, psa.ids))[1 + floor(f.r_g3 * cardinality(COALESCE(ps.ids, psa.ids)))::int],
  f.dateSoins,
  CASE WHEN f.statutFin IN ('EN_PAIEMENT', 'PAYE') THEN
    CASE WHEN f.r_mp < 0.60 THEN 'VIREMENT' WHEN f.r_mp < 0.80 THEN 'MOBILE_MONEY'
         WHEN f.r_mp < 0.95 THEN 'CHEQUE' ELSE 'ESPECES' END END,
  CASE WHEN f.r_obs < 0.05 THEN 'Feuille de soins joints à la demande'
       WHEN f.r_obs < 0.07 THEN 'Décompte transmis par la société'
       WHEN f.r_obs < 0.09 THEN 'Facture détaillée reçue par courriel'
       WHEN f.r_obs < 0.105 THEN 'Dossier déposé au guichet'
       WHEN f.r_obs < 0.12 THEN 'Accord préalable sollicité' END,
  f.dateTraitementTechnique,
  f.montantReclame,
  f.montantValide,
  CASE WHEN f.montantValide IS NOT NULL THEN f.montantReclame - f.montantValide END,
  CASE WHEN f.montantValide IS NOT NULL THEN f.montantReclame - f.montantValide END,
  f.montantValide,
  CASE WHEN f.baremeActif THEN f.baremeId END,
  CASE WHEN f.baremeActif THEN f.parentType END,
  CASE WHEN f.baremeActif THEN f.baremeTaux END,
  CASE WHEN f.baremeActif THEN f.baremePlafond END,
  CASE WHEN f.baremeActif THEN f.bvd END,
  CASE WHEN f.baremeActif THEN f.bva END,
  CASE WHEN NOT (f.statutFin = 'RECU' OR (f.statutFin = 'REJETE' AND f.stageRejet = 'ACCUEIL'))
       THEN (${ARR_GRS_TEC})[1 + floor(f.r_g2 * ${GRS_TECHNIQUE.length})::int] END,
  f.motifRejet,
  f.dateReceptionDecompte,
  f.datePaiement,
  CASE WHEN f.statutFin = 'PAYE' THEN 'REF-PAY-' || ${y} || '-' || lpad(f.seq::text, 6, '0') END,
  CASE WHEN f.statutFin = 'PAYE' THEN ROUND((f.montantValide * (0.98 + f.r_pay * 0.04))::numeric, 2) END,
  CASE WHEN f.statutFin IN ('EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
            OR (f.statutFin = 'REJETE' AND f.stageRejet = 'COMPTABILITE')
       THEN (${ARR_GRS_CMP})[1 + floor(f.r_g3 * ${GRS_COMPTA.length})::int] END,
  f.statutFin,
  f.source,
  CASE WHEN ${y} >= 2026 OR f.statutFin NOT IN ('PAYE', 'REJETE') THEN
    '[' ||
    CASE WHEN f.dateTraitementTechnique IS NOT NULL THEN
      '{"date":"' || ${TC('f.dateTraitementTechnique')} ||
      '","statut":"EN_ANALYSE","statutPrecedent":"RECU","commentaire":"Changement via Kanban","userId":null}'
    WHEN f.statutFin = 'REJETE' THEN
      '{"date":"' || ${TC(`f.dateReception + ((5 + floor(f.r_d1 * 115)) || ' minutes')::interval`)} ||
      '","statut":"REJETE","statutPrecedent":"RECU","commentaire":"Changement via Kanban","userId":null}'
    ELSE '' END ||
    CASE WHEN f.dateReceptionDecompte IS NOT NULL AND f.statutFin NOT IN ('REJETE') THEN
      ',{"date":"' || ${TC(`f.dateTraitementTechnique + ((15 + floor(f.r_d1 * 45)) || ' minutes')::interval`)} ||
      '","statut":"VALIDE","statutPrecedent":"EN_ANALYSE","commentaire":"Changement via Kanban","userId":null}' ||
      ',{"date":"' || ${TC('f.dateReceptionDecompte')} ||
      '","statut":"EN_COMPTABILITE","statutPrecedent":"VALIDE","commentaire":"Changement via Kanban","userId":null}'
    WHEN f.dateReceptionDecompte IS NOT NULL AND f.statutFin = 'REJETE' THEN
      ',{"date":"' || ${TC(`f.dateTraitementTechnique + ((15 + floor(f.r_d1 * 45)) || ' minutes')::interval`)} ||
      '","statut":"VALIDE","statutPrecedent":"EN_ANALYSE","commentaire":"Changement via Kanban","userId":null}' ||
      ',{"date":"' || ${TC('f.dateReceptionDecompte')} ||
      '","statut":"EN_COMPTABILITE","statutPrecedent":"VALIDE","commentaire":"Changement via Kanban","userId":null}' ||
      ',{"date":"' || ${TC(`f.dateReceptionDecompte + ((20 + floor(f.r_d2 * 100)) || ' minutes')::interval`)} ||
      '","statut":"REJETE","statutPrecedent":"EN_COMPTABILITE","commentaire":"Changement via Kanban","userId":null}'
    WHEN f.dateTraitementTechnique IS NOT NULL AND f.statutFin = 'REJETE' THEN
      ',{"date":"' || ${TC(`f.dateTraitementTechnique + ((20 + floor(f.r_d2 * 100)) || ' minutes')::interval`)} ||
      '","statut":"REJETE","statutPrecedent":"EN_ANALYSE","commentaire":"Changement via Kanban","userId":null}'
    ELSE '' END ||
    CASE WHEN f.statutFin IN ('EN_PAIEMENT', 'PAYE') THEN
      ',{"date":"' || ${TC(`f.dateReceptionDecompte + ((30 + floor(f.r_d2 * 90)) || ' minutes')::interval`)} ||
      '","statut":"EN_PAIEMENT","statutPrecedent":"EN_COMPTABILITE","commentaire":"Changement via Kanban","userId":null}' ELSE '' END ||
    CASE WHEN f.statutFin = 'PAYE' THEN
      ',{"date":"' || ${TC('f.datePaiement')} ||
      '","statut":"PAYE","statutPrecedent":"EN_PAIEMENT","commentaire":"Changement via Kanban","userId":null}' ELSE '' END
    || ']' ELSE '[]' END,
  f.dateReception + (floor(f.r_d1 * 55) * interval '1 minute'),
  f.dateReception + (floor(f.r_d1 * 55) * interval '1 minute')
FROM final f
JOIN "Assure" am ON am.id = f.idMembre
LEFT JOIN tmp_ps ps ON ps."societeId" = f."societeId" AND ps.bucket =
       CASE f.parentType WHEN 'PHARMACIE' THEN 'PHAR' WHEN 'DENTAIRES' THEN 'DENT' WHEN 'OPTIQUE' THEN 'OPT'
                         WHEN 'HOSPITALISATION' THEN 'HOSP' WHEN 'ACCOUCHEMENT' THEN 'HOSP'
                         WHEN 'CONSULTATION' THEN 'CONS' ELSE 'LABO' END
LEFT JOIN tmp_ps_tous psa ON psa."societeId" = f."societeId";
`);
  }
}

// ─── Phase 6 : consommation plafonnée — passe 2 avec montants VALIDÉS ────────
function phaseConsommation() {
  ecrirePhase('Passe 2 — recalcul du montant validé avec la consommation RÉELLE (montants validés)', `
WITH cons AS (
  SELECT d.id,
         (d."montantReclame" * d."baremeTaux" / 100.0)::numeric AS theorique,
         d."baremePlafond" AS plafond,
         SUM(d."montantValide") OVER (PARTITION BY d."assureId", d."baremePrestation",
               EXTRACT(YEAR FROM d."dateReception") ORDER BY d."numeroDossier"
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS cumulAvant
  FROM "Dossier" d
  WHERE d."societeId" IN (${SOCS_DEMO.replace('SELECT id FROM', 'SELECT id FROM')})
    AND d.statut IN ('EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
    AND d."montantValide" IS NOT NULL
),
calc AS (
  SELECT c.id, LEAST(ROUND(c.theorique, 2), GREATEST(0, c.plafond - COALESCE(c.cumulAvant, 0))) AS mv2
  FROM cons c
)
UPDATE "Dossier" d
SET "montantValide" = c.mv2,
    "ticketModerateur" = d."montantReclame" - c.mv2,
    "partPatient" = d."montantReclame" - c.mv2,
    "partEntreprise" = c.mv2,
    "montantPaye" = CASE WHEN d.statut = 'PAYE' THEN ROUND((c.mv2 * 1.0)::numeric, 2) END
FROM calc c WHERE d.id = c.id AND d."montantValide" IS DISTINCT FROM c.mv2;`.repeat(4));
}

// ─── Phase 7 : étapes KPI — 1 ligne TRAVAIL par service traversé ─────────────
function phaseEtapes() {
  const ARR_USR_ACC = `ARRAY[${UTIL_ACCUEIL.map((e) => q(UTIL_ID(e))).join(',')}]`;
  const ARR_USR_TEC = `ARRAY[${UTIL_TECHNIQUE.map((e) => q(UTIL_ID(e))).join(',')}]`;
  const ARR_USR_CMP = `ARRAY[${UTIL_COMPTA.map((e) => q(UTIL_ID(e))).join(',')}]`;
  const ARR_USR_SANTE = `ARRAY[${UTIL_SANTE.map((e) => q(UTIL_ID(e))).join(',')}]`;
  const ARR_GRS_ACC = `ARRAY[${GRS_ACCUEIL.map(q).join(',')}]`;
  const ARR_GRS_TEC = `ARRAY[${GRS_TECHNIQUE.map(q).join(',')}]`;
  const ARR_GRS_CMP = `ARRAY[${GRS_COMPTA.map(q).join(',')}]`;
  const ARR_GRS_CM = `ARRAY[${GRS_CM.map(q).join(',')}]`;
  const MOTIFS_RET = MOTIFS_RETOUR.map(q).join(', ');
  for (const a of ANNEES) {
    const y = a.annee;
    ecrirePhase(`Étapes KPI ${y} — ACCUEIL (1 ligne par dossier, ouverte si statut RECU)`, `
INSERT INTO "EtapeTraitement" (id, "dossierId", service, "userId", "gestionnaireId", type, source, "statutAvant", "statutApres", "dateAffectation", "dateDebut", "dateFin")
SELECT d.id || '-ACC', d.id, 'ACCUEIL',
       (${ARR_USR_ACC})[1 + floor(random() * ${UTIL_ACCUEIL.length})::int],
       (${ARR_GRS_ACC})[1 + floor(random() * ${GRS_ACCUEIL.length})::int],
       'TRAVAIL', 'MIGRATION', 'RECU',
       CASE WHEN d.statut = 'RECU' THEN NULL
            WHEN d.statut = 'REJETE' AND d."dateTraitementTechnique" IS NULL THEN 'REJETE'
            ELSE 'EN_ANALYSE' END,
       d."dateReception",
       CASE WHEN d.statut = 'RECU' THEN d."dateReception" + (floor(random() * 9) || ' minutes')::interval
            ELSE LEAST(d."dateReception" + (floor(random() * 9) || ' minutes')::interval,
                 COALESCE(d."dateTraitementTechnique",
                   d."dateReception" + ((5 + floor(random() * 115)) || ' minutes')::interval) - interval '1 minute') END,
       CASE WHEN d.statut = 'RECU' THEN NULL
            ELSE COALESCE(d."dateTraitementTechnique",
                 d."dateReception" + ((5 + floor(random() * 115)) || ' minutes')::interval) END
FROM "Dossier" d WHERE d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y};`);
    ecrirePhase(`Étapes KPI ${y} — TECHNIQUE (si le dossier a atteint l'analyse)`, `
INSERT INTO "EtapeTraitement" (id, "dossierId", service, "userId", "gestionnaireId", type, source, "statutAvant", "statutApres", "dateAffectation", "dateDebut", "dateFin")
SELECT d.id || '-TEC', d.id, 'TECHNIQUE',
       (${ARR_USR_TEC})[1 + floor(random() * ${UTIL_TECHNIQUE.length})::int],
       (${ARR_GRS_TEC})[1 + floor(random() * ${GRS_TECHNIQUE.length})::int],
       'TRAVAIL', 'MIGRATION', 'EN_ANALYSE',
       CASE WHEN d.statut IN ('EN_ANALYSE', 'VALIDE') THEN NULL
            WHEN d.statut = 'REJETE' THEN 'REJETE'
            ELSE 'EN_COMPTABILITE' END,
       d."dateTraitementTechnique",
       d."dateTraitementTechnique" + (floor(random() * 12) || ' minutes')::interval,
       CASE WHEN d.statut IN ('EN_ANALYSE', 'VALIDE') THEN NULL
            WHEN d.statut = 'REJETE' THEN d."dateTraitementTechnique" + ((60 + floor(random() * 2940)) || ' minutes')::interval
            ELSE d."dateReceptionDecompte" END
FROM "Dossier" d
WHERE d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y}
  AND d.statut NOT IN ('RECU') AND NOT (d.statut = 'REJETE' AND d."dateTraitementTechnique" IS NULL);`);
    ecrirePhase(`Étapes KPI ${y} — COMPTABILITÉ (si le dossier a atteint la comptabilité)`, `
INSERT INTO "EtapeTraitement" (id, "dossierId", service, "userId", "gestionnaireId", type, source, "statutAvant", "statutApres", "dateAffectation", "dateDebut", "dateFin")
SELECT d.id || '-CMP', d.id, 'COMPTABILITE',
       (${ARR_USR_CMP})[1 + floor(random() * ${UTIL_COMPTA.length})::int],
       (${ARR_GRS_CMP})[1 + floor(random() * ${GRS_COMPTA.length})::int],
       'TRAVAIL', 'MIGRATION', 'EN_COMPTABILITE',
       CASE WHEN d.statut = 'PAYE' THEN 'PAYE'
            WHEN d.statut = 'REJETE' THEN 'REJETE' ELSE NULL END,
       d."dateReceptionDecompte",
       d."dateReceptionDecompte" + (floor(random() * 15) || ' minutes')::interval,
       CASE WHEN d.statut = 'PAYE' THEN d."datePaiement"
            WHEN d.statut = 'REJETE' THEN d."dateReceptionDecompte" + ((20 + floor(random() * 4300)) || ' minutes')::interval
            ELSE NULL END
FROM "Dossier" d
WHERE d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y}
  AND (d.statut IN ('EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE')
       OR (d.statut = 'REJETE' AND d."dateReceptionDecompte" IS NOT NULL));`);
    ecrirePhase(`Étapes KPI ${y} — CONTRÔLE MÉDICAL (4 % des dossiers, quelques-unes ouvertes)`, `
INSERT INTO "EtapeTraitement" (id, "dossierId", service, "userId", "gestionnaireId", type, source, "statutAvant", "statutApres", "dateAffectation", "dateDebut", "dateFin")
SELECT d.id || '-CM', d.id, 'CONTROLE_MEDICAL',
       (${ARR_USR_SANTE})[1 + floor(random() * ${UTIL_SANTE.length})::int],
       (${ARR_GRS_CM})[1 + floor(random() * ${GRS_CM.length})::int],
       'TRAVAIL', 'MIGRATION', NULL, NULL,
       x.da,
       NULL,
       CASE WHEN d.statut IN ('RECU', 'EN_ANALYSE') AND random() < 0.45 THEN NULL
            ELSE x.da + ((30 + floor(random() * 150)) || ' minutes')::interval END
FROM "Dossier" d
CROSS JOIN LATERAL (SELECT COALESCE(d."dateTraitementTechnique", d."dateReception" + ((5 + floor(random() * 115)) || ' minutes')::interval) AS da) x
WHERE d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y}
  AND random() < 0.04;`);
    ecrirePhase(`Étapes KPI ${y} — RETOUR_CORRECTION (3 % des dossiers en analyse)`, `
INSERT INTO "EtapeTraitement" (id, "dossierId", service, "userId", "gestionnaireId", type, source, "statutAvant", "statutApres", "dateAffectation", "dateDebut", "dateFin", "motifRetour")
SELECT d.id || '-RC', d.id, 'TECHNIQUE',
       (${ARR_USR_TEC})[1 + floor(random() * ${UTIL_TECHNIQUE.length})::int],
       (${ARR_GRS_TEC})[1 + floor(random() * ${GRS_TECHNIQUE.length})::int],
       'RETOUR_CORRECTION', 'MIGRATION', 'EN_ANALYSE', 'EN_ANALYSE',
       t, t, t,
       CASE floor(random() * ${MOTIFS_RETOUR.length})::int WHEN 0 THEN ${q(MOTIFS_RETOUR[0])} WHEN 1 THEN ${q(MOTIFS_RETOUR[1])} ELSE ${q(MOTIFS_RETOUR[2])} END
FROM "Dossier" d
CROSS JOIN LATERAL (SELECT d."dateTraitementTechnique" + ((60 + floor(random() * 240)) || ' minutes')::interval AS t) x
WHERE d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y}
  AND d."dateTraitementTechnique" IS NOT NULL AND random() < 0.03;`);
    ecrirePhase(`Étapes KPI ${y} — suspensions de périodes techniques (4 % des étapes fermées)`, `
INSERT INTO "EtapeSuspension" (id, "etapeId", motif, "suspenduA", "reprisA", "parId")
SELECT e.id || '-S1', e.id,
       CASE floor(random() * ${MOTIFS_SUSPENSION.length})::int WHEN 0 THEN ${q(MOTIFS_SUSPENSION[0])} WHEN 1 THEN ${q(MOTIFS_SUSPENSION[1])} ELSE ${q(MOTIFS_SUSPENSION[2])} END,
       s1, LEAST(s1 + ((60 + floor(random() * 2400)) || ' minutes')::interval, e."dateFin"), NULL
FROM "EtapeTraitement" e
JOIN "Dossier" d ON d.id = e."dossierId"
CROSS JOIN LATERAL (SELECT e."dateDebut" + ((30 + floor(random() * GREATEST(1, (EXTRACT(EPOCH FROM (e."dateFin" - e."dateDebut")) / 60)) / 2))::int || ' minutes')::interval AS s1) x
WHERE e.service = 'TECHNIQUE' AND e."dateFin" IS NOT NULL AND e.type = 'TRAVAIL'
  AND d."societeId" IN (${SOCS_DEMO}) AND EXTRACT(YEAR FROM d."dateReception") = ${y}
  AND random() < 0.04;`);
  }
}

// ─── Phase 8 : budgets consommés, appels de fonds, commentaires, marqueur ────
function phaseFin() {
  ecrirePhase('Budgets utilisés des contrats (somme des paiements de l\'année)', `
UPDATE "Contrat" c
SET "budgetUtilise" = COALESCE((SELECT SUM(d."montantPaye") FROM "Dossier" d
        WHERE d."societeId" = c."societeId" AND d.statut = 'PAYE'
          AND d."datePaiement" BETWEEN c."dateDebut" AND c."dateFin"), 0)
WHERE c."societeId" IN (${SOCS_DEMO});`);
  ecrirePhase('Appels de fonds 2026 (trimestriels, réglés puis en attente)', `
INSERT INTO "AppelDeFonds" (id, "contratId", montant, "dateAppel", "datePaiement", reference, statut, observations, "createdAt", "updatedAt")
SELECT 'adf-' || c."societeId" || '-Q' || g.n, c.id, ROUND(c."budgetAnnuel" / 4.0, 2),
       (DATE '2026-01-15' + ((g.n - 1) * 3 || ' months')::interval) + (floor(random() * 10) || ' days')::interval,
       CASE WHEN g.n <= 2 OR (g.n = 3 AND random() < 0.6)
            THEN (DATE '2026-01-15' + ((g.n - 1) * 3 || ' months')::interval) + ((5 + floor(random() * 15)) || ' days')::interval END,
       'ADF-2026-Q' || g.n || '-' || c.reference,
       CASE WHEN g.n <= 2 OR (g.n = 3 AND random() < 0.6) THEN 'REGLE' ELSE 'EN_ATTENTE' END,
       'Appel trimestriel conformément au mode de calcul de la société', now(), now()
FROM "Contrat" c CROSS JOIN generate_series(1, 4) g(n)
WHERE c."societeId" IN (${SOCS_DEMO}) AND c.reference LIKE '%-2026';`);
  ecrirePhase('Commentaires d\'échantillon sur les dossiers ouverts de 2026 (activité réelle de gestion)', `
INSERT INTO "Commentaire" (id, "dossierId", "auteurId", contenu, prive, "createdAt")
SELECT 'cm-' || d.id, d.id,
       (ARRAY[(SELECT id FROM "Utilisateur" WHERE email = 'admin@suivisante.mg'),
              (SELECT id FROM "Utilisateur" WHERE email = 'chef.technique@suivisante.mg'),
              (SELECT id FROM "Utilisateur" WHERE email = 'technique@suivisante.mg')])[1 + floor(random() * 3)::int],
       CASE floor(random() * 4)::int WHEN 0 THEN 'Pièces complémentaires demandées à la société'
         WHEN 1 THEN 'Contrôle de plafond effectué, dossier conforme'
         WHEN 2 THEN 'En attente du décompte du prestataire'
         ELSE 'Prioritaire — traitement accéléré demandé' END,
       random() < 0.2,
       d."createdAt" + ((1 + floor(random() * 48)) || ' hours')::interval
FROM "Dossier" d
WHERE d."societeId" IN (${SOCS_DEMO}) AND d."dateReception" >= '2026-01-01'
  AND d.statut IN ('EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE') AND random() < 0.02
LIMIT 2000;`);
  ecrirePhase('Marqueur du générateur (journal d\'audit, aucune table supplémentaire)', `
INSERT INTO "HistoriqueParametre" (id, entite, "entiteId", champ, "nouvelleValeur", "modifiePar", action, niveau, module, objet, motif, "dateModification")
SELECT 'gen-run-' || to_char(now(), 'YYYYMMDDHH24MISS'), 'GENERATEUR_DONNEES_TEST', 'jeu-demo', 'CREATION',
       'seed=0.4242; societes=${NB_SOCIETES}; familles=${NB_SOCIETES * FAMILLES_PAR_SOCIETE}; dossiers=${NB_SOCIETES * FAMILLES_PAR_SOCIETE * DOSSIERS_PAR_FAMILLE}; prestataires=${NB_PRESTATAIRES}',
       'generateur@demo.suivisante.mg', 'CREATION', 'STANDARD', 'Générateur de données de test',
       'Jeu de démonstration — données 100 % fictives (domaine demo.mg, codes DEM-*)',
       'Environnement de recette uniquement', now()
WHERE EXISTS (SELECT 1 FROM "Societe" LIMIT 1);`);
}

// ─── Exécution ───────────────────────────────────────────────────────────────
function requete(sql) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL requise'); process.exit(1); }
  const out = execFileSync(PG_BIN, ['-h', '127.0.0.1', '-p', '5544', '-U', 'recette', '-d', 'suivisante_recette', '-At', '-c', sql], { encoding: 'utf8' });
  return out.trim();
}

async function main() {
  const existantes = parseInt(requete(`SELECT COUNT(*) FROM "Societe" WHERE email LIKE '%.demo.mg'`) || '0', 10);
  console.log(`Données démo existantes : ${existantes} société(s)`);
  if (RESET_ONLY) {
    if (!existantes) { console.log('Rien à purger.'); return; }
    const sqlPurge = phases.join('\n'); // phases ne contient encore que la purge
    writeFileSync(FICHIER_SQL, `BEGIN;\nSET LOCAL synchronous_commit = off;\nSELECT setseed(${SEED});\n${sqlPurge}\nCOMMIT;\n`);
    console.log('Purge en cours…');
    execFileSync(PG_BIN, ['-h', '127.0.0.1', '-p', '5544', '-U', 'recette', '-d', 'suivisante_recette', '-v', 'ON_ERROR_STOP=1', '-f', FICHIER_SQL], { stdio: 'inherit' });
    console.log('Purge terminée.'); return;
  }
  if (existantes && !RESET) {
    console.error('Le jeu de démonstration existe déjà. Relancez avec --reset (purge démo + recréation) ou --reset-only.');
    process.exit(1);
  }
  // Offsets de numérotation : continuer la séquence par année (compat. count+1)
  const offsets = {};
  for (const a of ANNEES) {
    const r = requete(`SELECT COALESCE(MAX(SUBSTRING("numeroDossier" FROM '[0-9]+$')::int), 0) FROM "Dossier" WHERE "numeroDossier" LIKE 'DOS-${a.annee}-%' AND "societeId" NOT IN (SELECT id FROM "Societe" WHERE email LIKE '%.demo.mg')`);
    offsets[a.annee] = parseInt(r || '0', 10);
    console.log(`Séquence ${a.annee} : départ après ${offsets[a.annee]}`);
  }
  phases.length = 0; // garder la purge (elle est nécessaire pour --reset) — purger AVANT
  ecrirePhase('Rien', ''); // placeholder supprimé ci-dessous
  phases.length = 0;
  // Purge en tête (sécurise une relance après échec partiel : --reset)
  const SOCS_B = `SELECT id FROM "Societe" WHERE email LIKE '%.demo.mg'`;
  phases.push(`\\echo ── Purge du jeu de démonstration (lignes démo uniquement) ──
DELETE FROM "ImportDossier" WHERE "dossierId" IN (SELECT id FROM "Dossier" WHERE "societeId" IN (${SOCS_B}));
DELETE FROM "Dossier" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "Assure" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "Bareme" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "AppelDeFonds" WHERE "contratId" IN (SELECT id FROM "Contrat" WHERE "societeId" IN (${SOCS_B}));
DELETE FROM "Contrat" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "ModeCalculAppelFonds" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "EntrepriseContact" WHERE "societeId" IN (${SOCS_B});
DELETE FROM "PrestataireSociete" WHERE "societeId" IN (${SOCS_B}) OR "prestataireId" IN (SELECT id FROM "Prestataire" WHERE code LIKE 'DEM-%');
DELETE FROM "Prestataire" WHERE code LIKE 'DEM-%';
DELETE FROM "Societe" WHERE email LIKE '%.demo.mg';`);

  await phasePersonnel();
  phaseSocietes();
  phasePrestataires();
  phaseAssures();
  phaseDossiers(offsets);
  phaseConsommation();
  phaseEtapes();
  phaseFin();

  const entete = `\\set ON_ERROR_STOP on
\\timing on
BEGIN;
SET LOCAL synchronous_commit = off;
SET work_mem = '256MB';
SET maintenance_work_mem = '512MB';
SELECT setseed(${SEED});
`;
  const fin = `
COMMIT;
ANALYZE "Dossier"; ANALYZE "EtapeTraitement"; ANALYZE "Assure"; ANALYZE "Societe"; ANALYZE "Prestataire"; ANALYZE "Bareme";
\\echo ── GÉNÉRATION TERMINÉE ──`;
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(FICHIER_SQL, entete + phases.join('\n') + fin + '\n');
  console.log(`SQL généré : ${FICHIER_SQL} (${(readFileSync(FICHIER_SQL).length / 1048576).toFixed(1)} Mo)`);
  console.log('Exécution via psql (peut durer plusieurs minutes)…');
  execFileSync(PG_BIN, ['-h', '127.0.0.1', '-p', '5544', '-U', 'recette', '-d', 'suivisante_recette', '-f', FICHIER_SQL], { stdio: 'inherit' });
  console.log('GÉNÉRATION TERMINÉE');
}

main().catch((e) => { console.error(e); process.exit(1); });
