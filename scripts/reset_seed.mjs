// ─── Réinitialisation des données de test — Suivi-Santé ────────────────────
// Purge des données métier obsolètes (ordre FK) puis injection d'un nouveau
// jeu de test cohérent couvrant les parcours métier et les cas d'erreur.
//
// CONSERVÉS   : référentiels (Gestionnaire, ConfigurationEmail, RateLimitCounter,
//               HistoriqueParametre) + comptes réels (admin + 2 comptes personnels)
// SUPPRIMÉS   : sociétés/contrats/assurés/prestataires/dossiers/finances/courriels
//               de démonstration + 3 comptes démo internes (recréés ensuite)
//
// Usage : node scripts/reset_seed.mjs   (DATABASE_URL requise)
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
];

const D = (s) => new Date(s);
const dec = (s) => s; // Prisma accepte les strings pour Decimal(18,2)

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
}

async function main() {
  console.log('🌱 RÉINITIALISATION DU JEU DE DONNÉES DE TEST — Suivi-Santé\n');
  await purge();

  const pwdInt = await hash(PWD_INTERNE, 12);
  const pwdExt = await hash(PWD_EXTERNE, 12);
  const admin = await db.utilisateur.findUnique({ where: { email: 'admin@suivisante.mg' } });
  if (!admin) throw new Error('Compte admin@suivisante.mg introuvable — abort.');

  // ── 1. Utilisateurs internes + externes ─────────────────────────────────
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

  // ── 2. Sociétés (5) — couverture des 3 sources de liaison e-mail ────────
  console.log('\n🏢 SOCIÉTÉS (5) — sources de liaison : CONTACT / SOCIETE_PRINCIPAL / SOCIETE_EMAIL');
  const sanlam = await db.societe.create({ data: {
    nom: 'SANLAM MADAGASCAR ASSURANCE',
    adresse: 'Immeuble Fiaro, Ankorondrano, Antananarivo',
    telephone: '+261 34 12 345 67', nif: '3000123456',
    email: 'contact@sanlam.mg',
    contactPrincipal: 'Hery Rakotomalala',          // NOM SEUL du contact principal
    emailContactPrincipal: 'contact.sanlam@sanlam.mg', // e-mail dans le champ DÉDIÉ
  }});
  const telma = await db.societe.create({ data: {
    nom: 'TELMA MADAGASCAR',
    adresse: 'Ankorondrano, Antananarivo', telephone: '+261 33 11 222 33',
    nif: '3000223344',
    contactPrincipal: 'Voahangy Ravelomanana',
    emailContactPrincipal: 'contact.telma@telma.mg', // source 2 uniquement (pas de fiche contact)
  }});
  const jirama = await db.societe.create({ data: {
    nom: 'JIRAMA',
    adresse: 'Rue Rainitovo, Antsahavola, Antananarivo', telephone: '+261 20 22 333 44',
    nif: '3000334455',
    email: 'j.rakotoarison@jirama.mg',               // source 3 uniquement (flux historique)
    contactPrincipal: 'Jean-Claude Rakotoarison',
  }});
  const airtel = await db.societe.create({ data: {
    nom: 'AIRTEL MADAGASCAR',
    adresse: 'Immeuble Sky Media, Ambohimiangara, Antananarivo', telephone: '+261 33 22 111 00',
    nif: '3000445566',
    contactPrincipal: 'Fenosoa Andriamampionona',
    emailContactPrincipal: 'contact.airtel@airtel.mg',
  }});
  const bni = await db.societe.create({ data: {
    nom: 'BNI MADAGASCAR',
    adresse: 'Avenue Philibert Tsiranana, Antananarivo', telephone: '+261 32 45 678 90',
    nif: '3000556677',
    contactPrincipal: 'Tojo Randrianarivelo',
    emailContactPrincipal: 'contact.bni@bni.mg',
  }});
  console.log('  ✅ 5 sociétés créées (contactPrincipal = nom seul, e-mail dans le champ dédié)');

  // Fiches contact (source 1) — SANLAM, AIRTEL, BNI (TELMA/JIRAMA volontairement sans)
  await db.entrepriseContact.create({ data: {
    societeId: sanlam.id, nom: 'Rakotomalala', prenom: 'Hery',
    fonction: 'Responsable RH', telephone: '+261 34 12 345 68',
    email: 'contact.sanlam@sanlam.mg',
  }});
  await db.entrepriseContact.create({ data: {
    societeId: airtel.id, nom: 'Andriamampionona', prenom: 'Fenosoa',
    fonction: 'Directrice des Ressources Humaines', telephone: '+261 33 22 111 01',
    email: 'contact.airtel@airtel.mg',
  }});
  await db.entrepriseContact.create({ data: {
    societeId: bni.id, nom: 'Randrianarivelo', prenom: 'Tojo',
    fonction: 'Responsable Paie & Avantages', telephone: '+261 32 45 678 91',
    email: 'contact.bni@bni.mg',
  }});
  console.log('  ✅ 3 fiches EntrepriseContact (SANLAM / AIRTEL / BNI)');

  // Comptes externes rattachés à leur société par e-mail (résolu au login)
  await upUtil('contact.sanlam@sanlam.mg', 'Hery Rakotomalala', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('contact.telma@telma.mg', 'Voahangy Ravelomanana', 'CONTACT_ENTREPRISE', pwdExt);
  await upUtil('portail.sanlam@suivisante.mg', 'Tiana Rasoanaivo', 'PORTAIL_CLIENT', pwdExt);
  console.log('  ✅ 2 comptes CONTACT_ENTREPRISE + 1 PORTAIL_CLIENT (liaison par e-mail)');

  // ── 3. Garanties / Barèmes par société ──────────────────────────────────
  console.log('\n📊 GARANTIES (BAREMES)');
  const B_SANLAM = [
    ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 80, '5000000.00'],
    ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00'],
    ['ACCOUCHEMENT', 85, '3000000.00'], ['IMAGERIE', 70, '400000.00'],
    ['DENTAIRES', 60, '300000.00'],
    ['OPTIQUE', 50, '250000.00', false], // garantie INACTIVE — cas d'erreur
  ];
  const B_TELMA = [
    ['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 75, '4000000.00'],
    ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00'],
    ['ACCOUCHEMENT', 85, '3000000.00'], ['IMAGERIE', 70, '400000.00'],
  ];
  const B_JIRAMA = [['CONSULTATION', 70, '100000.00'], ['PHARMACIE', 60, '200000.00'], ['HOSPITALISATION', 75, '4000000.00']];
  const B_AIRTEL = [['CONSULTATION', 70, '100000.00'], ['HOSPITALISATION', 80, '5000000.00'], ['PHARMACIE', 60, '200000.00'], ['EXAMEN', 75, '500000.00']];
  let nbBaremes = 0;
  for (const [soc, liste] of [[sanlam, B_SANLAM], [telma, B_TELMA], [jirama, B_JIRAMA], [airtel, B_AIRTEL]]) {
    for (const [p, taux, plafond, actif = true] of liste) {
      await db.bareme.create({ data: { societeId: soc.id, prestation: p, tauxCouverture: taux, plafond: dec(plafond), active: actif } });
      nbBaremes++;
    }
  }
  console.log(`  ✅ ${nbBaremes} barèmes (dont 1 inactif : SANLAM/OPTIQUE)`);

  // ── 4. Contrats (actifs / expiré / suspendu) ────────────────────────────
  console.log('\n📜 CONTRATS');
  const ctrSan26 = await db.contrat.create({ data: { societeId: sanlam.id, reference: 'CTR-SAN-2026', budgetAnnuel: dec('120000000.00'), dateDebut: D('2026-01-01'), dateFin: D('2026-12-31'), statut: 'ACTIF' }});
  const ctrSan25 = await db.contrat.create({ data: { societeId: sanlam.id, reference: 'CTR-SAN-2025', budgetAnnuel: dec('100000000.00'), dateDebut: D('2025-01-01'), dateFin: D('2025-12-31'), statut: 'EXPIRE' }});
  const ctrTel26 = await db.contrat.create({ data: { societeId: telma.id, reference: 'CTR-TEL-2026', budgetAnnuel: dec('85000000.00'), dateDebut: D('2026-01-01'), dateFin: D('2026-12-31'), statut: 'ACTIF' }});
  const ctrJir25 = await db.contrat.create({ data: { societeId: jirama.id, reference: 'CTR-JIR-2025', budgetAnnuel: dec('40000000.00'), dateDebut: D('2025-01-01'), dateFin: D('2025-12-31'), statut: 'EXPIRE' }});
  const ctrAir26 = await db.contrat.create({ data: { societeId: airtel.id, reference: 'CTR-AIR-2026', budgetAnnuel: dec('60000000.00'), dateDebut: D('2026-01-01'), dateFin: D('2026-12-31'), statut: 'SUSPENDU' }});
  console.log('  ✅ 5 contrats : 2 ACTIF, 1 EXPIRE (SANLAM 2025), 1 EXPIRE (JIRAMA), 1 SUSPENDU (AIRTEL)');

  // ── 5. Assurés (principaux + ayants droit + 1 inactif) ──────────────────
  console.log('\n🧑‍💼 ASSURÉS');
  const A = (s, nom, prenom, nss, mat, type, opts = {}) => db.assure.create({ data: {
    societeId: s.id, nom, prenom, nSS: nss, matricule: mat, typeBeneficiaire: type,
    dateNaissance: opts.naissance ? D(opts.naissance) : null,
    sexe: opts.sexe ?? null, dateEffet: opts.effet ? D(opts.effet) : null,
    bareme: opts.coeff ?? 1.0, telephone: opts.tel ?? null, email: opts.email ?? null,
    adresse: opts.adresse ?? null, actif: opts.actif ?? true,
    assurePrincipalId: opts.principal ?? null, codeFamille: opts.famille ?? null,
  }});
  const a1 = await A(sanlam, 'Rasoanaivo', 'Tiana', 'SS-401257', 'MAT-SAN-0001', 'ASSURE', { naissance: '1988-05-14', sexe: 'F', effet: '2026-01-01', tel: '+261 34 55 001 01', email: 'portail.sanlam@suivisante.mg', adresse: 'Lot II M 45 Antanimena' });
  const a2 = await A(sanlam, 'Rakotomalala', 'Faniry', 'SS-402118', 'MAT-SAN-0002', 'ASSURE', { naissance: '1982-11-02', sexe: 'M', effet: '2026-01-01', tel: '+261 34 55 002 02' });
  const a3 = await A(sanlam, 'Andrianjaka', 'Mialy', 'SS-403322', 'MAT-SAN-0003', 'ASSURE', { naissance: '1990-03-27', sexe: 'F', effet: '2026-02-01' });
  const a4 = await A(sanlam, 'Rakotoarimanana', 'Nirina', 'SS-404477', 'MAT-SAN-0004', 'ASSURE', { naissance: '1979-08-19', sexe: 'M', effet: '2026-01-01', actif: false }); // INACTIF — cas d'erreur
  const ad1 = await A(sanlam, 'Rakotomalala', 'Rasoa', 'SS-402119', 'MAT-SAN-0002-C1', 'CONJOINT', { naissance: '1985-06-11', sexe: 'F', effet: '2026-01-01', principal: a2.id, famille: 'FAM-SAN-001', coeff: 0.75 });
  const ad2 = await A(sanlam, 'Rakotomalala', 'Tsiky', 'SS-402120', 'MAT-SAN-0002-C2', 'ENFANT', { naissance: '2015-09-30', sexe: 'F', effet: '2026-01-01', principal: a2.id, famille: 'FAM-SAN-001', coeff: 0.5 });
  const b1 = await A(telma, 'Randrianasolo', 'Lova', 'SS-511203', 'MAT-TEL-0001', 'ASSURE', { naissance: '1991-01-25', sexe: 'F', effet: '2026-01-01', tel: '+261 34 90 111 22', email: 'lova.randrianasolo@telma.mg' });
  const b2 = await A(telma, 'Andriamampianina', 'Tojo', 'SS-512388', 'MAT-TEL-0002', 'ASSURE', { naissance: '1986-07-08', sexe: 'M', effet: '2026-01-01' });
  const b3 = await A(telma, 'Ratsimba', 'Hanta', 'SS-513441', 'MAT-TEL-0003', 'ASSURE', { naissance: '1993-12-03', sexe: 'F', effet: '2026-03-01' });
  const bd1 = await A(telma, 'Andriamampianina', 'Njaka', 'SS-512389', 'MAT-TEL-0002-C1', 'ENFANT', { naissance: '2017-02-14', sexe: 'M', effet: '2026-01-01', principal: b2.id, famille: 'FAM-TEL-001', coeff: 0.5 });
  const c1 = await A(jirama, 'Ramiandrisoa', 'Pierre', 'SS-601945', 'MAT-JIR-0001', 'ASSURE', { naissance: '1980-04-09', sexe: 'M', effet: '2025-01-01' });
  const c2 = await A(jirama, 'Rakotoarisoa', 'Aline', 'SS-602557', 'MAT-JIR-0002', 'ASSURE', { naissance: '1987-10-21', sexe: 'F', effet: '2025-01-01' });
  const d1 = await A(airtel, 'Mananjara', 'Sitraka', 'SS-701833', 'MAT-AIR-0001', 'ASSURE', { naissance: '1992-06-16', sexe: 'M', effet: '2026-01-01' });
  console.log('  ✅ 13 assurés : 9 principaux, 3 ayants droit (CONJOINT/ENFANT), 1 inactif');

  // ── 6. Prestataires + conventions par société ───────────────────────────
  console.log('\n🏥 PRESTATAIRES');
  const P = (nom, type, tel, email, adr, nif, actif = true, rib = null) => db.prestataire.create({ data: { nom, type, telephone: tel, email, adresse: adr, nif, actif, statut: actif ? 'CONVENTIONNE' : 'SUSPENDU', rib } });
  const pHop = await P('Hôpital Principal HJ Anosy', 'HOPITAL', '020 22 345 67', 'facturation@hopital-principal.mg', 'Avenue de la Libération, Anosy, Antananarivo', '4002345678', true, '000 12345 67890 12 3');
  const pCli = await P('Clinique Sainte Marie', 'CLINIQUE', '032 12 345 67', 'contact@clinique-saintemarie.mg', 'Lot VJ 34 Antanimena, Antananarivo', '4001234567', true, '000 23456 78901 23 4');
  const pPha = await P('Pharmacie Centrale Anosy', 'PHARMACIE', '020 22 456 78', 'commande@pharmacie-centrale.mg', 'Place Behorizy, Antananarivo', '4004567890');
  const pBio = await P('Laboratoire BioMad', 'LABORATOIRE', '020 22 567 89', 'lab@biomad.mg', 'Isotry, Antananarivo', '4006789012');
  const pDen = await P('Cabinet Dentaire Blanc', 'DENTAIRE', '033 67 890 12', 'blanc.dental@gmail.com', 'Analakely, Antananarivo', '4005678901', false); // INACTIF — cas d'erreur
  const pAmb = await P('Centre Médical Ambatobe', 'CABINET_MEDICAL', '034 56 789 01', 'rdv@cm-ambatobe.mg', 'Ambatobe, Antananarivo', '4003456789');
  const PS = (p, s, actif = true) => db.prestataireSociete.create({ data: { prestataireId: p.id, societeId: s.id, actif } });
  await PS(pHop, sanlam); await PS(pHop, telma); await PS(pHop, jirama);
  await PS(pCli, sanlam); await PS(pCli, telma); await PS(pCli, airtel, false); // convention INACTIVE — cas d'erreur
  await PS(pPha, sanlam); await PS(pPha, telma);
  await PS(pBio, sanlam);
  await PS(pDen, sanlam); // prestataire inactif + convention active → double cas d'erreur
  await PS(pAmb, telma);
  console.log('  ✅ 6 prestataires (1 inactif) + 11 conventions (1 inactive : Clinique↔AIRTEL)');

  // ── 7. Dossiers — les 7 statuts + 2 catégories + cas d'erreur ───────────
  console.log('\n📁 DOSSIERS (15)');
  const gest = await db.gestionnaire.findMany();
  const gAcc = gest.find((g) => g.service === 'ACCUEIL');
  const gTec = gest.find((g) => g.service === 'TECHNIQUE');
  const gCpt = gest.find((g) => g.service === 'COMPTABILITE');
  const hist = (entries) => JSON.stringify(entries.map((e) => ({ date: e[0], statut: e[1], commentaire: e[2], userId: admin.id })));

  const DOS = async (o) => db.dossier.create({ data: o });
  const dos1 = await DOS({ numeroDossier: 'DOS-2026-000101', dateReception: D('2026-06-05'), societeId: sanlam.id, beneficiaire: 'Tiana Rasoanaivo', typeDossier: 'PHARMACIE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a1.id, nSS: a1.nSS, prestataireId: pPha.id, dateSoins: D('2026-06-02'), montantReclame: dec('145500.00'), statut: 'RECU', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, observations: 'Achats de médicaments sur ordonnance, antécédent HTA.' });
  const dos2 = await DOS({ numeroDossier: 'DOS-2026-000102', dateReception: D('2026-05-28'), societeId: sanlam.id, beneficiaire: 'Faniry Rakotomalala', typeDossier: 'CONSULTATION_SPECIALISE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a2.id, nSS: a2.nSS, prestataireId: pHop.id, dateSoins: D('2026-05-25'), montantReclame: dec('86000.00'), statut: 'EN_ANALYSE', source: 'EXCEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, dateTraitementTechnique: D('2026-05-29'), justificatifs: { create: [{ type: 'FACTURE', nomFichier: 'facture-hp-2026-0412.pdf', chemin: '/uploads/dossiers/facture-hp-2026-0412.pdf', tailleKo: 245.3, uploadedBy: uAccueil.id }] } });
  const dos3 = await DOS({ numeroDossier: 'DOS-2026-000103', dateReception: D('2026-04-14'), societeId: sanlam.id, beneficiaire: 'Mialy Andrianjaka', typeDossier: 'EXAMEN', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a3.id, nSS: a3.nSS, prestataireId: pBio.id, dateSoins: D('2026-04-10'), montantReclame: dec('320000.00'), montantValide: dec('240000.00'), ticketModerateur: dec('80000.00'), partPatient: dec('80000.00'), partEntreprise: dec('240000.00'), statut: 'VALIDE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-04-16'), historique: hist([['2026-04-14T08:30:00Z', 'RECU', 'Réception du dossier'], ['2026-04-16T10:05:00Z', 'EN_ANALYSE', 'Affecté au service technique'], ['2026-04-16T15:40:00Z', 'VALIDE', 'Montant validé : barème laboratoire 75 %']]), commentaires: { create: [{ auteurId: uTechnique.id, contenu: 'Montant validé après contrôle du barème laboratoire (75 %). Plafond non atteint.', prive: false }] } });
  const dos4 = await DOS({ numeroDossier: 'DOS-2026-000104', dateReception: D('2026-05-02'), societeId: sanlam.id, beneficiaire: 'Tiana Rasoanaivo', typeDossier: 'HOSPITALISATION_MEDICAL', categorieDossier: 'REGLEMENT_PRESTATAIRE', assureId: a1.id, nSS: a1.nSS, prestataireId: pHop.id, dateSoins: D('2026-04-20'), montantReclame: dec('4250000.00'), montantValide: dec('3400000.00'), ticketModerateur: dec('850000.00'), partPatient: dec('850000.00'), partEntreprise: dec('3400000.00'), statut: 'VALIDE', source: 'ISA', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-05-06'), historique: hist([['2026-05-02T09:00:00Z', 'RECU', 'Facture prestataire transmise'], ['2026-05-06T11:20:00Z', 'EN_ANALYSE', 'Contrat et garanties vérifiés'], ['2026-05-06T16:00:00Z', 'VALIDE', 'Hospitalisation médicale : 80 % plafonné à 5 000 000 Ar']]) });
  const dos5 = await DOS({ numeroDossier: 'DOS-2026-000105', dateReception: D('2026-03-18'), societeId: sanlam.id, beneficiaire: 'Rasoa Rakotomalala', typeDossier: 'ACCOUCHEMENT_NORMAL', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: ad1.id, nSS: ad1.nSS, prestataireId: pCli.id, dateSoins: D('2026-03-12'), montantReclame: dec('2890000.00'), montantValide: dec('2456500.00'), ticketModerateur: dec('433500.00'), partPatient: dec('433500.00'), partEntreprise: dec('2456500.00'), statut: 'EN_COMPTABILITE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-03-20'), dateReceptionDecompte: D('2026-03-25'), historique: hist([['2026-03-18T08:45:00Z', 'RECU', 'Décompte accouchement'], ['2026-03-20T14:10:00Z', 'EN_ANALYSE', 'Vérification famille'], ['2026-03-22T09:30:00Z', 'VALIDE', 'Validé à 85 %'], ['2026-03-25T10:00:00Z', 'EN_COMPTABILITE', 'Décompte reçu, transmis comptabilité']]), commentaires: { create: [{ auteurId: uAccueil.id, contenu: 'Décompte accouchement reçu complet (séjour + honoraires anesthésiste).', prive: false }] } });
  const dos6 = await DOS({ numeroDossier: 'DOS-2026-000106', dateReception: D('2026-06-08'), societeId: sanlam.id, beneficiaire: 'Mialy Andrianjaka', typeDossier: 'HOSPITALISATION_CHIRURGICAL', categorieDossier: 'REGLEMENT_PRESTATAIRE', assureId: a3.id, nSS: a3.nSS, prestataireId: pCli.id, dateSoins: D('2026-05-28'), montantReclame: dec('7800000.00'), montantValide: dec('5000000.00'), ticketModerateur: dec('2800000.00'), partPatient: dec('2800000.00'), partEntreprise: dec('5000000.00'), statut: 'EN_PAIEMENT', source: 'SAGE', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, gestionnaireComptaId: gCpt.id, dateTraitementTechnique: D('2026-06-10'), dateReceptionDecompte: D('2026-06-12'), observations: 'Plafond hospitalisation atteint (5 000 000 Ar) : validation plafonnée.', historique: hist([['2026-06-08T08:15:00Z', 'RECU', 'Chirurgie — facture complète'], ['2026-06-10T13:25:00Z', 'EN_ANALYSE', 'Pièce chirurgicale à justifier'], ['2026-06-11T09:50:00Z', 'VALIDE', 'Validation plafonnée au barème'], ['2026-06-12T15:00:00Z', 'EN_COMPTABILITE', 'Décompte reçu'], ['2026-06-13T11:30:00Z', 'EN_PAIEMENT', 'Mise en paiement']]) });
  const dos7 = await DOS({ numeroDossier: 'DOS-2026-000107', dateReception: D('2026-05-05'), societeId: sanlam.id, beneficiaire: 'Faniry Rakotomalala', typeDossier: 'PHARMACIE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a2.id, nSS: a2.nSS, prestataireId: pPha.id, dateSoins: D('2026-04-30'), montantReclame: dec('98400.00'), montantValide: dec('59040.00'), ticketModerateur: dec('39360.00'), partPatient: dec('39360.00'), partEntreprise: dec('59040.00'), statut: 'PAYE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, gestionnaireComptaId: gCpt.id, moyenPaiement: 'VIREMENT', dateTraitementTechnique: D('2026-05-07'), dateReceptionDecompte: D('2026-05-08'), datePaiement: D('2026-05-20'), referencePaiement: 'PMT-2026-0042', montantPaye: dec('59040.00'), historique: hist([['2026-05-05T10:00:00Z', 'RECU', 'Réception'], ['2026-05-07T09:00:00Z', 'EN_ANALYSE', 'Analyse'], ['2026-05-07T14:30:00Z', 'VALIDE', '60 % validé'], ['2026-05-08T08:20:00Z', 'EN_COMPTABILITE', 'Décompte reçu'], ['2026-05-15T10:10:00Z', 'EN_PAIEMENT', 'Mise en paiement'], ['2026-05-20T16:45:00Z', 'PAYE', 'Virement PMT-2026-0042']]) });
  const dos8 = await DOS({ numeroDossier: 'DOS-2026-000108', dateReception: D('2026-02-11'), societeId: sanlam.id, beneficiaire: 'Nirina Rakotoarimanana', typeDossier: 'HOSPITALISATION_MEDICAL', categorieDossier: 'REGLEMENT_PRESTATAIRE', assureId: a4.id, nSS: a4.nSS, prestataireId: pHop.id, dateSoins: D('2026-01-28'), montantReclame: dec('5600000.00'), montantValide: dec('4480000.00'), ticketModerateur: dec('1120000.00'), partPatient: dec('1120000.00'), partEntreprise: dec('4480000.00'), statut: 'PAYE', source: 'ISA', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, gestionnaireComptaId: gCpt.id, moyenPaiement: 'VIREMENT', dateTraitementTechnique: D('2026-02-13'), dateReceptionDecompte: D('2026-02-14'), datePaiement: D('2026-02-27'), referencePaiement: 'PMT-2026-0038', montantPaye: dec('4480000.00'), historique: hist([['2026-02-11T08:00:00Z', 'RECU', 'Hospitalisation janvier'], ['2026-02-13T10:40:00Z', 'EN_ANALYSE', 'Séjust 12 jours vérifié'], ['2026-02-13T15:00:00Z', 'VALIDE', '80 % validé'], ['2026-02-14T09:00:00Z', 'EN_COMPTABILITE', 'Décompte reçu'], ['2026-02-20T14:00:00Z', 'EN_PAIEMENT', 'Mise en paiement'], ['2026-02-27T11:15:00Z', 'PAYE', 'Virement PMT-2026-0038']]) });
  const dos9 = await DOS({ numeroDossier: 'DOS-2026-000109', dateReception: D('2026-05-30'), societeId: sanlam.id, beneficiaire: 'Faniry Rakotomalala', typeDossier: 'DENTAIRES_PROTHESE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a2.id, nSS: a2.nSS, prestataireId: pDen.id, dateSoins: D('2026-05-22'), montantReclame: dec('210000.00'), statut: 'REJETE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-06-01'), motifRejet: 'Prestataire suspendu (convention inactive) au moment des soins', historique: hist([['2026-05-30T08:50:00Z', 'RECU', 'Prothèse dentaire'], ['2026-06-01T10:30:00Z', 'EN_ANALYSE', 'Contrôle convention'], ['2026-06-01T16:20:00Z', 'REJETE', 'Prestataire suspendu au moment des soins']]), commentaires: { create: [{ auteurId: uTechnique.id, contenu: 'Convention dentaire suspendue depuis mai 2026 — informer la société avant réouverture.', prive: true }] } });
  const dos10 = await DOS({ numeroDossier: 'DOS-2026-000110', dateReception: D('2026-06-14'), societeId: sanlam.id, beneficiaire: 'Nirina Rakotoarimanana', typeDossier: 'CONSULTATION_SIMPLE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: a4.id, nSS: a4.nSS, prestataireId: pCli.id, dateSoins: D('2026-06-10'), montantReclame: dec('65000.00'), statut: 'REJETE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-06-15'), motifRejet: "Assuré inactif : couverture résiliée avant la date de soins", historique: hist([['2026-06-14T09:10:00Z', 'RECU', 'Consultation générale'], ['2026-06-15T11:00:00Z', 'EN_ANALYSE', 'Statut assuré : inactif'], ['2026-06-15T11:05:00Z', 'REJETE', 'Assuré résilié avant la date de soins']]) });
  const dos11 = await DOS({ numeroDossier: 'DOS-2026-000111', dateReception: D('2026-06-20'), societeId: telma.id, beneficiaire: 'Lova Randrianasolo', typeDossier: 'CONSULTATION_SIMPLE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: b1.id, nSS: b1.nSS, prestataireId: pAmb.id, dateSoins: D('2026-06-17'), montantReclame: dec('74000.00'), statut: 'EN_ANALYSE', source: 'EXCEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, dateTraitementTechnique: D('2026-06-21'), justificatifs: { create: [{ type: 'DECOMPTE', nomFichier: 'decompte-ambatobe-0617.pdf', chemin: '/uploads/dossiers/decompte-ambatobe-0617.pdf', tailleKo: 512.7, uploadedBy: uAccueil.id }] } });
  const dos12 = await DOS({ numeroDossier: 'DOS-2026-000112', dateReception: D('2026-04-24'), societeId: telma.id, beneficiaire: 'Tojo Andriamampianina', typeDossier: 'HOSPITALISATION_MEDICAL', categorieDossier: 'REGLEMENT_PRESTATAIRE', assureId: b2.id, nSS: b2.nSS, prestataireId: pHop.id, dateSoins: D('2026-04-12'), montantReclame: dec('3950000.00'), montantValide: dec('2962500.00'), ticketModerateur: dec('987500.00'), partPatient: dec('987500.00'), partEntreprise: dec('2962500.00'), statut: 'VALIDE', source: 'ISA', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-04-28'), historique: hist([['2026-04-24T08:20:00Z', 'RECU', 'Hospitalisation avril'], ['2026-04-28T10:45:00Z', 'EN_ANALYSE', 'Vérification garanties'], ['2026-04-28T17:00:00Z', 'VALIDE', '75 % validé']]) });
  const dos13 = await DOS({ numeroDossier: 'DOS-2026-000113', dateReception: D('2026-03-06'), societeId: telma.id, beneficiaire: 'Lova Randrianasolo', typeDossier: 'PHARMACIE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: b1.id, nSS: b1.nSS, prestataireId: pPha.id, dateSoins: D('2026-03-02'), montantReclame: dec('120000.00'), montantValide: dec('72000.00'), ticketModerateur: dec('48000.00'), partPatient: dec('48000.00'), partEntreprise: dec('72000.00'), statut: 'PAYE', source: 'SAGE', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, gestionnaireComptaId: gCpt.id, moyenPaiement: 'VIREMENT', dateTraitementTechnique: D('2026-03-08'), dateReceptionDecompte: D('2026-03-09'), datePaiement: D('2026-03-19'), referencePaiement: 'PMT-2026-0047', montantPaye: dec('72000.00'), historique: hist([['2026-03-06T08:30:00Z', 'RECU', 'Réception'], ['2026-03-08T10:00:00Z', 'EN_ANALYSE', 'Analyse'], ['2026-03-08T14:00:00Z', 'VALIDE', '60 % validé'], ['2026-03-09T09:00:00Z', 'EN_COMPTABILITE', 'Décompte reçu'], ['2026-03-15T13:00:00Z', 'EN_PAIEMENT', 'Mise en paiement'], ['2026-03-19T15:30:00Z', 'PAYE', 'Virement PMT-2026-0047']]) });
  const dos14 = await DOS({ numeroDossier: 'DOS-2026-000114', dateReception: D('2026-05-12'), societeId: jirama.id, beneficiaire: 'Pierre Ramiandrisoa', typeDossier: 'HOSPITALISATION_MEDICAL', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: c1.id, nSS: c1.nSS, prestataireId: pCli.id, dateSoins: D('2026-04-12'), montantReclame: dec('1850000.00'), statut: 'REJETE', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, gestionnaireTechniqueId: gTec.id, dateTraitementTechnique: D('2026-05-14'), motifRejet: 'Contrat expiré : date de soins (12/04/2026) postérieure à la fin du contrat (31/12/2025)', historique: hist([['2026-05-12T08:40:00Z', 'RECU', 'Hospitalisation — JIRAMA'], ['2026-05-14T09:30:00Z', 'EN_ANALYSE', 'Contrat : CTR-JIR-2025 expiré'], ['2026-05-14T09:35:00Z', 'REJETE', 'Soins hors période de couverture']]) });
  const dos15 = await DOS({ numeroDossier: 'DOS-2026-000115', dateReception: D('2026-06-25'), societeId: airtel.id, beneficiaire: 'Sitraka Mananjara', typeDossier: 'CONSULTATION_SIMPLE', categorieDossier: 'REMBOURSEMENT_ASSURE', assureId: d1.id, nSS: d1.nSS, prestataireId: pCli.id, dateSoins: D('2026-06-22'), montantReclame: dec('58000.00'), statut: 'RECU', source: 'MANUEL', createurId: uAccueil.id, gestionnaireAccueilId: gAcc.id, observations: 'Convention prestataire inactive pour cette société : contrôle requis avant validation.' });
  console.log('  ✅ 15 dossiers : RECU×2, EN_ANALYSE×2, VALIDE×3, EN_COMPTABILITE×1, EN_PAIEMENT×1, PAYE×3, REJETE×3');

  // ── 8. Finances : appels de fonds + budget utilisé + mode de calcul ─────
  console.log('\n💰 FINANCES');
  await db.appelDeFonds.create({ data: { contratId: ctrSan26.id, montant: dec('25000000.00'), dateAppel: D('2026-01-15'), datePaiement: D('2026-02-10'), reference: 'VIR-SANLAM-20260210', statut: 'REGLE', observations: '1er appel de fonds 2026' }});
  await db.appelDeFonds.create({ data: { contratId: ctrSan26.id, montant: dec('18000000.00'), dateAppel: D('2026-04-01'), datePaiement: D('2026-04-22'), reference: 'VIR-SANLAM-20260422', statut: 'REGLE' }});
  await db.appelDeFonds.create({ data: { contratId: ctrSan26.id, montant: dec('12000000.00'), dateAppel: D('2026-06-01'), statut: 'EN_ATTENTE', observations: '3e appel — relance envoyée le 15/06' }});
  await db.appelDeFonds.create({ data: { contratId: ctrTel26.id, montant: dec('10000000.00'), dateAppel: D('2026-01-20'), datePaiement: D('2026-02-05'), reference: 'VIR-TELMA-20260205', statut: 'REGLE' }});
  await db.appelDeFonds.create({ data: { contratId: ctrTel26.id, montant: dec('8000000.00'), dateAppel: D('2026-06-10'), statut: 'EN_ATTENTE' }});
  await db.modeCalculAppelFonds.create({ data: { societeId: sanlam.id, mode: 'DEPENSE_MENSUELLE', periodicite: 'MENSUELLE', dateDebut: D('2026-01-01') }});
  await db.modeCalculAppelFonds.create({ data: { societeId: telma.id, mode: 'FONDS_ROULEMENT', periodicite: 'TRIMESTRIELLE', parametres: JSON.stringify({ fondsRoulement: 15000000 }) }});
  // budgetUtilise = somme des montants validés (statuts VALIDE → PAYE)
  for (const c of [ctrSan26, ctrTel26]) {
    const agg = await db.dossier.aggregate({ _sum: { montantValide: true }, where: { societeId: c.societeId, statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] } } });
    await db.contrat.update({ where: { id: c.id }, data: { budgetUtilise: agg._sum.montantValide ?? 0 } });
  }
  console.log('  ✅ 5 appels de fonds (3 REGLE, 2 EN_ATTENTE) + 2 modes de calcul + budgets mis à jour');

  // ── 9. Courriels + audit ────────────────────────────────────────────────
  await db.courriel.create({ data: { type: 'FACTURE_PRESTATAIRE', expediteur: 'facturation@hopital-principal.mg', objet: 'Facture hospitalisation T. Rasoanaivo — avril 2026', societeId: sanlam.id, beneficiaire: 'Tiana Rasoanaivo', montant: dec('4250000.00'), dateCourriel: D('2026-05-02T09:00:00Z'), dateSoins: D('2026-04-20'), prestataire: 'Hôpital Principal HJ Anosy', statut: 'TRAITE', traitePar: 'accueil@suivisante.mg', dateTraitement: D('2026-05-02T10:00:00Z'), dossierId: dos4.id }});
  await db.courriel.create({ data: { type: 'DOSSIER_REMBOURSEMENT', expediteur: 'lova.randrianasolo@telma.mg', objet: 'Demande de remboursement consultation 17/06/2026', societeId: telma.id, beneficiaire: 'Lova Randrianasolo', montant: dec('74000.00'), dateCourriel: D('2026-06-20T08:10:00Z'), dateSoins: D('2026-06-17'), prestataire: 'Centre Médical Ambatobe', statut: 'RECU', dossierId: dos11.id }});
  for (const [s, obj] of [[sanlam, 'SANLAM MADAGASCAR ASSURANCE'], [telma, 'TELMA MADAGASCAR'], [jirama, 'JIRAMA'], [airtel, 'AIRTEL MADAGASCAR'], [bni, 'BNI MADAGASCAR']]) {
    await db.historiqueParametre.create({ data: { entite: 'Societe', entiteId: s.id, champ: 'CREATION', nouvelleValeur: obj, modifiePar: admin.email, modifieParId: admin.id, action: 'CREATION', niveau: 'STANDARD', module: 'Sociétés', objet: obj, societeId: s.id, motif: 'Jeu de données de test — réinitialisation 2026-09-16' } });
  }
  console.log('  ✅ 2 courriels liés aux dossiers + 5 entrées d\u2019audit (création sociétés)');

  // ── 10. Vérifications intégrées (échec = abort) ─────────────────────────
  console.log('\n🔍 VÉRIFICATIONS INTÉGRÉES');
  const checks = [];
  const chk = (libelle, ok) => { checks.push([libelle, ok]); console.log(`  ${ok ? '✅' : '❌'} ${libelle}`); };

  chk('5 sociétés', (await db.societe.count()) === 5);
  chk('15 dossiers', (await db.dossier.count()) === 15);
  chk('13 assurés', (await db.assure.count()) === 13);
  chk('6 prestataires', (await db.prestataire.count()) === 6);
  chk('5 contrats', (await db.contrat.count()) === 5);
  chk('21 barèmes', (await db.bareme.count()) === 21);
  chk('tous les statuts de dossier couverts', (await db.dossier.groupBy({ by: ['statut'] })).length === 7);
  // cohérence chaîne : l'assuré d'un dossier appartient à la société du dossier
  const incoherents = await db.dossier.findMany({ where: { assureId: { not: null } }, include: { assure: true } });
  chk('chaîne Société→Assuré cohérente sur tous les dossiers', incoherents.every((d) => d.assure.societeId === d.societeId));
  // budget utilisé cohérent
  const san26 = await db.contrat.findUnique({ where: { id: ctrSan26.id } });
  chk('budgetUtilise SANLAM-2026 = 15 635 540.00 Ar', san26.budgetUtilise.toNumber() === 15635540);
  // liaison e-mail des 3 sources
  chk('source 1 (EntrepriseContact) : contact.sanlam@sanlam.mg', !!(await db.entrepriseContact.findFirst({ where: { email: { equals: 'contact.sanlam@sanlam.mg', mode: 'insensitive' } } })));
  chk('source 2 (emailContactPrincipal) : contact.telma@telma.mg', !!(await db.societe.findFirst({ where: { emailContactPrincipal: { equals: 'contact.telma@telma.mg', mode: 'insensitive' } } })));
  chk('source 3 (Societe.email) : j.rakotoarison@jirama.mg', !!(await db.societe.findFirst({ where: { email: { equals: 'j.rakotoarison@jirama.mg', mode: 'insensitive' } } })));
  // comptes externes
  chk('2 comptes CONTACT_ENTREPRISE actifs', (await db.utilisateur.count({ where: { role: 'CONTACT_ENTREPRISE', actif: true } })) === 2);
  // comptes conservés intacts (recherche par préfixe pour éviter les troncatures)
  for (const e of ['admin@suivisante.mg', 'tsimbina.rason@', 'tsimbinarason@gmail.com']) {
    chk(`compte conservé : ${e}`, (await db.utilisateur.count({ where: { email: { startsWith: e.split('@')[0] + '@', mode: 'insensitive' } } })) >= 1);
  }
  // anciens numéros de dossiers disparus
  chk('aucun ancien dossier (DOS-2026-000001..000100)', (await db.dossier.count({ where: { numeroDossier: { in: Array.from({ length: 100 }, (_, i) => `DOS-2026-${String(i + 1).padStart(6, '0')}`) } } })) === 0);
  // référentiels intacts
  chk('référentiel gestionnaires intact (10)', (await db.gestionnaire.count()) === 10);

  const echecs = checks.filter(([, ok]) => !ok);
  if (echecs.length) throw new Error(`${echecs.length} vérification(s) en échec : ${echecs.map(([l]) => l).join(' | ')}`);

  console.log('\n🔑 IDENTIFIANTS DE TEST (comptes créés) :');
  console.log('  internes (mdp SuiviSante@2026) : accueil@ / technique@ / compta@ / sante@suivisante.mg');
  console.log('  externes (mdp Contact@2026)    : contact.sanlam@sanlam.mg | contact.telma@telma.mg | portail.sanlam@suivisante.mg');
  console.log('\n🆔 IDS CLÉS (tests isolation) :');
  console.log(`  SANLAM=${sanlam.id}\n  TELMA=${telma.id}\n  dossiers : SANLAM=${dos1.id} TELMA=${dos11.id}\n  assurés  : SANLAM=${a1.id} TELMA=${b1.id}\n  contrats : SANLAM=${ctrSan26.id} TELMA=${ctrTel26.id}`);
  console.log('\n🎉 RÉINITIALISATION TERMINÉE AVEC SUCCÈS');
}

main()
  .catch((e) => { console.error('\n❌ ÉCHEC :', e); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
