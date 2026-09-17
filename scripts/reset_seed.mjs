// ─── Réinitialisation du jeu de données de test — Suivi-Santé ───────────────
// Purge des données métier (ordre FK) puis injection d'un nouveau jeu où
// CHAQUE société cliente possède SES PROPRES données couvrant JANVIER →
// SEPTEMBRE 2026 (dossiers, contrats, assurés, finances, courriels).
//
// CONSERVÉS   : référentiels (Gestionnaire, ConfigurationEmail, RateLimitCounter)
//               + comptes réels (admin + 2 comptes personnels)
// RECRÉÉS     : 5 sociétés — SANLAM, TELMA, JIRAMA, AIRTEL, BNI — chacune avec
//               un contrat actif 2026, ses assurés, ses barèmes, ses
//               conventions prestataires, ses dossiers (1 à 2 par mois, tous
//               statuts), ses appels de fonds (jan/avr/juil/sep), ses
//               courriels, son contact + compte CONTACT_ENTREPRISE.
// CAS D'ERREUR: contrat expiré (JIRAMA), assuré radié (SANLAM), prestataire
//               suspendu (SANLAM), convention inactive (AIRTEL), barème
//               inactif (SANLAM/OPTIQUE), session bot expirée.
//
// Déterministe : aucun Math.random — RNG seedé (mulberry32) → exécutions
// reproductibles. Usage : node scripts/reset_seed.mjs (DATABASE_URL requise).
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();

const PWD_INTERNE = 'SuiviSante@2026';   // comptes internes de test
const PWD_EXTERNE = 'Contact@2026';      // comptes externes (CONTACT_ENTREPRISE / PORTAIL_CLIENT)
const EMAILS_A_CONSERVER = [
  'admin@suivisante.mg',                 // administrateur fonctionnel
  'tsimbina.rason@mg.sanlamalli',        // compte réel (COMPTABILITE)
  'tsimbinarason@gmail.com',             // compte personnel du propriétaire (PORTAIL_CLIENT)
];
const EMAILS_DEMO = [
  'technique@suivisante.mg', 'compta@suivisante.mg', 'sante@suivisante.mg',
  'accueil@suivisante.mg', 'contact.sanlam@sanlam.mg', 'contact.telma@telma.mg',
  'contact.jirama@jirama.mg', 'contact.airtel@airtel.mg', 'contact.bni@bni.mg',
  'portail.sanlam@suivisante.mg', 'portail.telma@suivisante.mg',
];

const ANNEE = 2026;
const MOIS_MIN = 1, MOIS_MAX = 9;        // janvier → septembre

// Motifs de rejet des cas d'erreur (utilisés par l'historique ET le champ motifRejet)
const MOTIF_REJET = {
  REJETE_ASSURE_INACTIF: 'Assuré inactif : couverture résiliée avant la date de soins',
  REJETE_PRESTATAIRE_SUSPENDU: 'Prestataire suspendu au moment des soins',
  REJETE_CONTRAT_EXPIRE: 'Contrat 2025 expiré — assuré non renouvelé sur le contrat 2026',
  REJETE_CONVENTION_INACTIVE: 'Convention du prestataire inactive pour cette société',
  REJETE_PLAFOND: 'Montant au-delà du plafond garanti — accord préalable non obtenu',
  REJETE_GARANTIE_INACTIVE: 'Garantie OPTIQUE inactive pour ce contrat',
};

const D = (iso) => new Date(iso);
const dec = (s) => s;                    // Prisma accepte les strings pour Decimal(18,2)
const jour = (m, j) => D(`${ANNEE}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`);
const addJours = (d, n) => new Date(d.getTime() + n * 86400000);
const fmtDate = (d) => d.toISOString();

// RNG déterministe (mulberry32) — le « hasard » est reproductible.
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function purge() {
  console.log('🧹 PURGE (ordre des dépendances FK)...');
  const ordre = [
    'courrielEvenement', 'courrielSortant', 'botSession', 'messageBot',
    'commentaire', 'justificatif', 'importDossier', 'importHistorique',
    'courriel', 'appelDeFonds', 'dossier', 'contrat', 'prestataireSociete', 'bareme',
    'modeCalculAppelFonds', 'assure', 'entrepriseContact', 'prestataire',
    'societe',
  ];
  for (const t of ordre) {
    const r = await db[t].deleteMany({});
    console.log(`  - ${t.padEnd(22)} ${r.count} supprimés`);
  }
  const u = await db.utilisateur.deleteMany({ where: { email: { in: EMAILS_DEMO } } });
  console.log(`  - utilisateurs démo     ${u.count} supprimés (conservés : admin + comptes réels)`);
  const hist = await db.historiqueParametre.deleteMany({});
  console.log(`  - historiqueParametre   ${hist.count} supprimés (journal de test)`);
}

async function main() {
  console.log('🌱 RÉINITIALISATION — JEU DE DONNÉES PAR SOCIÉTÉ (JAN → SEP 2026)\n');
  await purge();

  const pwdInt = await hash(PWD_INTERNE, 12);
  const pwdExt = await hash(PWD_EXTERNE, 12);
  const admin = await db.utilisateur.findUnique({ where: { email: 'admin@suivisante.mg' } });
  if (!admin) throw new Error('Compte admin@suivisante.mg introuvable — abort.');

  // ── 0. Référentiel gestionnaires (conservé, complété si absent) ─────────
  const assurerGestionnaire = async (service, nom) => {
    const g = await db.gestionnaire.findFirst({ where: { service } });
    return g ?? db.gestionnaire.create({ data: { nom, service } });
  };
  const gAcc = await assurerGestionnaire('ACCUEIL', 'Ravao Andrianjaka');
  const gTec = await assurerGestionnaire('TECHNIQUE', 'Jean-Pierre Rakoto');
  const gCpt = await assurerGestionnaire('COMPTABILITE', 'Marie Rasoa');
  const nbGest = await db.gestionnaire.count();
  console.log(`\n🗂️  RÉFÉRENTIEL — ${nbGest} gestionnaires (ACCUEIL / TECHNIQUE / COMPTABILITE assurés)`);

  // ── 1. Utilisateurs : 4 internes + 5 CONTACT_ENTREPRISE + 2 portails ────
  console.log('\n👤 UTILISATEURS');
  const upUtil = (email, nom, role, password) => db.utilisateur.upsert({
    where: { email }, update: { nom, role, password, actif: true }, create: { email, nom, role, password },
  });
  const [uAccueil, uTechnique, uCompta, uSante] = await Promise.all([
    upUtil('accueil@suivisante.mg', 'Ravao Andrianjaka', 'ACCUEIL', pwdInt),
    upUtil('technique@suivisante.mg', 'Jean-Pierre Rakoto', 'TECHNIQUE', pwdInt),
    upUtil('compta@suivisante.mg', 'Marie Rasoa', 'COMPTABILITE', pwdInt),
    upUtil('sante@suivisante.mg', 'Dr. Nahitra Raza', 'SANTE', pwdInt),
  ]);
  console.log('  ✅ 4 comptes internes (accueil / technique / compta / sante)');

  // ── 2. CONFIGURATION PAR SOCIÉTÉ ─────────────────────────────────────────
  // Chaque société = un îlot de données autonome de janvier à septembre.
  // grilleStatuts[mois] = statuts des dossiers du mois (1 dossier / entrée).
  const SOCIETES = [
    {
      key: 'SANLAM', nom: 'SANLAM MADAGASCAR ASSURANCE',
      adresse: 'Immeuble Fiaro, Ankorondrano, Antananarivo', tel: '+261 34 12 345 67',
      nif: '3000123456', email: 'contact@sanlam.mg',
      contactPrincipal: 'Hery Rakotomalala',          // NOM SEUL (info)
      emailContactPrincipal: 'contact.sanlam@sanlam.mg', // e-mail dans le champ DÉDIÉ
      sourceLiaison: 'CONTACT',                        // fiche EntrepriseContact (source 1)
      budgetAnnuel: '120000000.00',
      baremes: [
        ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 80, '5000000.00'],
        ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00'],
        ['ACCOUCHEMENT', 85, '3000000.00'], ['IMAGERIE', 70, '400000.00'],
        ['DENTAIRES', 60, '300000.00'],
        ['OPTIQUE', 50, '250000.00', false],           // barème INACTIF — cas d'erreur
      ],
      grilleStatuts: {
        1: ['PAYE', 'PAYE'], 2: ['PAYE', 'REJETE_ASSURE_INACTIF'], 3: ['PAYE', 'PAYE'],
        4: ['VALIDE', 'PAYE'], 5: ['EN_PAIEMENT', 'PAYE'], 6: ['EN_COMPTABILITE', 'VALIDE'],
        7: ['VALIDE', 'REJETE_PRESTATAIRE_SUSPENDU'], 8: ['EN_ANALYSE', 'VALIDE'],
        9: ['RECU', 'EN_ANALYSE'],
      },
      types: ['PHARMACIE', 'CONSULTATION_SPECIALISE', 'HOSPITALISATION_MEDICAL', 'EXAMEN',
              'ACCOUCHEMENT_NORMAL', 'HOSPITALISATION_CHIRURGICAL', 'CONSULTATION_SIMPLE',
              'IMAGERIE', 'DENTAIRES_PROTHESE'],
      appels: [
        [1, 15, '25000000.00', 'REGLE'], [4, 1, '18000000.00', 'REGLE'],
        [7, 5, '15000000.00', 'REGLE'], [9, 10, '12000000.00', 'EN_ATTENTE'],
      ],
      modeCalcul: { mode: 'DEPENSE_MENSUELLE', periodicite: 'MENSUELLE' },
      contratExpire2025: '100000000.00',
    },
    {
      key: 'TELMA', nom: 'TELMA MADAGASCAR',
      adresse: 'Ankorondrano, Antananarivo', tel: '+261 33 11 222 33', nif: '3000223344',
      contactPrincipal: 'Voahangy Ravelomanana',
      emailContactPrincipal: 'contact.telma@telma.mg',
      sourceLiaison: 'SOCIETE_PRINCIPAL',              // source 2 : pas de fiche contact
      budgetAnnuel: '85000000.00',
      baremes: [
        ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 75, '4000000.00'],
        ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00'],
        ['ACCOUCHEMENT', 85, '3000000.00'], ['IMAGERIE', 70, '400000.00'],
        ['DENTAIRES', 60, '200000.00'],
      ],
      grilleStatuts: {
        1: ['PAYE', 'REJETE_PLAFOND'], 2: ['PAYE', 'VALIDE'], 3: ['PAYE', 'EN_PAIEMENT'],
        4: ['VALIDE', 'PAYE'], 5: ['EN_COMPTABILITE', 'PAYE'], 6: ['VALIDE', 'EN_PAIEMENT'],
        7: ['EN_COMPTABILITE', 'VALIDE'], 8: ['EN_ANALYSE', 'VALIDE'],
        9: ['RECU', 'EN_ANALYSE'],
      },
      types: ['CONSULTATION_SIMPLE', 'HOSPITALISATION_MEDICAL', 'PHARMACIE', 'EXAMEN',
              'CONSULTATION_SPECIALISE', 'IMAGERIE', 'ACCOUCHEMENT_NORMAL',
              'HOSPITALISATION_CHIRURGICAL', 'DENTAIRES_SOIN'],
      // DENTAIRES_SOIN → barème DENTAIRES (ajouté ci-dessus)
      appels: [
        [1, 20, '20000000.00', 'REGLE'], [4, 10, '15000000.00', 'REGLE'],
        [7, 15, '12000000.00', 'EN_ATTENTE'], [9, 12, '10000000.00', 'EN_ATTENTE'],
      ],
      modeCalcul: { mode: 'FONDS_ROULEMENT', periodicite: 'TRIMESTRIELLE',
                    parametres: { fondsRoulement: 15000000 } },
    },
    {
      key: 'JIRAMA', nom: 'JIRAMA',
      adresse: 'Rue Rainitovo, Antsahavola, Antananarivo', tel: '+261 20 22 333 44',
      nif: '3000334455', email: 'j.rakotoarison@jirama.mg',   // source 3 : e-mail général
      contactPrincipal: 'Jean-Claude Rakotoarison',
      sourceLiaison: 'SOCIETE_EMAIL',
      budgetAnnuel: '40000000.00',
      baremes: [
        ['CONSULTATION', 70, '100000.00'], ['PHARMACIE', 60, '200000.00'],
        ['HOSPITALISATION', 75, '4000000.00'], ['EXAMEN', 70, '400000.00'],
      ],
      grilleStatuts: {
        1: ['PAYE'], 2: ['PAYE'], 3: ['VALIDE'], 4: ['REJETE_CONTRAT_EXPIRE'],
        5: ['EN_PAIEMENT'], 6: ['PAYE'], 7: ['EN_COMPTABILITE'], 8: ['EN_ANALYSE'],
        9: ['RECU'],
      },
      types: ['HOSPITALISATION_MEDICAL', 'PHARMACIE', 'CONSULTATION_SIMPLE', 'EXAMEN'],
      appels: [
        [2, 5, '10000000.00', 'REGLE'], [5, 10, '8000000.00', 'REGLE'],
        [8, 15, '6000000.00', 'EN_ATTENTE'],
      ],
      modeCalcul: { mode: 'BUDGET_ANNUEL', periodicite: 'SEMESTRIELLE' },
      contratExpire2025: '40000000.00',
    },
    {
      key: 'AIRTEL', nom: 'AIRTEL MADAGASCAR',
      adresse: 'Immeuble Sky Media, Ambohimiangara, Antananarivo', tel: '+261 33 22 111 00',
      nif: '3000445566', email: 'contact@airtel.mg',
      contactPrincipal: 'Fenosoa Andriamampionona',
      emailContactPrincipal: 'contact.airtel@airtel.mg',
      sourceLiaison: 'CONTACT',
      budgetAnnuel: '60000000.00',
      baremes: [
        ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 80, '5000000.00'],
        ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00'],
        ['IMAGERIE', 65, '350000.00'],
      ],
      grilleStatuts: {
        1: ['PAYE'], 2: ['VALIDE'], 3: ['PAYE'], 4: ['REJETE_CONVENTION_INACTIVE'],
        5: ['EN_PAIEMENT'], 6: ['VALIDE'], 7: ['EN_COMPTABILITE'], 8: ['EN_ANALYSE'],
        9: ['RECU_CONVENTION_A_VERIFIER'],
      },
      types: ['CONSULTATION_SIMPLE', 'PHARMACIE', 'HOSPITALISATION_MEDICAL', 'IMAGERIE',
              'CONSULTATION_SPECIALISE'],
      appels: [
        [1, 25, '12000000.00', 'REGLE'], [4, 20, '10000000.00', 'EN_ATTENTE'],
        [8, 1, '8000000.00', 'REGLE'],
      ],
      modeCalcul: { mode: 'DEPENSE_MENSUELLE', periodicite: 'TRIMESTRIELLE' },
    },
    {
      key: 'BNI', nom: 'BNI MADAGASCAR',
      adresse: 'Avenue Philibert Tsiranana, Antananarivo', tel: '+261 32 45 678 90',
      nif: '3000556677', email: 'contact@bni.mg',
      contactPrincipal: 'Tojo Randrianarivelo',
      emailContactPrincipal: 'contact.bni@bni.mg',
      sourceLiaison: 'CONTACT',
      budgetAnnuel: '45000000.00',
      baremes: [
        ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 75, '3500000.00'],
        ['PHARMACIE', 60, '150000.00'], ['EXAMEN', 70, '400000.00'],
      ],
      grilleStatuts: {
        1: ['PAYE'], 2: ['VALIDE'], 3: ['PAYE'], 4: ['REJETE_PLAFOND'],
        5: ['EN_PAIEMENT'], 6: ['EN_COMPTABILITE'], 7: ['PAYE'], 8: ['EN_ANALYSE'],
        9: ['RECU'],
      },
      types: ['PHARMACIE', 'CONSULTATION_SPECIALISE', 'HOSPITALISATION_CHIRURGICAL',
              'EXAMEN', 'CONSULTATION_SIMPLE'],
      appels: [
        [3, 10, '9000000.00', 'REGLE'], [6, 10, '7000000.00', 'REGLE'],
        [9, 5, '6000000.00', 'EN_ATTENTE'],
      ],
      modeCalcul: { mode: 'FORMULE_SPECIFIQUE', periodicite: 'MENSUELLE',
                    parametres: { formule: '2% masse salariale trimestrielle' } },
    },
  ];

  console.log('\n🏢 SOCIÉTÉS (5 îlots de données autonomes, jan → sep)');
  const societes = {};
  const contrats2026 = {};
  const fichesParSource = { CONTACT: [], SOCIETE_PRINCIPAL: [], SOCIETE_EMAIL: [] };

  for (const cfg of SOCIETES) {
    const s = await db.societe.create({
      data: {
        nom: cfg.nom, adresse: cfg.adresse, telephone: cfg.tel, nif: cfg.nif,
        email: cfg.email ?? null,
        contactPrincipal: cfg.contactPrincipal,
        emailContactPrincipal: cfg.emailContactPrincipal ?? null,
      },
    });
    societes[cfg.key] = s;
    fichesParSource[cfg.sourceLiaison].push(cfg.key);

    // Fiche contact (source 1) — seulement pour les sociétés « CONTACT »
    if (cfg.sourceLiaison === 'CONTACT') {
      const [nomFamille, prenom] = cfg.contactPrincipal.split(' ').length > 2
        ? [cfg.contactPrincipal.split(' ').slice(1).join(' '), cfg.contactPrincipal.split(' ')[0]]
        : [cfg.contactPrincipal.split(' ')[1], cfg.contactPrincipal.split(' ')[0]];
      await db.entrepriseContact.create({
        data: {
          societeId: s.id, nom: nomFamille, prenom,
          fonction: 'Responsable RH', telephone: cfg.tel,
          email: cfg.emailContactPrincipal,
        },
      });
    }

    // Barèmes
    for (const [p, taux, plafond, actif = true] of cfg.baremes) {
      await db.bareme.create({
        data: { societeId: s.id, prestation: p, tauxCouverture: taux, plafond: dec(plafond), active: actif },
      });
    }

    // Contrat 2026 (actif) + éventuel contrat 2025 expiré
    const ctr = await db.contrat.create({
      data: {
        societeId: s.id, reference: `CTR-${cfg.key.slice(0, 3)}-${ANNEE}`,
        budgetAnnuel: dec(cfg.budgetAnnuel),
        dateDebut: D(`${ANNEE}-01-01`), dateFin: D(`${ANNEE}-12-31`), statut: 'ACTIF',
      },
    });
    contrats2026[cfg.key] = ctr;
    if (cfg.contratExpire2025) {
      await db.contrat.create({
        data: {
          societeId: s.id, reference: `CTR-${cfg.key.slice(0, 3)}-2025`,
          budgetAnnuel: dec(cfg.contratExpire2025),
          dateDebut: D('2025-01-01'), dateFin: D('2025-12-31'), statut: 'EXPIRE',
        },
      });
    }

    // Mode de calcul des appels de fonds
    await db.modeCalculAppelFonds.create({
      data: {
        societeId: s.id, mode: cfg.modeCalcul.mode, periodicite: cfg.modeCalcul.periodicite,
        parametres: JSON.stringify(cfg.modeCalcul.parametres ?? {}),
        dateDebut: D(`${ANNEE}-01-01`),
      },
    });
    console.log(`  ✅ ${cfg.nom.padEnd(34)} contrat ${ANNEE} actif + ${cfg.baremes.length} barèmes + ${cfg.contratExpire2025 ? 'contrat 2025 EXPIRE' : '—'}`);
  }
  console.log(`  ✅ sources de liaison : CONTACT=[${fichesParSource.CONTACT}] SOCIETE_PRINCIPAL=[${fichesParSource.SOCIETE_PRINCIPAL}] SOCIETE_EMAIL=[${fichesParSource.SOCIETE_EMAIL}]`);

  // ── 3. Prestataires + conventions par société ────────────────────────────
  console.log('\n🏥 PRESTATAIRES');
  // stat = Numéro Statistique (Madagascar), statutJuridique = forme juridique
  const P = (nom, type, tel, email, adr, nif, actif = true, rib = null, stat = null, statutJuridique = null) => db.prestataire.create({
    data: { nom, type, telephone: tel, email, adresse: adr, nif, actif, statut: actif ? 'CONVENTIONNE' : 'SUSPENDU', rib, stat, statutJuridique },
  });
  const pHop = await P('Hôpital Principal HJ Anosy', 'HOPITAL', '020 22 345 67', 'facturation@hopital-principal.mg', 'Avenue de la Libération, Anosy, Antananarivo', '4002345678', true, '000 12345 67890 12 3', '6512 311 2001 01234', 'SA');
  const pCli = await P('Clinique Sainte Marie', 'CLINIQUE', '032 12 345 67', 'contact@clinique-saintemarie.mg', 'Lot VJ 34 Antanimena, Antananarivo', '4001234567', true, '000 23456 78901 23 4', '6512 311 2002 02345', 'SARL');
  const pPha = await P('Pharmacie Centrale Anosy', 'PHARMACIE', '020 22 456 78', 'commande@pharmacie-centrale.mg', 'Place Behorizy, Antananarivo', '4004567890', true, null, '6512 311 2003 03456', 'SARL');
  const pBio = await P('Laboratoire BioMad', 'LABORATOIRE', '020 22 567 89', 'lab@biomad.mg', 'Isotry, Antananarivo', '4006789012', true, null, '6512 311 2004 04567', 'SUARL');
  const pDen = await P('Cabinet Dentaire Blanc', 'DENTAIRE', '033 67 890 12', 'blanc.dental@gmail.com', 'Analakely, Antananarivo', '4005678901', false, null, '6512 311 2005 05678', 'EI'); // INACTIF — cas d'erreur
  const pAmb = await P('Centre Médical Ambatobe', 'CABINET_MEDICAL', '034 56 789 01', 'rdv@cm-ambatobe.mg', 'Ambatobe, Antananarivo', '4003456789', true, null, '6512 311 2006 06789', 'SARL');
  const PRESTATAIRES = { pHop, pCli, pPha, pBio, pDen, pAmb };
  const CONVENTIONS = {
    SANLAM: [['pHop', true], ['pCli', true], ['pPha', true], ['pBio', true], ['pDen', true]], // pDen : convention active MAIS prestataire suspendu
    TELMA:  [['pHop', true], ['pCli', true], ['pPha', true], ['pAmb', true]],
    JIRAMA: [['pHop', true], ['pCli', true], ['pPha', true]],
    AIRTEL: [['pHop', true], ['pPha', true], ['pBio', true], ['pAmb', true], ['pCli', false]], // pCli INACTIVE — cas d'erreur
    BNI:    [['pHop', true], ['pCli', true], ['pPha', true], ['pBio', true]],
  };
  let nbConv = 0;
  for (const [key, convs] of Object.entries(CONVENTIONS)) {
    for (const [pKey, actif] of convs) {
      await db.prestataireSociete.create({
        data: { prestataireId: PRESTATAIRES[pKey].id, societeId: societes[key].id, actif },
      });
      nbConv++;
    }
  }
  console.log(`  ✅ 6 prestataires (1 inactif : Cabinet Dentaire Blanc) + ${nbConv} conventions (1 inactive : Clinique↔AIRTEL)`);

  // ── 4. Assurés par société ────────────────────────────────────────────────
  console.log('\n🧑‍💼 ASSURÉS (par société)');
  const A = (s, nom, prenom, nss, mat, type, opts = {}) => db.assure.create({
    data: {
      societeId: s.id, nom, prenom, nSS: nss, matricule: mat, typeBeneficiaire: type,
      dateNaissance: opts.naissance ? D(opts.naissance) : null,
      sexe: opts.sexe ?? null, dateEffet: opts.effet ? D(opts.effet) : null,
      bareme: opts.coeff ?? 1.0, telephone: opts.tel ?? null, email: opts.email ?? null,
      adresse: opts.adresse ?? null, actif: opts.actif ?? true,
      assurePrincipalId: opts.principal ?? null, codeFamille: opts.famille ?? null,
    },
  });
  const assures = {};
  // SANLAM (6 : 4 principaux dont 1 radié + 2 ayants droit)
  const san = societes.SANLAM;
  assures.SANLAM_actifs = [];
  assures.SANLAM_a1 = await A(san, 'Rasoanaivo', 'Tiana', 'SS-401257', 'MAT-SAN-0001', 'ASSURE', { naissance: '1988-05-14', sexe: 'F', effet: `${ANNEE}-01-01`, tel: '+261 34 55 001 01', email: 'portail.sanlam@suivisante.mg', adresse: 'Lot II M 45 Antanimena' });
  assures.SANLAM_a2 = await A(san, 'Rakotomalala', 'Faniry', 'SS-402118', 'MAT-SAN-0002', 'ASSURE', { naissance: '1982-11-02', sexe: 'M', effet: `${ANNEE}-01-01` });
  assures.SANLAM_a3 = await A(san, 'Andrianjaka', 'Mialy', 'SS-403322', 'MAT-SAN-0003', 'ASSURE', { naissance: '1990-03-27', sexe: 'F', effet: `${ANNEE}-02-01` });
  assures.SANLAM_a4 = await A(san, 'Rakotoarimanana', 'Nirina', 'SS-404477', 'MAT-SAN-0004', 'ASSURE', { naissance: '1979-08-19', sexe: 'M', effet: `${ANNEE}-01-01`, actif: false }); // RADIÉ — cas d'erreur
  assures.SANLAM_ad1 = await A(san, 'Rakotomalala', 'Rasoa', 'SS-402119', 'MAT-SAN-0002-C1', 'CONJOINT', { naissance: '1985-06-11', sexe: 'F', effet: `${ANNEE}-01-01`, principal: assures.SANLAM_a2.id, famille: 'FAM-SAN-001', coeff: 0.75 });
  assures.SANLAM_ad2 = await A(san, 'Rakotomalala', 'Tsiky', 'SS-402120', 'MAT-SAN-0002-C2', 'ENFANT', { naissance: '2015-09-30', sexe: 'F', effet: `${ANNEE}-01-01`, principal: assures.SANLAM_a2.id, famille: 'FAM-SAN-001', coeff: 0.5 });
  assures.SANLAM_actifs.push(assures.SANLAM_a1, assures.SANLAM_a2, assures.SANLAM_a3, assures.SANLAM_ad1, assures.SANLAM_ad2);
  // TELMA (5 : 3 principaux + 2 ayants droit)
  const tel = societes.TELMA;
  assures.TELMA_b1 = await A(tel, 'Randrianasolo', 'Lova', 'SS-511203', 'MAT-TEL-0001', 'ASSURE', { naissance: '1991-01-25', sexe: 'F', effet: `${ANNEE}-01-01`, tel: '+261 34 90 111 22', email: 'portail.telma@suivisante.mg' });
  assures.TELMA_b2 = await A(tel, 'Andriamampianina', 'Tojo', 'SS-512388', 'MAT-TEL-0002', 'ASSURE', { naissance: '1986-07-08', sexe: 'M', effet: `${ANNEE}-01-01` });
  assures.TELMA_b3 = await A(tel, 'Ratsimba', 'Hanta', 'SS-513441', 'MAT-TEL-0003', 'ASSURE', { naissance: '1993-12-03', sexe: 'F', effet: `${ANNEE}-03-01` });
  assures.TELMA_bd1 = await A(tel, 'Andriamampianina', 'Njaka', 'SS-512389', 'MAT-TEL-0002-C1', 'ENFANT', { naissance: '2017-02-14', sexe: 'M', effet: `${ANNEE}-01-01`, principal: assures.TELMA_b2.id, famille: 'FAM-TEL-001', coeff: 0.5 });
  assures.TELMA_bd2 = await A(tel, 'Andriamampianina', 'Voahangy', 'SS-512390', 'MAT-TEL-0002-C2', 'CONJOINT', { naissance: '1989-09-09', sexe: 'F', effet: `${ANNEE}-01-01`, principal: assures.TELMA_b2.id, famille: 'FAM-TEL-001', coeff: 0.75 });
  // JIRAMA (3 : 2 actifs + 1 radié non renouvelé — cas contrat expiré)
  const jir = societes.JIRAMA;
  assures.JIRAMA_c1 = await A(jir, 'Ramiandrisoa', 'Pierre', 'SS-601945', 'MAT-JIR-0001', 'ASSURE', { naissance: '1980-04-09', sexe: 'M', effet: '2025-01-01', actif: false });
  assures.JIRAMA_c2 = await A(jir, 'Rakotoarisoa', 'Aline', 'SS-602557', 'MAT-JIR-0002', 'ASSURE', { naissance: '1987-10-21', sexe: 'F', effet: `${ANNEE}-01-01` });
  assures.JIRAMA_c3 = await A(jir, 'Ramanantsoa', 'Hery', 'SS-603118', 'MAT-JIR-0003', 'ASSURE', { naissance: '1994-02-17', sexe: 'M', effet: `${ANNEE}-01-01` });
  // AIRTEL (3 actifs)
  const air = societes.AIRTEL;
  assures.AIRTEL_d1 = await A(air, 'Mananjara', 'Sitraka', 'SS-701833', 'MAT-AIR-0001', 'ASSURE', { naissance: '1992-06-16', sexe: 'M', effet: `${ANNEE}-01-01` });
  assures.AIRTEL_d2 = await A(air, 'Raharimalala', 'Fara', 'SS-702291', 'MAT-AIR-0002', 'ASSURE', { naissance: '1989-11-30', sexe: 'F', effet: `${ANNEE}-01-01` });
  assures.AIRTEL_d3 = await A(air, 'Andriatsitohaina', 'Mamy', 'SS-703475', 'MAT-AIR-0003', 'ASSURE', { naissance: '1996-07-04', sexe: 'M', effet: `${ANNEE}-04-01` });
  // BNI (3 actifs)
  const bni = societes.BNI;
  assures.BNI_e1 = await A(bni, 'Rajaonarivelo', 'Vololona', 'SS-801209', 'MAT-BNI-0001', 'ASSURE', { naissance: '1984-03-23', sexe: 'F', effet: `${ANNEE}-01-01` });
  assures.BNI_e2 = await A(bni, 'Rakotobe', 'Ando', 'SS-802317', 'MAT-BNI-0002', 'ASSURE', { naissance: '1990-09-12', sexe: 'M', effet: `${ANNEE}-01-01` });
  assures.BNI_e3 = await A(bni, 'Ratsimamanga', 'Sahondra', 'SS-803442', 'MAT-BNI-0003', 'ASSURE', { naissance: '1987-12-28', sexe: 'F', effet: `${ANNEE}-06-01` });
  const POOL_ASSURES = {
    SANLAM: assures.SANLAM_actifs,
    TELMA: [assures.TELMA_b1, assures.TELMA_b2, assures.TELMA_b3, assures.TELMA_bd1, assures.TELMA_bd2],
    JIRAMA: [assures.JIRAMA_c2, assures.JIRAMA_c3],
    AIRTEL: [assures.AIRTEL_d1, assures.AIRTEL_d2, assures.AIRTEL_d3],
    BNI: [assures.BNI_e1, assures.BNI_e2, assures.BNI_e3],
  };
  console.log('  ✅ 20 assurés : SANLAM 6 (1 radié, 2 ayants droit), TELMA 5 (2 ayants droit), JIRAMA 3 (1 radié), AIRTEL 3, BNI 3');

  // ── 5. Comptes externes rattachés par e-mail (les 3 sources) ─────────────
  await upUtil('contact.sanlam@sanlam.mg', 'Hery Rakotomalala', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('contact.telma@telma.mg', 'Voahangy Ravelomanana', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('contact.airtel@airtel.mg', 'Fenosoa Andriamampionona', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('contact.bni@bni.mg', 'Tojo Randrianarivelo', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('j.rakotoarison@jirama.mg', 'Jean-Claude Rakotoarison', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('portail.sanlam@suivisante.mg', 'Tiana Rasoanaivo', 'PORTAIL_CLIENT', pwdExt);
  await upUtil('portail.telma@suivisante.mg', 'Lova Randrianasolo', 'PORTAIL_CLIENT', pwdExt);
  console.log('  ✅ 5 comptes CONTACT_ENTREPRISE (1 par société) + 2 PORTAIL_CLIENT (liaison par e-mail)');

  // ── 6. DOSSIERS — par société, de janvier à septembre ────────────────────
  console.log('\n📁 DOSSIERS (chaque société, chaque mois de jan → sep)');
  const MONTANTS = {
    CONSULTATION_SIMPLE: [35000, 75000, 5000],
    CONSULTATION_SPECIALISE: [80000, 120000, 5000],
    HOSPITALISATION_MEDICAL: [1500000, 4500000, 250000],
    HOSPITALISATION_CHIRURGICAL: [5000000, 8000000, 250000],
    PHARMACIE: [60000, 150000, 5000],
    EXAMEN: [150000, 350000, 10000],
    ACCOUCHEMENT_NORMAL: [1800000, 2900000, 100000],
    IMAGERIE: [120000, 300000, 10000],
    DENTAIRES_SOIN: [90000, 220000, 10000],
    DENTAIRES_PROTHESE: [180000, 260000, 20000],
    OPTIQUE: [120000, 240000, 10000],
  };
  const CATEGORIE = (t) => (t.startsWith('HOSPITALISATION') || t.startsWith('ACCOUCHEMENT'))
    ? 'REGLEMENT_PRESTATAIRE' : 'REMBOURSEMENT_ASSURE';
  const CANDIDATS = {
    HOSPITALISATION: ['pHop', 'pCli'], ACCOUCHEMENT: ['pCli'], PHARMACIE: ['pPha'],
    EXAMEN: ['pBio', 'pCli'], IMAGERIE: ['pBio', 'pCli'], CONSULTATION: ['pAmb', 'pCli'],
    DENTAIRES: ['pDen'], OPTIQUE: ['pCli'],
  };
  const tauxDe = (key, type) => {
    const parent = type.split('_')[0] === 'DENTAIRES' ? 'DENTAIRES'
      : (MONTANTS[type] ? (type.startsWith('HOSPITALISATION') ? 'HOSPITALISATION'
        : type.startsWith('ACCOUCHEMENT') ? 'ACCOUCHEMENT' : type.split('_')[0]) : 'CONSULTATION');
    const cfg = SOCIETES.find((c) => c.key === key);
    const b = cfg.baremes.find((x) => x[0] === parent);
    return b ? { taux: b[1], plafond: Number(b[2]) } : { taux: 70, plafond: 500000 };
  };
  // Prestataire utilisable (convention ACTIVE + prestataire ACTIF) pour la société/type
  const prestatairePour = (key, type) => {
    const parent = Object.keys(CANDIDATS).find((p) => type.startsWith(p)) ?? 'CONSULTATION';
    const convActives = new Set((CONVENTIONS[key] ?? []).filter(([, a]) => a).map(([p]) => p));
    for (const pKey of CANDIDATS[parent]) {
      if (convActives.has(pKey) && PRESTATAIRES[pKey].actif) return PRESTATAIRES[pKey];
    }
    return null;
  };
  const hist = (entries) => JSON.stringify(entries.map((e) => ({
    date: e[0], statut: e[1], commentaire: e[2], userId: admin.id,
  })));

  let seqDossier = 101;         // DOS-2026-000101 …
  let seqPaiement = 42;         // PMT-2026-0042 …
  const tims = { id: uAccueil.id, tec: uTechnique.id, cpt: uCompta.id };
  const dossiersParSociete = {}; // clé → liste des dossiers créés
  const dossiersExcel = [];
  const EXCEPTIONS_CONVENTION = new Set(); // numéros tolérés hors convention active
  let nbDossiers = 0;

  for (let m = MOIS_MIN; m <= MOIS_MAX; m++) {
    for (const cfg of SOCIETES) {
      const grille = cfg.grilleStatuts[m] ?? [];
      for (let idx = 0; idx < grille.length; idx++) {
        const statutBrut = grille[idx];
        const reel = statutBrut === 'RECU_CONVENTION_A_VERIFIER' ? 'RECU'
          : statutBrut.startsWith('REJETE_') ? 'REJETE' : statutBrut;
        const r = rng(`${cfg.key}-${m}-${idx}`);

        // Type de prestation (rotation déterministe dans le pool société)
        const type = statutBrut === 'REJETE_GARANTIE_INACTIVE' ? 'OPTIQUE'
          : statutBrut === 'REJETE_PRESTATAIRE_SUSPENDU' ? 'DENTAIRES_PROTHESE'
          : cfg.types[(m - 1 + idx) % cfg.types.length];

        // Assuré (rotation) ou cas d'erreur dédié
        let assure;
        if (statutBrut === 'REJETE_ASSURE_INACTIF') assure = assures.SANLAM_a4;
        else if (statutBrut === 'REJETE_CONTRAT_EXPIRE') assure = assures.JIRAMA_c1;
        else assure = POOL_ASSURES[cfg.key][(m + idx) % POOL_ASSURES[cfg.key].length];

        // Prestataire : cas d'erreur → le prestataire/la convention « cassé(e) »
        let prestataire;
        if (statutBrut === 'REJETE_PRESTATAIRE_SUSPENDU') prestataire = pDen;
        else if (statutBrut === 'REJETE_CONVENTION_INACTIVE' || statutBrut === 'RECU_CONVENTION_A_VERIFIER') prestataire = pCli;
        else prestataire = prestatairePour(cfg.key, type);

        // Montants
        const [min, max, pas] = MONTANTS[type];
        let reclame = min + Math.round(r() * ((max - min) / pas)) * pas;
        const { taux, plafond } = tauxDe(cfg.key, type);
        if (statutBrut === 'REJETE_PLAFOND') reclame = Math.round(plafond * 1.6 / 10000) * 10000;
        const valide = ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(reel)
          ? Math.min(Math.round((reclame * taux) / 100), plafond) : null;
        const tm = valide !== null ? reclame - valide : null;

        // Dates
        const dateReception = jour(m, 3 + Math.floor(r() * 18));
        const dateSoins = addJours(dateReception, -(4 + Math.floor(r() * 10)));
        const num = `DOS-${ANNEE}-${String(seqDossier++).padStart(6, '0')}`;
        const h = [];
        h.push([fmtDate(dateReception), 'RECU', 'Réception du dossier']);
        if (['EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'].includes(reel)) {
          const dtTec = addJours(dateReception, 2 + Math.floor(r() * 2));
          h.push([fmtDate(dtTec), 'EN_ANALYSE', 'Affecté au service technique']);
          if (reel === 'REJETE') {
            h.push([fmtDate(addJours(dtTec, 1)), 'REJETE', MOTIF_REJET[statutBrut] ?? 'Dossier non conforme']);
          } else {
            const dtVal = addJours(dtTec, 1 + Math.floor(r() * 2));
            h.push([fmtDate(dtVal), 'VALIDE', `Validé à ${taux} % (plafond ${plafond.toLocaleString('fr-FR')} Ar)`]);
            if (['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(reel)) {
              const dtDec = addJours(dtVal, 2);
              h.push([fmtDate(dtDec), 'EN_COMPTABILITE', 'Décompte reçu, transmis comptabilité']);
              if (['EN_PAIEMENT', 'PAYE'].includes(reel)) {
                const dtMise = addJours(dtDec, 3);
                h.push([fmtDate(dtMise), 'EN_PAIEMENT', 'Mise en paiement']);
                if (reel === 'PAYE') h.push([fmtDate(addJours(dtMise, 5)), 'PAYE', 'Virement exécuté']);
              }
            }
          }
        }

        const data = {
          numeroDossier: num,
          dateReception,
          societeId: societes[cfg.key].id,
          beneficiaire: assure ? `${assure.prenom} ${assure.nom}` : 'Bénéficiaire non rattaché',
          typeDossier: type,
          categorieDossier: CATEGORIE(type),
          assureId: assure?.id ?? null,
          nSS: assure?.nSS ?? null,
          prestataireId: prestataire?.id ?? null,
          prestataireLegacy: null,
          dateSoins,
          montantReclame: dec(reclame.toFixed(2)),
          montantValide: valide !== null ? dec(valide.toFixed(2)) : null,
          ticketModerateur: tm !== null ? dec(tm.toFixed(2)) : null,
          partPatient: tm !== null ? dec(tm.toFixed(2)) : null,
          partEntreprise: valide !== null ? dec(valide.toFixed(2)) : null,
          statut: reel,
          source: CATEGORIE(type) === 'REGLEMENT_PRESTATAIRE'
            ? (idx % 2 === 0 ? 'ISA' : 'SAGE')
            : (idx % 3 === 0 ? 'EXCEL' : 'MANUEL'),
          historique: hist(h),
          createurId: tims.id,
          gestionnaireAccueilId: gAcc.id,
          gestionnaireTechniqueId: reel === 'RECU' ? null : gTec.id,
          dateTraitementTechnique: reel === 'RECU' ? null : addJours(dateReception, 2),
          gestionnaireComptaId: ['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(reel) ? gCpt.id : null,
        };
        if (reel === 'REJETE') {
          data.motifRejet = MOTIF_REJET[statutBrut] ?? 'Dossier non conforme';
        }
        if (reel === 'PAYE') {
          data.moyenPaiement = 'VIREMENT';
          data.dateReceptionDecompte = addJours(dateReception, 8);
          const dtPaiement = addJours(data.dateReceptionDecompte, 8 + Math.floor(r() * 8));
          data.datePaiement = dtPaiement;
          data.referencePaiement = `PMT-${ANNEE}-${String(seqPaiement++).padStart(4, '0')}`;
          data.montantPaye = dec(valide.toFixed(2));
        }
        if (['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT'].includes(reel)) {
          data.dateReceptionDecompte = addJours(dateReception, 8);
        }
        if (statutBrut === 'RECU_CONVENTION_A_VERIFIER') {
          data.observations = 'Convention prestataire inactive pour cette société : contrôle requis avant validation.';
          EXCEPTIONS_CONVENTION.add(num);
        }
        if (statutBrut === 'REJETE_GARANTIE_INACTIVE') {
          data.observations = 'Garantie OPTIQUE désactivée sur le contrat — cegedim réf. bareme-inactif.';
        }

        const dos = await db.dossier.create({
          data: {
            ...data,
            ...(CATEGORIE(type) === 'REGLEMENT_PRESTATAIRE' && reel !== 'REJETE' && reel !== 'RECU'
              ? { justificatifs: { create: [{ type: 'FACTURE', nomFichier: `facture-${type.toLowerCase()}-${num.slice(-4)}.pdf`, chemin: `/uploads/dossiers/facture-${num.slice(-6)}.pdf`, tailleKo: 180 + Math.floor(r() * 400), uploadedBy: tims.id }] } }
              : {}),
            ...(reel === 'REJETE'
              ? { commentaires: { create: [{ auteurId: uTechnique.id, contenu: data.motifRejet, prive: true }] } }
              : {}),
          },
        });
        (dossiersParSociete[cfg.key] ??= []).push(dos);
        if (data.source === 'EXCEL') dossiersExcel.push(dos);
        nbDossiers++;
      }
    }
  }
  console.log(`  ✅ ${nbDossiers} dossiers créés (chaque société couvre jan → sep)`);

  // ── 7. FINANCES — appels de fonds + budgets utilisés ─────────────────────
  console.log('\n💰 FINANCES');
  let nbAppels = 0;
  for (const cfg of SOCIETES) {
    const ctr = contrats2026[cfg.key];
    for (const [m, j, montant, statut] of cfg.appels) {
      const dateAppel = jour(m, j);
      const regle = statut === 'REGLE';
      await db.appelDeFonds.create({
        data: {
          contratId: ctr.id, montant: dec(montant), dateAppel,
          datePaiement: regle ? addJours(dateAppel, 15 + (m % 3) * 5) : null,
          reference: regle ? `VIR-${cfg.key}-${String(m).padStart(2, '0')}${ANNEE}` : null,
          statut,
          observations: !regle && m >= 7 ? `Appel de fonds du ${String(m).padStart(2, '0')}/${ANNEE} — relance envoyée` : null,
        },
      });
      nbAppels++;
    }
    // budgetUtilise = somme des montants validés (VALIDE → PAYE)
    const agg = await db.dossier.aggregate({
      _sum: { montantValide: true },
      where: { societeId: societes[cfg.key].id, statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] } },
    });
    await db.contrat.update({ where: { id: ctr.id }, data: { budgetUtilise: agg._sum.montantValide ?? 0 } });
  }
  console.log(`  ✅ ${nbAppels} appels de fonds (jan → sep) + budgets utilisés recalculés par société`);

  // ── 8. COURRIELS — 2 par société, étalés sur la période ──────────────────
  console.log('\n📧 COURRIELS');
  let nbCourriels = 0;
  for (const cfg of SOCIETES) {
    const dos = (dossiersParSociete[cfg.key] ?? [])
      .find((d) => d.categorieDossier === 'REGLEMENT_PRESTATAIRE' && ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(d.statut));
    if (dos) {
      await db.courriel.create({
        data: {
          type: 'FACTURE_PRESTATAIRE', expediteur: 'facturation@hopital-principal.mg',
          objet: `Facture ${dos.beneficiaire} — dossier ${dos.numeroDossier}`,
          societeId: societes[cfg.key].id, beneficiaire: dos.beneficiaire,
          montant: dos.montantValide ?? dos.montantReclame,
          dateCourriel: dos.dateReception, dateSoins: dos.dateSoins,
          prestataire: 'Hôpital Principal HJ Anosy', statut: 'TRAITE',
          traitePar: 'accueil@suivisante.mg', dateTraitement: addJours(dos.dateReception, 1),
          dossierId: dos.id,
        },
      });
      nbCourriels++;
    }
    const moisCourriel = { SANLAM: 8, TELMA: 8, JIRAMA: 8, AIRTEL: 7, BNI: 9 }[cfg.key];
    const assure = POOL_ASSURES[cfg.key][0];
    await db.courriel.create({
      data: {
        type: 'DOSSIER_REMBOURSEMENT',
        expediteur: assure?.email ?? `contact.${cfg.key.toLowerCase()}@${cfg.key.toLowerCase()}.mg`,
        objet: `Demande de remboursement ${assure ? assure.prenom + ' ' + assure.nom : ''} — ${String(moisCourriel).padStart(2, '0')}/${ANNEE}`,
        societeId: societes[cfg.key].id,
        beneficiaire: assure ? `${assure.prenom} ${assure.nom}` : null,
        montant: dec(MONTANTS.PHARMACIE[0].toFixed(2)),
        dateCourriel: jour(moisCourriel, 12), dateSoins: jour(moisCourriel, 8),
        prestataire: 'Pharmacie Centrale Anosy', statut: 'RECU',
      },
    });
    nbCourriels++;
  }
  console.log(`  ✅ ${nbCourriels} courriels (1 facture liée à un dossier + 1 demande en attente, par société)`);

  // ── 9. IMPORT EXCEL (traçabilité des dossiers importés) ──────────────────
  if (dossiersExcel.length) {
    const imp = await db.importHistorique.create({
      data: {
        source: 'EXCEL', nomFichier: 'dossiers-societes-2026.xlsx',
        nbLignes: dossiersExcel.length, nbSucces: dossiersExcel.length, nbErreurs: 0,
        rapport: '[]', importePar: admin.email,
      },
    });
    for (let i = 0; i < dossiersExcel.length; i++) {
      await db.importDossier.create({
        data: { importId: imp.id, dossierId: dossiersExcel[i].id, numeroLigne: i + 1, statutImport: 'SUCCES', donnees: '{}' },
      });
    }
    console.log(`  ✅ import historique : ${dossiersExcel.length} dossiers EXCEL tracés`);
  }

  // ── 10. BOT (sessions + messages) ─────────────────────────────────────────
  const maintenant = new Date();
  await db.botSession.create({ data: { expeditieurId: '261341234501', canal: 'WHATSAPP', assureId: assures.SANLAM_a1.id, assureNom: 'Tiana Rasoanaivo', societeId: societes.SANLAM.id, verifieA: maintenant, expiresAt: new Date(maintenant.getTime() + 4 * 3600000) } });
  await db.botSession.create({ data: { expeditieurId: 'tg-511203', canal: 'TELEGRAM', assureId: assures.TELMA_b1.id, assureNom: 'Lova Randrianasolo', societeId: societes.TELMA.id, verifieA: maintenant, expiresAt: new Date(maintenant.getTime() + 4 * 3600000) } });
  await db.botSession.create({ data: { expeditieurId: '261202233445', canal: 'WHATSAPP', assureId: assures.JIRAMA_c1.id, assureNom: 'Pierre Ramiandrisoa', societeId: societes.JIRAMA.id, verifieA: new Date(maintenant.getTime() - 10 * 3600000), expiresAt: new Date(maintenant.getTime() - 6 * 3600000) } }); // EXPIRÉE
  await db.messageBot.create({ data: { canal: 'WHATSAPP', expeditieurId: '261341234501', expeditieurNom: 'Tiana Rasoanaivo', message: 'Où en est mon remboursement de pharmacie ?', reponse: 'Votre dernier dossier est en cours de traitement par le service technique.', lu: false } });
  await db.messageBot.create({ data: { canal: 'TELEGRAM', expeditieurId: 'tg-511203', expeditieurNom: 'Lova Randrianasolo', message: 'Quel est mon plafond hospitalisation ?', reponse: 'Votre garantie hospitalisation couvre 75 % avec un plafond de 4 000 000 Ar.', lu: true } });
  console.log('  ✅ 3 sessions bot (2 valides, 1 expirée) + 2 messages');

  // ── 11. JOURNAL D'AUDIT ───────────────────────────────────────────────────
  for (const cfg of SOCIETES) {
    await db.historiqueParametre.create({ data: { entite: 'Societe', entiteId: societes[cfg.key].id, champ: 'CREATION', nouvelleValeur: cfg.nom, modifiePar: admin.email, modifieParId: admin.id, action: 'CREATION', niveau: 'STANDARD', module: 'Sociétés', objet: cfg.nom, societeId: societes[cfg.key].id, motif: `Jeu de données de test ${ANNEE} — réinitialisation` } });
    await db.historiqueParametre.create({ data: { entite: 'Contrat', entiteId: contrats2026[cfg.key].id, champ: 'CREATION', nouvelleValeur: `CTR-${cfg.key.slice(0, 3)}-${ANNEE}`, modifiePar: admin.email, modifieParId: admin.id, action: 'CREATION', niveau: 'STANDARD', module: 'Contrats', objet: `Contrat ${cfg.nom} ${ANNEE}`, societeId: societes[cfg.key].id, motif: `Jeu de données de test ${ANNEE}` } });
  }
  await db.historiqueParametre.create({ data: { entite: 'PrestataireSociete', entiteId: pCli.id, champ: 'actif', ancienneValeur: 'true', nouvelleValeur: 'false', modifiePar: admin.email, modifieParId: admin.id, action: 'MODIFICATION', niveau: 'STANDARD', module: 'Prestataire/Société', objet: 'Convention Clinique Sainte Marie ↔ AIRTEL désactivée', societeId: societes.AIRTEL.id, motif: 'Cas d\u2019erreur du jeu de test' } });
  await db.historiqueParametre.create({ data: { entite: 'Assure', entiteId: assures.SANLAM_a4.id, champ: 'actif', ancienneValeur: 'true', nouvelleValeur: 'false', modifiePar: admin.email, modifieParId: admin.id, action: 'MODIFICATION', niveau: 'SENSIBLE', module: 'Assurés', objet: 'Radiation Nirina Rakotoarimanana (SANLAM)', societeId: societes.SANLAM.id, motif: 'Cas d\u2019erreur du jeu de test' } });
  console.log('  ✅ 12 entrées d\u2019audit (créations sociétés/contrats + 2 modifications)');

  // ── 12. VÉRIFICATIONS INTÉGRÉES (échec = abort) ──────────────────────────
  console.log('\n🔍 VÉRIFICATIONS INTÉGRÉES');
  const checks = [];
  const chk = (libelle, ok) => { checks.push([libelle, ok]); console.log(`  ${ok ? '✅' : '❌'} ${libelle}`); };

  chk('5 sociétés', (await db.societe.count()) === 5);
  chk(`${nbDossiers} dossiers`, (await db.dossier.count()) === nbDossiers);
  chk('20 assurés', (await db.assure.count()) === 20);
  chk('6 prestataires', (await db.prestataire.count()) === 6);
  chk('7 contrats (5 actifs 2026 + 2 expirés 2025)', (await db.contrat.count()) === 7);
  for (const cfg of SOCIETES) {
    const doss = dossiersParSociete[cfg.key] ?? [];
    const moisCouverts = new Set(doss.map((d) => d.dateReception.getUTCMonth() + 1));
    chk(`${cfg.nom} : dossiers de janv → sept (9/9 mois)`, moisMinMax(moisCouverts));
    chk(`${cfg.nom} : tous statuts métier couverts`, new Set(doss.map((d) => d.statut)).size === 7);
  }
  // chaîne Société → Assuré → Dossier cohérente
  const incoherents = await db.dossier.findMany({ where: { assureId: { not: null } }, include: { assure: true } });
  chk('chaîne Société→Assuré cohérente sur tous les dossiers', incoherents.every((d) => d.assure.societeId === d.societeId));
  // convention prestataire active (hors dossiers rejetés et exception explicite)
  const avecPresta = await db.dossier.findMany({ where: { prestataireId: { not: null }, statut: { not: 'REJETE' } } });
  const convs = await db.prestataireSociete.findMany();
  const prestaMap = new Map(convs.map((c) => [`${c.prestataireId}|${c.societeId}`, c.actif]));
  chk('prestataire conventionné ACTIF sur les dossiers non rejetés', avecPresta.every((d) => {
    if (EXCEPTIONS_CONVENTION.has(d.numeroDossier)) return true;
    const c = prestaMap.get(`${d.prestataireId}|${d.societeId}`);
    return c === true;
  }));
  // cohérence financière des dossiers
  const dossValides = await db.dossier.findMany({ where: { statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] } } });
  chk('montantValide ≤ montantReclame et partPatient + partEntreprise = montantReclame', dossValides.every((d) => {
    const rec = d.montantReclame.toNumber(), val = d.montantValide.toNumber();
    return val <= rec && d.partPatient.toNumber() + d.partEntreprise.toNumber() === rec;
  }));
  const dossPaye = await db.dossier.findMany({ where: { statut: 'PAYE' } });
  chk('dossiers PAYE : date + référence + montant de paiement présents', dossPaye.every((d) => d.datePaiement && d.referencePaiement && d.montantPaye));
  const dossRejetes = await db.dossier.findMany({ where: { statut: 'REJETE' } });
  chk('dossiers REJETE : motif renseigné', dossRejetes.every((d) => !!d.motifRejet));
  // budgets
  for (const cfg of SOCIETES) {
    const ctr = await db.contrat.findUnique({ where: { id: contrats2026[cfg.key].id } });
    const agg = await db.dossier.aggregate({ _sum: { montantValide: true }, where: { societeId: ctr.societeId, statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] } } });
    chk(`${cfg.nom} : budgetUtilise = somme des montants validés`, ctr.budgetUtilise.toNumber() === (agg._sum.montantValide?.toNumber() ?? 0));
  }
  // liaison e-mail : les 3 sources (boucle séquentielle — .every() est synchrone)
  let source1Ok = true;
  for (const k of fichesParSource.CONTACT) {
    const fiche = await db.entrepriseContact.findFirst({ where: { email: { equals: societes[k].emailContactPrincipal, mode: 'insensitive' } } });
    if (!fiche) source1Ok = false;
  }
  chk('source 1 (EntrepriseContact) : SANLAM + AIRTEL + BNI', source1Ok && fichesParSource.CONTACT.length === 3);
  chk('source 2 (emailContactPrincipal) : TELMA', !!(await db.societe.findFirst({ where: { emailContactPrincipal: { equals: 'contact.telma@telma.mg', mode: 'insensitive' } } })));
  chk('source 3 (Societe.email) : JIRAMA', !!(await db.societe.findFirst({ where: { email: { equals: 'j.rakotoarison@jirama.mg', mode: 'insensitive' } } })));
  // comptes
  chk('5 comptes CONTACT_ENTREPRISE actifs (1 par société)', (await db.utilisateur.count({ where: { email: { in: ['contact.sanlam@sanlam.mg', 'contact.telma@telma.mg', 'contact.airtel@airtel.mg', 'contact.bni@bni.mg', 'j.rakotoarison@jirama.mg'] }, role: 'CONTACT_ENTREPRISE', actif: true } })) === 5);
  chk('2 comptes PORTAIL_CLIENT de démo actifs (+ compte réel conservé)', (await db.utilisateur.count({ where: { email: { in: ['portail.sanlam@suivisante.mg', 'portail.telma@suivisante.mg'] }, role: 'PORTAIL_CLIENT', actif: true } })) === 2);
  for (const e of EMAILS_A_CONSERVER) {
    const pref = e.split('@')[0] + '@';
    chk(`compte conservé : ${e}`, (await db.utilisateur.count({ where: { email: { startsWith: pref, mode: 'insensitive' } } })) >= 1);
  }
  // anciens dossiers disparus
  chk('aucun ancien dossier (DOS-2026-000001..000100)', (await db.dossier.count({ where: { numeroDossier: { in: Array.from({ length: 100 }, (_, i) => `DOS-2026-${String(i + 1).padStart(6, '0')}`) } } })) === 0);
  // référentiels
  chk('référentiel gestionnaires ≥ 3 services', (await db.gestionnaire.groupBy({ by: ['service'] })).length >= 3);
  // appels de fonds : ≥ 3 par société, mois distincts
  for (const cfg of SOCIETES) {
    const appels = await db.appelDeFonds.findMany({ where: { contratId: contrats2026[cfg.key].id } });
    const mois = new Set(appels.map((a) => a.dateAppel.getUTCMonth() + 1));
    chk(`${cfg.nom} : ${appels.length} appels de fonds sur ${mois.size} mois distincts`, appels.length >= 3 && mois.size >= 3);
  }
  // courriels par société
  for (const cfg of SOCIETES) {
    const n = await db.courriel.count({ where: { societeId: societes[cfg.key].id } });
    chk(`${cfg.nom} : ${n} courriels (≥ 2)`, n >= 2);
  }
  // bot
  chk('3 sessions bot (dont 1 expirée)', (await db.botSession.count()) === 3);

  const echecs = checks.filter(([, ok]) => !ok);
  if (echecs.length) throw new Error(`${echecs.length} vérification(s) en échec : ${echecs.map(([l]) => l).join(' | ')}`);

  console.log('\n🔑 IDENTIFIANTS DE TEST (comptes créés) :');
  console.log('  internes (mdp SuiviSante@2026) : accueil@ / technique@ / compta@ / sante@suivisante.mg');
  console.log('  externes (mdp Contact@2026)    : contact.sanlam@sanlam.mg | contact.telma@telma.mg | contact.airtel@airtel.mg | contact.bni@bni.mg | j.rakotoarison@jirama.mg | portail.sanlam@ + portail.telma@suivisante.mg');
  console.log('\n🆔 IDS CLÉS (tests isolation — 1 ancre par société) :');
  for (const cfg of SOCIETES) {
    const doss = (dossiersParSociete[cfg.key] ?? [])[0];
    console.log(`  ${cfg.key.padEnd(7)} soc=${societes[cfg.key].id} contrat=${contrats2026[cfg.key].id} dossier=${doss?.id ?? '—'} (${doss?.numeroDossier ?? '—'})`);
  }
  console.log('\n🎉 RÉINITIALISATION TERMINÉE AVEC SUCCÈS');
}

function moisMinMax(moisCouverts) {
  for (let m = 1; m <= 9; m++) if (!moisCouverts.has(m)) return false;
  return true;
}

main()
  .catch((e) => { console.error('\n❌ ÉCHEC :', e); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
