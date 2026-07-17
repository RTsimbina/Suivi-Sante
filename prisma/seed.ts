import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import * as crypto from 'crypto';

const db = new PrismaClient();

const TYPES_DOSSIER = ['HOSPITALISATION', 'CONSULTATION', 'PHARMACIE', 'MATERNITE', 'CHIRURGIE', 'EXAMEN', 'SOINS DENTAIRES', 'OPTIQUE'];
const STATUTS = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'];
const MOYENS_PAIEMENT = ['VIREMENT', 'CHEQUE', 'ESPECES'];
const OBSERVATIONS = [
  'Urgence prise en charge', 'Dossier prioritaire', 'A vérifier avec la mutuelle',
  'Réclamation client en cours', 'Deuxième avis médical requis', '',
  '', '', '', '', '',
];
const NOMS_MALAGASY = [
  'Rakoto', 'Rasoa', 'Andry', 'Faly', 'Naina', 'Hery', 'Tiana', 'Mialy',
  'Jean', 'Marie', 'Pierre', 'Aline', 'Claude', 'Nirina', 'Haingo',
  'Tahiry', 'Sitraka', 'Lova', 'Fenitra', 'Ony',
];
const PRENOMS_MALAGASY = [
  'Rakotonirina', 'Rasoanaivo', 'Andrianjaka', 'Randriamanalina', 'Rakotomanga',
  'Andriamananjara', 'Rasolofomanana', 'Rakotobe', 'Andrianarisoa', 'Ramiandrisoa',
];

// Prestataires médicaux structurés
const PRESTATAIRES_DATA = [
  { nom: 'Clinique Sainte Marie', type: 'CLINIQUE', telephone: '032 12 345 67', email: 'contact@clinique-saintemarie.mg', adresse: 'Lot VJ 34 Antanimena, Antananarivo', nif: '4001234567' },
  { nom: 'Hôpital Principal', type: 'HOPITAL', telephone: '020 22 345 67', email: 'info@hopital-principal.mg', adresse: 'Avenue de l\'Indépendance, Antananarivo', nif: '4002345678' },
  { nom: 'Centre Médical Albert', type: 'CABINET_MEDICAL', telephone: '034 56 789 01', email: 'rdv@cm-albert.mg', adresse: 'Anosy, Antananarivo', nif: '4003456789' },
  { nom: 'Pharmacie Centrale', type: 'PHARMACIE', telephone: '020 22 456 78', email: 'commande@pharmacie-centrale.mg', adresse: 'Place Behorizy, Antananarivo', nif: '4004567890' },
  { nom: 'Cabinet Dentaire Blanc', type: 'DENTAIRE', telephone: '033 67 890 12', email: 'blanc.dental@gmail.com', adresse: 'Analakely, Antananarivo', nif: '4005678901' },
  { nom: 'Laboratoire BioMad', type: 'LABORATOIRE', telephone: '020 22 567 89', email: 'lab@biomad.mg', adresse: 'Isotry, Antananarivo', nif: '4006789012' },
  { nom: 'Centre Optique Vision Plus', type: 'OPTICIEN', telephone: '034 78 901 23', email: 'visionplus@optique.mg', adresse: 'Tana Water Front, Antananarivo', nif: '4007890123' },
  { nom: 'Maternité Fleur de Vie', type: 'CLINIQUE', telephone: '020 24 678 90', email: 'maternite@fleurdevie.mg', adresse: 'Ampefiloha, Antananarivo', nif: '4008901234' },
  { nom: 'Hôpital Militaire', type: 'HOPITAL', telephone: '020 22 789 01', email: 'admin@hopital-militaire.mg', adresse: 'Soarano, Antananarivo', nif: '4009012345' },
  { nom: 'Policlinique du Nord', type: 'CLINIQUE', telephone: '032 89 012 34', email: 'contact@policlinique-nord.mg', adresse: 'Antsahamarina, Antananarivo', nif: '4010123456' },
];

// Barèmes par prestation (taux et plafonds)
const BAREMES_DATA = [
  { prestation: 'HOSPITALISATION', tauxCouverture: 80, plafond: 5_000_000, description: 'Prise en charge hospitalisation complète' },
  { prestation: 'CONSULTATION', tauxCouverture: 70, plafond: 100_000, description: 'Consultation médicale générale ou spécialisée' },
  { prestation: 'PHARMACIE', tauxCouverture: 60, plafond: 200_000, description: 'Médicaments sur ordonnance' },
  { prestation: 'MATERNITE', tauxCouverture: 85, plafond: 3_000_000, description: 'Suivi de grossesse et accouchement' },
  { prestation: 'CHIRURGIE', tauxCouverture: 80, plafond: 10_000_000, description: 'Interventions chirurgicales' },
  { prestation: 'EXAMEN', tauxCouverture: 75, plafond: 500_000, description: 'Examens de laboratoire et imagerie' },
  { prestation: 'SOINS DENTAIRES', tauxCouverture: 60, plafond: 300_000, description: 'Soins dentaires courants et prothèses' },
  { prestation: 'OPTIQUE', tauxCouverture: 50, plafond: 250_000, description: 'Lunettes et lentilles correctrices' },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateNumeroDossier(index: number): string {
  return `DOS-2026-${String(index).padStart(6, '0')}`;
}

function generateNSS(): string {
  return `SS-${randomInt(100000, 999999)}`;
}

async function main() {
  console.log('🌱 Début du seeding Suivi Santé...');

  // ── 1. Utilisateurs démo ──
  const passwordHash = await hash('SuiviSante@2026', 10);
  const utilisateursData = [
    { email: 'admin@suivisante.mg', nom: 'Administrateur Système', password: passwordHash, role: 'ADMINISTRATEUR' },
    { email: 'accueil@suivisante.mg', nom: 'Ravao Andrianjaka', password: passwordHash, role: 'ACCUEIL' },
    { email: 'technique@suivisante.mg', nom: 'Jean-Pierre Rakoto', password: passwordHash, role: 'TECHNIQUE' },
    { email: 'compta@suivisante.mg', nom: 'Marie Rasoa', password: passwordHash, role: 'COMPTABILITE' },
    { email: 'utilisateur@suivisante.mg', nom: 'Andry Faly', password: passwordHash, role: 'UTILISATEUR' },
    { email: 'sante@suivisante.mg', nom: 'Dr. Nahitra Raza', password: passwordHash, role: 'SANTE' },
  ];

  for (const u of utilisateursData) {
    await db.utilisateur.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log(`  ✅ ${utilisateursData.length} utilisateurs démo créés`);

  // ── 2. Sociétés ──
  const societesData = [
    'TELMA Madagascar', 'JIRAMA', 'Airtel Madagascar', 'BOA Madagascar',
    'BNI Madagascar', 'Société Générale MDG', 'Total Energies MDG',
    'Shopee Madagascar', 'Coca Cola MAD', 'Colas Madagascar',
    'Orange Madagascar', 'Henkel Madagascar', 'Groupe Filatex',
    'SIFOR Madagascar', 'Banque de l\'Océan Indien',
  ];

  const societes: Record<string, string> = {};
  for (const nom of societesData) {
    const s = await db.societe.upsert({
      where: { id: nom.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 20) },
      update: { nom },
      create: { id: crypto.randomBytes(8).toString('hex'), nom },
    });
    societes[nom] = s.id;
  }
  console.log(`  ✅ ${societesData.length} sociétés créées`);

  // ── 3. Barèmes (liés aux sociétés) ──
  let baremeCount = 0;
  const societeIds = Object.values(societes);
  for (const societeId of societeIds) {
    for (const b of BAREMES_DATA) {
      // Variations aléatoires des taux par société (±10%)
      const tauxVariation = b.tauxCouverture + randomInt(-10, 10);
      const plafondVariation = Math.round(b.plafond * (0.8 + Math.random() * 0.4));
      await db.bareme.create({
        data: {
          societeId,
          prestation: b.prestation,
          tauxCouverture: Math.max(30, Math.min(100, tauxVariation)),
          plafond: plafondVariation,
          description: b.description,
          active: true,
        },
      });
      baremeCount++;
    }
  }
  console.log(`  ✅ ${baremeCount} barèmes créés (${BAREMES_DATA.length} prestations × ${societesData.length} sociétés)`);

  // ── 4. Prestataires médicaux ──
  const prestatairesMap: Record<string, string> = {};
  for (const p of PRESTATAIRES_DATA) {
    const created = await db.prestataire.upsert({
      where: { id: p.nom.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 20) },
      update: {},
      create: { id: crypto.randomBytes(8).toString('hex'), ...p },
    });
    prestatairesMap[p.nom] = created.id;
  }
  // Ajouter quelques prestataires supplémentaires
  const prestatairesExtra = [
    { nom: 'Hôpital Andrianarisoa', type: 'HOPITAL', telephone: '020 23 456 78', email: 'contact@hopital-andria.mg', adresse: 'Ambohimanarina', nif: '4011234567' },
    { nom: 'Pharmacie du Centre', type: 'PHARMACIE', telephone: '020 22 345 67', email: 'info@pharmacie-centre.mg', adresse: 'Ankatso', nif: '4012345678' },
    { nom: 'Labo Analyses Plus', type: 'LABORATOIRE', telephone: '034 12 345 67', email: 'lab@analysesplus.mg', adresse: 'Mahamasina', nif: '4013456789' },
  ];
  for (const p of prestatairesExtra) {
    const created = await db.prestataire.create({ data: p });
    prestatairesMap[p.nom] = created.id;
  }
  console.log(`  ✅ ${PRESTATAIRES_DATA.length + prestatairesExtra.length} prestataires créés`);

  // ── 5. Assurés (3-5 par société) ──
  const assuresBySociete: Record<string, string[]> = {};
  let assureCount = 0;
  for (const [nomSociete, societeId] of Object.entries(societes)) {
    const nbAssures = randomInt(3, 6);
    assuresBySociete[societeId] = [];
    for (let a = 0; a < nbAssures; a++) {
      const nss = generateNSS();
      const prenom = randomItem(NOMS_MALAGASY);
      const nomFamille = randomItem(PRENOMS_MALAGASY);
      const assure = await db.assure.create({
        data: {
          societeId,
          nom: nomFamille,
          prenom,
          nSS: nss,
          dateNaissance: randomDate(new Date('1960-01-01'), new Date('2000-12-31')),
          sexe: Math.random() > 0.5 ? 'M' : 'F',
          telephone: `034 ${randomInt(10, 99)} ${randomInt(100, 999)} ${randomInt(10, 99)}`,
          email: `${prenom.toLowerCase()}.${nomFamille.toLowerCase().slice(0, 6)}@${nomSociete.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}.mg`,
          adresse: `Antananarivo, Madagascar`,
          actif: true,
        },
      });
      assuresBySociete[societeId].push(assure.id);
      assureCount++;
    }
  }
  console.log(`  ✅ ${assureCount} assurés créés (${Math.round(assureCount / societesData.length)}/société en moyenne)`);

  // ── 6. Gestionnaires ──
  const gestionnairesData = [
    { nom: 'Ravao A.', service: 'ACCUEIL' },
    { nom: 'Nirina R.', service: 'ACCUEIL' },
    { nom: 'Jean-Pierre R.', service: 'TECHNIQUE' },
    { nom: 'Haingo T.', service: 'TECHNIQUE' },
    { nom: 'Sitraka M.', service: 'TECHNIQUE' },
    { nom: 'Marie R.', service: 'COMPTABILITE' },
    { nom: 'Tahiry V.', service: 'COMPTABILITE' },
    { nom: 'Lova N.', service: 'TECHNIQUE' },
    { nom: 'Fenitra K.', service: 'ACCUEIL' },
    { nom: 'Ony D.', service: 'COMPTABILITE' },
  ];

  const gestionnaires: Record<string, { id: string; service: string }> = {};
  for (const g of gestionnairesData) {
    const created = await db.gestionnaire.create({ data: g });
    gestionnaires[g.nom] = { id: created.id, service: g.service };
  }
  console.log(`  ✅ ${gestionnairesData.length} gestionnaires créés`);

  // ── 7. Contrats ──
  const contrats: string[] = [];
  for (const [nom, societeId] of Object.entries(societes)) {
    const budget = randomFloat(50_000_000, 500_000_000);
    const contrat = await db.contrat.create({
      data: {
        societeId,
        reference: `CTR-${nom.slice(0, 4).toUpperCase()}-2026`,
        budgetAnnuel: budget,
        budgetUtilise: randomFloat(budget * 0.1, budget * 0.7),
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        statut: 'ACTIF',
      },
    });
    contrats.push(contrat.id);
  }
  console.log(`  ✅ ${contrats.length} contrats créés`);

  // ── 8. Appels de fonds ──
  let appelCount = 0;
  for (const contratId of contrats.slice(0, 8)) {
    const nbAppels = randomInt(1, 4);
    for (let i = 0; i < nbAppels; i++) {
      const estRegle = Math.random() > 0.3;
      await db.appelDeFonds.create({
        data: {
          contratId,
          montant: randomFloat(2_000_000, 30_000_000),
          dateAppel: randomDate(new Date('2026-01-15'), new Date('2026-06-15')),
          datePaiement: estRegle ? randomDate(new Date('2026-02-01'), new Date('2026-06-25')) : null,
          reference: estRegle ? `PAIE-${randomInt(1000, 9999)}` : null,
          statut: estRegle ? 'REGLE' : 'EN_ATTENTE',
          observations: Math.random() > 0.7 ? 'Appel urgent pour renflouement' : null,
        },
      });
      appelCount++;
    }
  }
  console.log(`  ✅ ${appelCount} appels de fonds créés`);

  // ── 9. Dossiers (250) — liés aux assurés et prestataires ──
  const accueilIds = Object.values(gestionnaires).filter(g => g.service === 'ACCUEIL').map(g => g.id);
  const techniqueIds = Object.values(gestionnaires).filter(g => g.service === 'TECHNIQUE').map(g => g.id);
  const comptaIds = Object.values(gestionnaires).filter(g => g.service === 'COMPTABILITE').map(g => g.id);

  const utilisateursList = await db.utilisateur.findMany();
  const accueilUser = utilisateursList.find(u => u.role === 'ACCUEIL')!;
  const utilisateurDemo = utilisateursList.find(u => u.role === 'UTILISATEUR')!;

  const prestataireIds = Object.values(prestatairesMap);
  const allAssureIds = Object.values(assuresBySociete).flat();

  let dossierCount = 0;
  const statutWeights: Record<string, number> = {
    RECU: 15, EN_ANALYSE: 15, VALIDE: 10, EN_COMPTABILITE: 8, EN_PAIEMENT: 12, PAYE: 30, REJETE: 10,
  };

  function weightedRandomStatut(): string {
    const total = Object.values(statutWeights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [statut, weight] of Object.entries(statutWeights)) {
      r -= weight;
      if (r <= 0) return statut;
    }
    return 'PAYE';
  }

  for (let i = 1; i <= 250; i++) {
    const statut = weightedRandomStatut();
    const dateReception = randomDate(new Date('2026-01-02'), new Date('2026-06-24'));
    const montantReclame = randomFloat(15_000, 8_500_000);
    const estRejete = statut === 'REJETE';
    const estPaye = statut === 'PAYE';
    const estEnAnalyse = statut === 'EN_ANALYSE' || statut === 'VALIDE' || statut === 'EN_COMPTABILITE' || statut === 'EN_PAIEMENT' || estPaye;

    const dateTraitementTechnique = estEnAnalyse ? randomDate(dateReception, new Date('2026-06-24')) : null;
    const montantValide = estRejete ? null : randomFloat(montantReclame * 0.6, montantReclame * 1.0);
    const motifRejet = estRejete ? randomItem(['Pièces manquantes', 'Montant non conforme', 'Hors contrat', 'Dossier incomplet', 'Soins non couverts']) : null;

    const dateReceptionDecompte = ['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)
      ? randomDate(dateTraitementTechnique || dateReception, new Date('2026-06-24'))
      : null;

    const datePaiement = estPaye ? randomDate(dateReceptionDecompte || dateTraitementTechnique || dateReception, new Date('2026-06-25')) : null;
    const montantPaye = estPaye ? randomFloat((montantValide || montantReclame) * 0.85, (montantValide || montantReclame)) : null;

    // Choisir une société et lier à un assuré de cette société
    const dossierSocieteId = randomItem(societeIds);
    const assuresOfSociete = assuresBySociete[dossierSocieteId] || [];
    const assureId = assuresOfSociete.length > 0 ? randomItem(assuresOfSociete) : null;

    // Choisir un prestataire
    const prestataireId = randomItem(prestataireIds);
    const prestataire = PRESTATAIRES_DATA.find(p => prestatairesMap[p.nom] === prestataireId);

    // Historique JSON
    const historique = [];
    historique.push({ date: dateReception.toISOString(), statut: 'RECU', commentaire: 'Dossier reçu à l\'accueil' });
    if (dateTraitementTechnique) {
      historique.push({ date: dateTraitementTechnique.toISOString(), statut: 'EN_ANALYSE', commentaire: 'Transmis au service technique' });
      if (estRejete) {
        historique.push({ date: new Date(dateTraitementTechnique.getTime() + 86400000 * randomInt(2, 15)).toISOString(), statut: 'REJETE', commentaire: `Rejeté: ${motifRejet}` });
      }
      if (statut === 'VALIDE' || statut === 'EN_COMPTABILITE' || statut === 'EN_PAIEMENT' || estPaye) {
        historique.push({ date: new Date(dateTraitementTechnique.getTime() + 86400000 * randomInt(1, 10)).toISOString(), statut: 'VALIDE', commentaire: 'Validé par le service technique' });
      }
    }
    if (dateReceptionDecompte) {
      historique.push({ date: dateReceptionDecompte.toISOString(), statut: statut === 'EN_COMPTABILITE' ? 'EN_COMPTABILITE' : 'EN_PAIEMENT', commentaire: 'Décompte reçu en comptabilité' });
    }
    if (datePaiement) {
      historique.push({ date: datePaiement.toISOString(), statut: 'PAYE', commentaire: 'Paiement effectué' });
    }

    // Pour ~10% des dossiers, les attribuer à l'utilisateur démo
    const createur = (i % 10 === 0) ? utilisateurDemo.id : accueilUser.id;

    await db.dossier.create({
      data: {
        numeroDossier: generateNumeroDossier(i),
        dateReception,
        societeId: dossierSocieteId,
        beneficiaire: `${randomItem(NOMS_MALAGASY)} ${randomItem(PRENOMS_MALAGASY)}`,
        typeDossier: randomItem(TYPES_DOSSIER),
        gestionnaireAccueilId: randomItem(accueilIds),
        createurId: createur,
        assureId,
        nSS: assureId ? null : generateNSS(), // NSS dupliqué dans le nom du bénéficiaire si pas d'assuré lié
        prestataireId,
        prestataireLegacy: prestataire?.nom || randomItem(PRESTATAIRES_DATA).nom,
        dateSoins: randomDate(new Date('2025-11-01'), dateReception),
        moyenPaiement: randomItem(MOYENS_PAIEMENT),
        observations: randomItem(OBSERVATIONS) || null,
        dateTraitementTechnique,
        montantReclame,
        montantValide,
        ticketModerateur: montantValide ? randomFloat(500, montantValide * 0.15) : null,
        partPatient: montantValide ? randomFloat(0, montantValide * 0.2) : null,
        partEntreprise: montantValide ? randomFloat(montantValide * 0.6, montantValide * 0.95) : null,
        gestionnaireTechniqueId: estEnAnalyse ? randomItem(techniqueIds) : null,
        motifRejet,
        dateReceptionDecompte,
        datePaiement,
        referencePaiement: estPaye ? `REF-${randomInt(100000, 999999)}` : null,
        montantPaye,
        gestionnaireComptaId: dateReceptionDecompte ? randomItem(comptaIds) : null,
        statut,
        source: randomItem(['EXCEL', 'ISA', 'SAGE', 'MANUEL']),
        historique: JSON.stringify(historique),
      },
    });
    dossierCount++;
  }
  console.log(`  ✅ ${dossierCount} dossiers créés (liés aux assurés et prestataires)`);

  // ── 10. Commentaires (pour quelques dossiers) ──
  const someDossiers = await db.dossier.findMany({ take: 30 });
  const users = await db.utilisateur.findMany();
  let commentCount = 0;
  for (const d of someDossiers) {
    const nbComments = randomInt(1, 3);
    for (let j = 0; j < nbComments; j++) {
      const commentTexts = [
        'Dossier vérifié, en attente de validation supérieure.',
        'Pièce justificative reçue, traitement en cours.',
        'Montant confirmé par le prestataire.',
        'Rappel envoyé au service comptabilité.',
        'Client a appelé pour connaître l\'avancement.',
        'Décompte corrigé après vérification.',
        'Conforme au contrat, passage en paiement.',
        'Attente retour du médecin conseil.',
      ];
      await db.commentaire.create({
        data: {
          dossierId: d.id,
          auteurId: randomItem(users).id,
          contenu: randomItem(commentTexts),
          prive: Math.random() > 0.6,
          createdAt: randomDate(d.dateReception, new Date('2026-06-25')),
        },
      });
      commentCount++;
    }
  }
  console.log(`  ✅ ${commentCount} commentaires créés`);

  // ── 11. Quelques courriels de démonstration ──
  const courrielsData = [
    {
      type: 'FACTURE_PRESTATAIRE', expediteur: 'Clinique Sainte Marie',
      objet: 'Facture #INV-2026-0456 - Hospitalisation Mme Rasoa',
      societeId: societes['TELMA Madagascar'], beneficiaire: 'Rasoa Rasoanaivo',
      montant: 1_250_000, prestataire: 'Clinique Sainte Marie', statut: 'RECU',
    },
    {
      type: 'DOSSIER_REMBOURSEMENT', expediteur: 'Jean-Pierre Rakoto',
      objet: 'Demande de remboursement consultation',
      societeId: societes['JIRAMA'], beneficiaire: 'Andry Randriamanalina',
      montant: 85_000, prestataire: 'Centre Médical Albert', statut: 'TRAITE',
    },
    {
      type: 'FACTURE_PRESTATAIRE', expediteur: 'Laboratoire BioMad',
      objet: 'Facture analyses laboratoire - Batch Juin 2026',
      societeId: societes['Airtel Madagascar'], beneficiaire: null,
      montant: 2_340_000, prestataire: 'Laboratoire BioMad', statut: 'RECU',
    },
  ];
  let courrielCount = 0;
  for (const c of courrielsData) {
    await db.courriel.create({
      data: {
        ...c,
        dateCourriel: randomDate(new Date('2026-06-01'), new Date('2026-06-25')),
        dateSoins: randomDate(new Date('2026-05-01'), new Date('2026-06-20')),
        traitePar: c.statut === 'TRAITE' ? 'Ravao A.' : null,
        dateTraitement: c.statut === 'TRAITE' ? new Date('2026-06-20') : null,
      },
    });
    courrielCount++;
  }
  console.log(`  ✅ ${courrielCount} courriels de démonstration créés`);

  console.log('\n✅ Seeding terminé avec succès !');
  console.log(`   📊 Résumé : ${utilisateursData.length} utilisateurs, ${societesData.length} sociétés, ${baremeCount} barèmes,`);
  console.log(`   ${PRESTATAIRES_DATA.length + prestatairesExtra.length} prestataires, ${assureCount} assurés, ${contrats.length} contrats,`);
  console.log(`   ${appelCount} appels de fonds, ${dossierCount} dossiers, ${commentCount} commentaires, ${courrielCount} courriels.`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });