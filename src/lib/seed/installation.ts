/**
 * ARC-01 — Procédure d'installation (SEED uniquement, aucun DDL runtime).
 *
 * Extrait de l'ancienne route /api/setup (996 lignes) : le DDL inline
 * (CREATE_TABLES_SQL, FOREIGN_KEYS_SQL, ALTER TABLE de rattrapage) est
 * SUPPRIMÉ — le schéma a une source unique, les migrations Prisma
 * (`prisma migrate deploy`). Les colonnes anti brute-force (failedAttempts,
 * lockoutUntil) sont présentes dans la migration baseline.
 *
 * Ce module ne conserve que :
 *   - la migration de DONNÉES idempotente du budgetUtilise (recalcul depuis
 *     les appels de fonds — correction de désynchronisation antérieure à P2,
 *     à ne pas confondre avec une modification structurelle) ;
 *   - la migration des emails @smartflow.mg → @suivisante.mg ;
 *   - le seed de démonstration (utilisateurs, sociétés, barèmes,
 *     prestataires, assurés, gestionnaires, contrats, appels de fonds,
 *     dossiers, commentaires, courriels).
 *
 * Idempotent : si des utilisateurs existent déjà, le seed est sauté (les
 * mots de passe ne sont JAMAIS réinitialisés) et la réponse indique une
 * base déjà initialisée.
 */

import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import {
  BAREMES_DATA,
  COMMENTAIRES_DEMO,
  GESTIONNAIRES_DATA,
  MOYENS_PAIEMENT,
  MOTIFS_REJET,
  NOMS_MALAGASY,
  OBSERVATIONS,
  PRENOMS_MALAGASY,
  PRESTATAIRES_DATA,
  PRESTATAIRES_EXTRA_DATA,
  SOCIETES_DATA,
  TYPES_DOSSIER,
  generateNSS,
  generateNumeroDossier,
  randomDate,
  randomFloat,
  randomInt,
  randomItem,
  weightedRandomStatut,
} from './donnees-demo';

export interface ReponseInstallation {
  success: boolean;
  message?: string;
  error?: string;
  users?: number;
  migrated?: number;
  details: string[];
}

export async function executerInstallation(): Promise<ReponseInstallation> {
  const log: string[] = [];

  try {
    // ── Migration de DONNÉES : rattrapage budgetUtilise ──
    // Idempotente et purement data (aucun DDL) : recalcule le champ cache
    // depuis les appels de fonds réels. Correction du désynchronisme
    // antérieur à P2 (création d'appel sans synchronisation du budget).
    try {
      await db.$executeRaw`
        UPDATE "Contrat" c
        SET "budgetUtilise" = COALESCE(
          (SELECT SUM(a."montant") FROM "AppelDeFonds" a WHERE a."contratId" = c.id),
          0
        )
        WHERE c."budgetUtilise" IS NULL
           OR c."budgetUtilise" != COALESCE(
             (SELECT SUM(a."montant") FROM "AppelDeFonds" a WHERE a."contratId" = c.id),
             0
           )
      `;
      log.push('Migration budgetUtilise : valeurs recalculées depuis les appels de fonds');
    } catch (e: unknown) {
      console.warn(`[SETUP] Migration budgetUtilise (non bloquant): ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }

    // ── Migration des emails (démo) ──
    const oldDomain = 'smartflow.mg';
    const newDomain = 'suivisante.mg';
    const oldUsers = await db.utilisateur.findMany({
      where: { email: { endsWith: oldDomain } },
    });
    for (const u of oldUsers) {
      const newEmail = u.email.replace(oldDomain, newDomain);
      await db.utilisateur.update({ where: { id: u.id }, data: { email: newEmail } });
      log.push(`Email migré: ${u.email} → ${newEmail}`);
    }

    // Si des utilisateurs existent déjà, on ne touche PAS aux mots de passe.
    // Le setup ne doit réinitialiser les mdp qu'à la création initiale.
    const existingUsers = await db.utilisateur.count();
    if (existingUsers > 0) {
      return {
        success: true,
        message: 'Base de données déjà initialisée — données conservées',
        users: existingUsers,
        migrated: oldUsers.length,
        details: log,
      };
    }

    // 1. Utilisateurs démo
    const passwordHash = await hash('SuiviSante@2026', 10);
    const utilisateursData = [
      { email: 'admin@suivisante.mg', nom: 'Administrateur Système', password: passwordHash, role: 'ADMINISTRATEUR' },
      { email: 'accueil@suivisante.mg', nom: 'Ravao Andrianjaka', password: passwordHash, role: 'ACCUEIL' },
      { email: 'technique@suivisante.mg', nom: 'Jean-Pierre Rakoto', password: passwordHash, role: 'TECHNIQUE' },
      { email: 'compta@suivisante.mg', nom: 'Marie Rasoa', password: passwordHash, role: 'COMPTABILITE' },
      { email: 'utilisateur@suivisante.mg', nom: 'Andry Faly', password: passwordHash, role: 'SANTE' },
    ];

    for (const u of utilisateursData) {
      await db.utilisateur.upsert({
        where: { email: u.email },
        update: {},
        create: u,
      });
    }
    log.push(`${utilisateursData.length} utilisateurs démo créés`);

    // 2. Sociétés
    const societes: Record<string, string> = {};
    for (const nom of SOCIETES_DATA) {
      const s = await db.societe.create({ data: { nom } });
      societes[nom] = s.id;
    }
    log.push(`${SOCIETES_DATA.length} sociétés créées`);

    // 3. Barèmes
    let baremeCount = 0;
    for (const societeId of Object.values(societes)) {
      for (const b of BAREMES_DATA) {
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
    log.push(`${baremeCount} barèmes créés`);

    // 4. Prestataires
    const prestatairesMap: Record<string, string> = {};
    for (const p of PRESTATAIRES_DATA) {
      const created = await db.prestataire.create({ data: p });
      prestatairesMap[p.nom] = created.id;
    }
    for (const p of PRESTATAIRES_EXTRA_DATA) {
      const created = await db.prestataire.create({ data: p });
      prestatairesMap[p.nom] = created.id;
    }
    log.push(`${PRESTATAIRES_DATA.length + PRESTATAIRES_EXTRA_DATA.length} prestataires créés`);

    // 5. Assurés
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
            adresse: 'Antananarivo, Madagascar',
            actif: true,
          },
        });
        assuresBySociete[societeId].push(assure.id);
        assureCount++;
      }
    }
    log.push(`${assureCount} assurés créés`);

    // 6. Gestionnaires
    const gestionnaires: Record<string, { id: string; service: string }> = {};
    for (const g of GESTIONNAIRES_DATA) {
      const created = await db.gestionnaire.create({ data: g });
      gestionnaires[g.nom] = { id: created.id, service: g.service };
    }
    log.push(`${GESTIONNAIRES_DATA.length} gestionnaires créés`);

    // 7. Contrats
    const contrats: string[] = [];
    for (const [nom, societeId] of Object.entries(societes)) {
      const budget = randomFloat(50_000_000, 500_000_000);
      const contrat = await db.contrat.create({
        data: {
          societeId,
          reference: `CTR-${nom.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '')}-2026`,
          budgetAnnuel: budget,
          budgetUtilise: randomFloat(budget * 0.1, budget * 0.7),
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2026-12-31'),
          statut: 'ACTIF',
        },
      });
      contrats.push(contrat.id);
    }
    log.push(`${contrats.length} contrats créés`);

    // 8. Appels de fonds
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
    log.push(`${appelCount} appels de fonds créés`);

    // 9. Dossiers (250)
    const accueilIds = Object.values(gestionnaires).filter(g => g.service === 'ACCUEIL').map(g => g.id);
    const techniqueIds = Object.values(gestionnaires).filter(g => g.service === 'TECHNIQUE').map(g => g.id);
    const comptaIds = Object.values(gestionnaires).filter(g => g.service === 'COMPTABILITE').map(g => g.id);
    const utilisateursList = await db.utilisateur.findMany();
    const accueilUser = utilisateursList.find(u => u.role === 'ACCUEIL')!;
    const utilisateurDemo = utilisateursList.find(u => u.role === 'SANTE')!;
    const prestataireIds = Object.values(prestatairesMap);
    const societeIds = Object.values(societes);

    let dossierCount = 0;
    for (let i = 1; i <= 250; i++) {
      const statut = weightedRandomStatut();
      const dateReception = randomDate(new Date('2026-01-02'), new Date('2026-06-24'));
      const montantReclame = randomFloat(15_000, 8_500_000);
      const estRejete = statut === 'REJETE';
      const estPaye = statut === 'PAYE';
      const estEnAnalyse = statut === 'EN_ANALYSE' || statut === 'VALIDE' || statut === 'EN_COMPTABILITE' || statut === 'EN_PAIEMENT' || estPaye;
      const dateTraitementTechnique = estEnAnalyse ? randomDate(dateReception, new Date('2026-06-24')) : null;
      const montantValide = estRejete ? null : randomFloat(montantReclame * 0.6, montantReclame * 1.0);
      const motifRejet = estRejete ? randomItem(MOTIFS_REJET) : null;
      const dateReceptionDecompte = ['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)
        ? randomDate(dateTraitementTechnique || dateReception, new Date('2026-06-24')) : null;
      const datePaiement = estPaye ? randomDate(dateReceptionDecompte || dateTraitementTechnique || dateReception, new Date('2026-06-25')) : null;
      const montantPaye = estPaye ? randomFloat((montantValide || montantReclame) * 0.85, (montantValide || montantReclame)) : null;

      const dossierSocieteId = randomItem(societeIds);
      const assuresOfSociete = assuresBySociete[dossierSocieteId] || [];
      const assureId = assuresOfSociete.length > 0 ? randomItem(assuresOfSociete) : null;
      const prestataireId = randomItem(prestataireIds);
      const prestataire = PRESTATAIRES_DATA.find(p => prestatairesMap[p.nom] === prestataireId);

      const historique: { date: string; statut: string; commentaire: string }[] = [];
      historique.push({ date: dateReception.toISOString(), statut: 'RECU', commentaire: "Dossier reçu à l'accueil" });
      if (dateTraitementTechnique) {
        historique.push({ date: dateTraitementTechnique.toISOString(), statut: 'EN_ANALYSE', commentaire: 'Transmis au service technique' });
        if (estRejete) {
          historique.push({ date: new Date(dateTraitementTechnique.getTime() + 86400000 * randomInt(2, 15)).toISOString(), statut: 'REJETE', commentaire: `Rejeté: ${motifRejet}` });
        }
        if (['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)) {
          historique.push({ date: new Date(dateTraitementTechnique.getTime() + 86400000 * randomInt(1, 10)).toISOString(), statut: 'VALIDE', commentaire: 'Validé par le service technique' });
        }
      }
      if (dateReceptionDecompte) {
        historique.push({ date: dateReceptionDecompte.toISOString(), statut: statut === 'EN_COMPTABILITE' ? 'EN_COMPTABILITE' : 'EN_PAIEMENT', commentaire: 'Décompte reçu en comptabilité' });
      }
      if (datePaiement) {
        historique.push({ date: datePaiement.toISOString(), statut: 'PAYE', commentaire: 'Paiement effectué' });
      }

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
          nSS: assureId ? null : generateNSS(),
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
    log.push(`${dossierCount} dossiers créés`);

    // 10. Commentaires
    const someDossiers = await db.dossier.findMany({ take: 30 });
    const users = await db.utilisateur.findMany();
    let commentCount = 0;
    for (const d of someDossiers) {
      const nbComments = randomInt(1, 3);
      for (let j = 0; j < nbComments; j++) {
        await db.commentaire.create({
          data: {
            dossierId: d.id,
            auteurId: randomItem(users).id,
            contenu: randomItem(COMMENTAIRES_DEMO),
            prive: Math.random() > 0.6,
            createdAt: randomDate(d.dateReception, new Date('2026-06-25')),
          },
        });
        commentCount++;
      }
    }
    log.push(`${commentCount} commentaires créés`);

    // 11. Courriels
    const courrielsData = [
      { type: 'FACTURE_PRESTATAIRE', expediteur: 'Clinique Sainte Marie', objet: 'Facture #INV-2026-0456 - Hospitalisation Mme Rasoa', societeId: societes['TELMA Madagascar'], beneficiaire: 'Rasoa Rasoanaivo', montant: 1_250_000, prestataire: 'Clinique Sainte Marie', statut: 'RECU' },
      { type: 'DOSSIER_REMBOURSEMENT', expediteur: 'Jean-Pierre Rakoto', objet: 'Demande de remboursement consultation', societeId: societes['JIRAMA'], beneficiaire: 'Andry Randriamanalina', montant: 85_000, prestataire: 'Centre Médical Albert', statut: 'TRAITE' },
      { type: 'FACTURE_PRESTATAIRE', expediteur: 'Laboratoire BioMad', objet: 'Facture analyses laboratoire - Batch Juin 2026', societeId: societes['Airtel Madagascar'], beneficiaire: null, montant: 2_340_000, prestataire: 'Laboratoire BioMad', statut: 'RECU' },
    ];
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
    }
    log.push('3 courriels créés');

    return {
      success: true,
      message: 'Base de données initialisée avec succès',
      details: log,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur lors de l\'initialisation';
    console.error('[SETUP] Erreur:', error);
    return {
      success: false,
      error: msg,
      details: log,
    };
  }
}
