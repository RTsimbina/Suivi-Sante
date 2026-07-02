import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import * as crypto from 'crypto';

const db = new PrismaClient();

const TYPES_DOSSIER = ['HOSPITALISATION', 'CONSULTATION', 'PHARMACIE', 'MATERNITE', 'CHIRURGIE', 'EXAMEN', 'SOINS DENTAIRES', 'OPTIQUE'];
const STATUTS = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'];
const MOYENS_PAIEMENT = ['VIREMENT', 'CHEQUE', 'ESPECES'];
const PRESTATAIRES = [
  'Clinique Sainte Marie', 'Hôpital Principal', 'Centre Médical Albert', 'Pharmacie Centrale',
  'Cabinet Dentaire Blanc', 'Laboratoire BioMad', 'Centre Optique Vision Plus',
  'Maternité Fleur de Vie', 'Hôpital Militaire', 'Policlinique du Nord',
];
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

async function main() {
  console.log('🌱 Début du seeding SmartFlow IA...');

  // ── Utilisateurs ──
  const passwordHash = await hash('SmartFlow@2026', 10);
  const utilisateurs = [
    { email: 'admin@smartflow.mg', nom: 'Administrateur Système', password: passwordHash, role: 'ADMINISTRATEUR' },
    { email: 'accueil@smartflow.mg', nom: 'Ravao Andrianjaka', password: passwordHash, role: 'ACCUEIL' },
    { email: 'technique@smartflow.mg', nom: 'Jean-Pierre Rakoto', password: passwordHash, role: 'TECHNIQUE' },
    { email: 'compta@smartflow.mg', nom: 'Marie Rasoa', password: passwordHash, role: 'COMPTABILITE' },
    { email: 'utilisateur@smartflow.mg', nom: 'Andry Faly', password: passwordHash, role: 'UTILISATEUR' },
  ];

  for (const u of utilisateurs) {
    await db.utilisateur.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log(`  ✅ ${utilisateurs.length} utilisateurs créés`);

  // ── Sociétés ──
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

  // ── Gestionnaires ──
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

  // ── Contrats ──
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

  // ── Appels de fonds ──
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

  // ── Dossiers (250) ──
  const accueilIds = Object.values(gestionnaires).filter(g => g.service === 'ACCUEIL').map(g => g.id);
  const techniqueIds = Object.values(gestionnaires).filter(g => g.service === 'TECHNIQUE').map(g => g.id);
  const comptaIds = Object.values(gestionnaires).filter(g => g.service === 'COMPTABILITE').map(g => g.id);
  const societeIds = Object.values(societes);

  const utilisateursList = await db.utilisateur.findMany();
  const accueilUser = utilisateursList.find(u => u.role === 'ACCUEIL')!;

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

    await db.dossier.create({
      data: {
        numeroDossier: generateNumeroDossier(i),
        dateReception,
        societeId: randomItem(societeIds),
        beneficiaire: `${randomItem(NOMS_MALAGASY)} ${randomItem(PRENOMS_MALAGASY)}`,
        typeDossier: randomItem(TYPES_DOSSIER),
        gestionnaireAccueilId: randomItem(accueilIds),
        createurId: accueilUser.id,
        assure: `${randomItem(NOMS_MALAGASY)} ${randomItem(PRENOMS_MALAGASY)}`,
        nSS: `SS-${randomInt(100000, 999999)}`,
        prestataire: randomItem(PRESTATAIRES),
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
  console.log(`  ✅ ${dossierCount} dossiers créés`);

  // ── Commentaires (pour quelques dossiers) ──
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

  console.log('\n✅ Seeding terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });