/**
 * ─── Seed des comptes de DÉMONSTRATION — Suivi Santé ─────────────────────────
 *
 * Crée/complète les comptes de démonstration de src/lib/comptes-demo.ts pour
 * tester TOUS les profils et workflows de la plateforme, puis associe à chaque
 * collaborateur des données réelles (étapes de traitement KPI, assignation de
 * contrôle médical, liaisons portails).
 *
 * GARANTIES :
 *   - IDEMPOTENT : exécutable plusieurs fois sans doublon (upserts par e-mail,
 *     étapes créées seulement pour les dossiers qui n'en ont aucune) ;
 *   - NON DESTRUCTIF : aucune suppression, aucun compte hors catalogue touché,
 *     aucune réinitialisation de mot de passe sur un compte existant (sauf
 *     option REINIT_MDP_DEMO=OUI), aucune réactivation de compte désactivé ;
 *   - RÔLES RÉELS : uniquement le référentiel ROLES (login fail-closed) ;
 *   - JAMAIS sur une base de production sans l'acquittement explicite
 *     SEED_DEMO=OUI (garde anti-exécution accidentelle).
 *
 * Prérequis : la base est migrée et contient un jeu de données (npm run
 * db:seed puis éventuellement node scripts/reset_seed.mjs). L'ordre conseillé :
 *   npm run db:seed                      (base + admin)
 *   node scripts/reset_seed.mjs          (jeu 5 sociétés — optionnel, PURGE métier)
 *   SEED_DEMO=OUI npx tsx prisma/seed-demo.ts
 *
 * Mot de passe à la CRÉATION des comptes : interne SuiviSante@2026, externe
 * Contact@2026 (identiques à scripts/reset_seed.mjs — réserver aux
 * environnements de développement / test).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  COMPTES_DEMO,
  PRESTATAIRES_DEMO,
  SOCIETES_DEMO,
  type ServiceDemo,
  emailDemoNormalise,
  emailsDemoParService,
} from '../src/lib/comptes-demo';
import { resoudreLiaisonContactEntreprise } from '../src/lib/liaison-externe';
import { resoudreLiaisonPrestataireAvecControle } from '../src/lib/liaison-prestataire';

const db = new PrismaClient();

const PWD_INTERNE = 'SuiviSante@2026';
const PWD_EXTERNE = 'Contact@2026';
const MAX_DOSSIERS = Number(process.env.SEED_DEMO_MAX_DOSSIERS ?? 400);

// ─── Utilitaires ──────────────────────────────────────────────────────────────

/** RNG déterministe (mulberry32) — exécutions reproductibles. */
function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const min = (m: number) => m * 60_000;
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Normalisation identique à src/lib/prestataire-doublons.ts (nomNormalise). */
function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const checks: [string, boolean][] = [];
function chk(libelle: string, ok: boolean): void {
  checks.push([libelle, ok]);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle}`);
}

// ─── 1. Comptes (internes puis externes) ─────────────────────────────────────

async function semerComptes(): Promise<Map<string, { id: string; role: string }>> {
  const pwdInt = await hash(PWD_INTERNE, 12);
  const pwdExt = await hash(PWD_EXTERNE, 12);
  const reinitMdp = process.env.REINIT_MDP_DEMO === 'OUI';
  const map = new Map<string, { id: string; role: string }>();

  for (const compte of COMPTES_DEMO) {
    const email = emailDemoNormalise(compte.email);
    const pwd = compte.categorie === 'INTERNE' ? pwdInt : pwdExt;
    const dataCreate = {
      email: compte.email,
      nom: compte.nom,
      role: compte.role,
      ...(compte.role === 'RESPONSABLE_SERVICE' ? { serviceResponsable: compte.serviceResponsable } : {}),
      password: pwd,
      actif: true,
    };
    // Mise à jour minimale : identité + rôle + service. JAMAIS le mot de
    // passe (sauf option explicite et compte non verrouillé) et JAMAIS le
    // champ actif (la désactivation reste un choix de l'administrateur).
    const update: Prisma.UtilisateurUpdateInput = {
      nom: compte.nom,
      role: compte.role,
      ...(compte.role === 'RESPONSABLE_SERVICE' ? { serviceResponsable: compte.serviceResponsable } : {}),
    };
    if (reinitMdp && !compte.motDePasseVerrouille) update.password = pwd;

    const user = await db.utilisateur.upsert({ where: { email: compte.email }, update, create: dataCreate });
    map.set(email, { id: user.id, role: user.role });
  }
  return map;
}

// ─── 2. Référentiel gestionnaires (au moins un par service + contrôle médical)

async function semerGestionnaires(): Promise<Record<ServiceDemo, { id: string; nom: string }>> {
  const nomsParService: Record<ServiceDemo, string> = {
    ACCUEIL: 'Ravao Andrianjaka (démo)',
    TECHNIQUE: 'Jean-Pierre Rakoto (démo)',
    COMPTABILITE: 'Marie Rasoa (démo)',
    CONTROLE_MEDICAL: 'Dr. Nahitra Raza (démo)',
  };
  const result = {} as Record<ServiceDemo, { id: string; nom: string }>;
  for (const service of Object.keys(nomsParService) as ServiceDemo[]) {
    let g = await db.gestionnaire.findFirst({ where: { service }, orderBy: { createdAt: 'asc' } });
    if (!g) {
      g = await db.gestionnaire.create({ data: { nom: nomsParService[service], service } });
      console.log(`  + gestionnaire créé : ${g.nom} (${service})`);
    }
    result[service] = { id: g.id, nom: g.nom };
  }
  return result;
}

// ─── 3. Objectifs de délais + seuils d'alerte (référentiel KPI) ──────────────

async function semerReferentielKpi(adminId: string): Promise<void> {
  const objectifs = [
    { service: 'ACCUEIL', delaiMinutes: 30 },
    { service: 'TECHNIQUE', delaiMinutes: 240 },
    { service: 'CONTROLE_MEDICAL', delaiMinutes: 240 },
    { service: 'COMPTABILITE', delaiMinutes: 120 },
  ];
  for (const o of objectifs) {
    const existant = await db.objectifDelai.findFirst({
      where: { service: o.service, typeDossier: null, valideAu: null },
    });
    if (!existant) {
      await db.objectifDelai.create({
        data: {
          service: o.service,
          typeDossier: null,
          delaiMinutes: o.delaiMinutes,
          motif: 'Valeurs de démonstration (mêmes valeurs par défaut que scripts/backfill-kpi.ts)',
          creeParId: adminId,
        },
      });
    }
  }
  const seuils = [
    { typeAlerte: 'PROCHE_CIBLE', valeur: 80 },
    { typeAlerte: 'ACCUMULATION', valeur: 20 },
    { typeAlerte: 'DEGRADATION', valeur: 10 },
    { typeAlerte: 'HAUSSE_RETOURS', valeur: 10 },
  ];
  for (const s of seuils) {
    await db.seuilAlerteKpi.upsert({
      where: { service_typeAlerte: { service: 'GLOBAL', typeAlerte: s.typeAlerte } },
      create: { service: 'GLOBAL', typeAlerte: s.typeAlerte, valeur: s.valeur },
      update: {},
    });
  }
}

// ─── 4. Sociétés cibles + liaisons portails ──────────────────────────────────

interface SocieteCible {
  id: string;
  nom: string;
  contactEmail: string;
  portailEmail: string;
  cle: string;
}

async function resoudreSocietesCibles(): Promise<SocieteCible[]> {
  const cibles: SocieteCible[] = [];
  for (const cfg of SOCIETES_DEMO) {
    const nomNormalise = normaliserNom(cfg.nom);
    const soc = await db.societe.findFirst({
      where: { OR: [{ nom: cfg.nom }, { nomNormalise }] },
      orderBy: { createdAt: 'asc' },
    });
    if (!soc) continue; // la société n'existe pas dans ce jeu de données
    cibles.push({ id: soc.id, nom: soc.nom, contactEmail: cfg.contactEmail, portailEmail: cfg.portailEmail, cle: cfg.nom.split(' ')[0] });
  }
  if (cibles.length > 0) return cibles;

  // Repli : dataset inconnu (ex : npm run db:seed seul) — rattacher les
  // portails aux premières sociétés existantes, de façon déterministe.
  const fallback = await db.societe.findMany({ orderBy: { createdAt: 'asc' }, take: SOCIETES_DEMO.length });
  return fallback.map((s, i) => ({
    id: s.id,
    nom: s.nom,
    contactEmail: SOCIETES_DEMO[i % SOCIETES_DEMO.length].contactEmail,
    portailEmail: SOCIETES_DEMO[i % SOCIETES_DEMO.length].portailEmail,
    cle: SOCIETES_DEMO[i % SOCIETES_DEMO.length].nom.split(' ')[0],
  }));
}

/** Assuré dédié portant l'e-mail du compte PORTAIL_CLIENT (liaison login). */
async function assurerAssurePortail(soc: SocieteCible): Promise<boolean> {
  const existant = await db.assure.findFirst({
    where: { email: { equals: soc.portailEmail, mode: 'insensitive' } },
  });
  if (existant) return existant.societeId === soc.id;
  const index = SOCIETES_DEMO.findIndex((s) => s.portailEmail === soc.portailEmail) + 1;
  const [prenom, nom] = soc.portailEmail.includes('sanlam') ? ['Tiana', 'Rasoanaivo']
    : soc.portailEmail.includes('telma') ? ['Lova', 'Randrianasolo']
    : soc.portailEmail.includes('jirama') ? ['Aline', 'Rakotoarisoa']
    : soc.portailEmail.includes('airtel') ? ['Sitraka', 'Mananjara']
    : ['Vololona', 'Rajaonarivelo'];
  await db.assure.create({
    data: {
      societeId: soc.id,
      nom,
      prenom,
      nSS: `SS-9${String(index).padStart(5, '0')}`,
      matricule: `MAT-PORT-${String(index).padStart(4, '0')}`,
      typeBeneficiaire: 'ASSURE',
      dateNaissance: new Date('1990-01-15'),
      sexe: index % 2 === 0 ? 'F' : 'M',
      dateEffet: new Date('2026-01-01'),
      telephone: '+261 34 00 000 0' + index,
      email: soc.portailEmail,
      adresse: 'Antananarivo, Madagascar',
      actif: true,
    },
  });
  return true;
}

/** Liaison CONTACT_ENTREPRISE : les 3 sources, sinon fiche contact créée. */
async function assurerLiaisonContact(soc: SocieteCible): Promise<string> {
  const liaison = await resoudreLiaisonContactEntreprise(soc.contactEmail);
  if (liaison) return liaison.source;
  const nomContact = soc.contactEmail.split('@')[0].replace(/[._]/g, ' ');
  await db.entrepriseContact.create({
    data: {
      societeId: soc.id,
      nom: nomContact,
      fonction: 'Responsable RH',
      email: soc.contactEmail,
      actif: true,
    },
  });
  return 'CONTACT (fiche créée)';
}

/** Fiche Prestataire portant l'e-mail de facturation du compte. */
async function assurerFichePrestataire(
  cfg: (typeof PRESTATAIRES_DEMO)[number],
  societes: SocieteCible[],
): Promise<{ id: string; email: string } | null> {
  const controle = await resoudreLiaisonPrestataireAvecControle(cfg.email);
  if (controle.statut === 'OK') {
    const fiche = await db.prestataire.findUnique({ where: { id: controle.prestataireId } });
    if (fiche) return { id: fiche.id, email: fiche.email ?? cfg.email };
  }
  const nomNormalise = normaliserNom(cfg.nom);
  let fiche = await db.prestataire.findFirst({
    where: { OR: [{ nom: cfg.nom }, { nomNormalise }] },
    orderBy: { createdAt: 'asc' },
  });
  if (fiche) {
    if (!fiche.email) {
      fiche = await db.prestataire.update({ where: { id: fiche.id }, data: { email: cfg.email } });
    }
    return { id: fiche.id, email: fiche.email ?? cfg.email };
  }
  fiche = await db.prestataire.create({
    data: {
      nom: cfg.nom,
      nomNormalise,
      type: cfg.type,
      email: cfg.email,
      statut: 'CONVENTIONNE',
      actif: true,
    },
  });
  console.log(`  + fiche prestataire créée : ${fiche.nom} (${cfg.email})`);
  // Conventions avec les deux premières sociétés cibles (pour le portail).
  for (const soc of societes.slice(0, 2)) {
    await db.prestataireSociete.upsert({
      where: { prestataireId_societeId: { prestataireId: fiche.id, societeId: soc.id } },
      update: { actif: true },
      create: { prestataireId: fiche.id, societeId: soc.id, actif: true },
    });
  }
  return { id: fiche.id, email: cfg.email };
}

// ─── 5. Étapes de traitement KPI (données réelles par collaborateur) ─────────

interface DossierKpi {
  id: string;
  numeroDossier: string;
  statut: string;
  dateReception: Date;
  dateTraitementTechnique: Date | null;
  dateReceptionDecompte: Date | null;
  gestionnaireAccueilId: string | null;
  gestionnaireTechniqueId: string | null;
  gestionnaireComptaId: string | null;
  gestionnaireControleMedicalId: string | null;
  categorieDossier: string | null;
  typeDossier: string;
}

const MOTIFS_RETOUR = [
  'Pièce justificative illisible — retour à l\u2019accueil',
  'Décompte incohérent avec le barème appliqué',
  'Montant réclamé non conforme à la facture',
];
const MOTIF_SUSPENSION = 'Attente de pièce justificative du prestataire';

type Rotation = Record<ServiceDemo, string[]>;

async function semerEtapesKpi(
  rotation: Rotation,
  gestionnaires: Record<ServiceDemo, { id: string; nom: string }>,
): Promise<{ creees: number; parUser: Map<string, number> }> {
  // Uniquement des dossiers SANS étape (idempotence) — jamais les dossiers
  // déjà tracés par le circuit applicatif ou un backfill antérieur.
  const dossiers = await db.dossier.findMany({
    where: { etapesKpi: { none: {} } },
    orderBy: { createdAt: 'desc' },
    take: MAX_DOSSIERS,
    select: {
      id: true, numeroDossier: true, statut: true, dateReception: true,
      dateTraitementTechnique: true, dateReceptionDecompte: true,
      gestionnaireAccueilId: true, gestionnaireTechniqueId: true, gestionnaireComptaId: true,
      gestionnaireControleMedicalId: true, categorieDossier: true, typeDossier: true,
    },
  });

  const parUser = new Map<string, number>();
  const compter = (userId: string | null) => {
    if (!userId) return;
    parUser.set(userId, (parUser.get(userId) ?? 0) + 1);
  };
  const choisir = (liste: string[], graine: string) =>
    liste.length > 0 ? liste[(hashGraine(graine) >>> 0) % liste.length] : null;

  let creees = 0;
  for (const d of dossiers) {
    const r = rng(d.numeroDossier);
    const statut = d.statut;
    const terminal = statut === 'PAYE' || statut === 'REJETE';

    // ── ACCUEIL ────────────────────────────────────────────────────────────
    const userAcc = choisir(rotation.ACCUEIL, d.numeroDossier + '-acc');
    const gestAcc = d.gestionnaireAccueilId ?? gestionnaires.ACCUEIL.id;
    if (statut === 'RECU') {
      await db.etapeTraitement.create({
        data: {
          dossierId: d.id, service: 'ACCUEIL', userId: userAcc, gestionnaireId: gestAcc,
          type: 'TRAVAIL', source: 'MIGRATION', statutAvant: 'RECU',
          dateAffectation: d.dateReception, dateDebut: plus(d.dateReception, min(entre(3, 10))),
        },
      });
    } else {
      const finAcc = plus(d.dateReception, min(entre(8, 26)));
      await db.etapeTraitement.create({
        data: {
          dossierId: d.id, service: 'ACCUEIL', userId: userAcc, gestionnaireId: gestAcc,
          type: 'TRAVAIL', source: 'MIGRATION', statutAvant: 'RECU', statutApres: 'EN_ANALYSE',
          dateAffectation: d.dateReception, dateDebut: plus(d.dateReception, min(2)), dateFin: finAcc,
        },
      });
    }
    compter(userAcc);
    creees++;

    // ── TECHNIQUE (dès que le dossier a quitté RECU) ───────────────────────
    if (statut !== 'RECU') {
      const ancreTec = d.dateTraitementTechnique ?? plus(d.dateReception, min(45));
      const userTec = choisir(rotation.TECHNIQUE, d.numeroDossier + '-tec');
      const gestTec = d.gestionnaireTechniqueId ?? gestionnaires.TECHNIQUE.id;
      const ouvertTec = statut === 'EN_ANALYSE' || statut === 'VALIDE';
      const dureeTec = r() < 0.7 ? entre(60, 200) : entre(270, 420); // vs objectif 240
      const dataTec: Prisma.EtapeTraitementUncheckedCreateInput = {
        dossierId: d.id, service: 'TECHNIQUE', userId: userTec, gestionnaireId: gestTec,
        type: 'TRAVAIL', source: 'MIGRATION', statutAvant: 'EN_ANALYSE',
        dateAffectation: ancreTec, dateDebut: plus(ancreTec, min(entre(5, 25))),
      };
      if (!ouvertTec) {
        dataTec.dateFin = plus(ancreTec, min(dureeTec));
        dataTec.statutApres = statut === 'REJETE' ? 'REJETE' : 'EN_COMPTABILITE';
      }
      const etapeTec = await db.etapeTraitement.create({ data: dataTec });
      compter(userTec);
      creees++;

      // Retour pour correction (événement tracé, ~10 % des dossiers analysés)
      if (r() < 0.1) {
        const base = etapeTec.dateFin ?? plus(ancreTec, min(120));
        await db.etapeTraitement.create({
          data: {
            dossierId: d.id, service: 'TECHNIQUE', userId: userTec, gestionnaireId: gestTec,
            type: 'RETOUR_CORRECTION', source: 'MIGRATION',
            statutAvant: 'EN_ANALYSE', statutApres: 'EN_ANALYSE',
            dateAffectation: base, dateDebut: base, dateFin: plus(base, min(entre(15, 60))),
            motifRetour: MOTIFS_RETOUR[entre(0, MOTIFS_RETOUR.length - 1)],
          },
        });
        creees++;
      }

      // Suspension (~12 % des étapes fermées) — durée exclue du temps actif
      if (!ouvertTec && r() < 0.12 && userTec) {
        const etapeCreee = await db.etapeTraitement.findFirst({
          where: { dossierId: d.id, service: 'TECHNIQUE', type: 'TRAVAIL' },
          orderBy: { createdAt: 'desc' },
        });
        if (etapeCreee?.dateDebut && etapeCreee.dateFin) {
          const suspenduA = plus(etapeCreee.dateDebut, min(entre(20, 60)));
          if (suspenduA < etapeCreee.dateFin) {
            await db.etapeSuspension.create({
              data: {
                etapeId: etapeCreee.id, motif: MOTIF_SUSPENSION,
                suspenduA,
                reprisA: plus(suspenduA, min(entre(60, 240))),
                parId: userTec,
              },
            });
          }
        }
      }

      // ── COMPTABILITÉ (dossiers transmis au décompte) ─────────────────────
      if (['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)) {
        const ancreCpt = d.dateReceptionDecompte ?? plus(ancreTec, min(dureeTec + 30));
        const userCpt = choisir(rotation.COMPTABILITE, d.numeroDossier + '-cpt');
        const gestCpt = d.gestionnaireComptaId ?? gestionnaires.COMPTABILITE.id;
        const ouvertCpt = statut !== 'PAYE';
        const dureeCpt = r() < 0.75 ? entre(35, 105) : entre(135, 210); // vs objectif 120
        const dataCpt: Prisma.EtapeTraitementUncheckedCreateInput = {
          dossierId: d.id, service: 'COMPTABILITE', userId: userCpt, gestionnaireId: gestCpt,
          type: 'TRAVAIL', source: 'MIGRATION', statutAvant: 'EN_COMPTABILITE',
          dateAffectation: ancreCpt, dateDebut: plus(ancreCpt, min(entre(4, 18))),
        };
        if (!ouvertCpt) {
          dataCpt.dateFin = plus(ancreCpt, min(dureeCpt));
          dataCpt.statutApres = 'PAYE';
        }
        await db.etapeTraitement.create({ data: dataCpt });
        compter(userCpt);
        creees++;
      }

      // ── CONTRÔLE MÉDICAL (hors circuit : phases explicites) ──────────────
      const cibleControle =
        d.categorieDossier === 'REGLEMENT_PRESTATAIRE' ||
        d.typeDossier.startsWith('HOSPITALISATION') ||
        d.typeDossier.startsWith('ACCOUCHEMENT') ||
        r() < 0.22;
      if (cibleControle) {
        const gestCm = d.gestionnaireControleMedicalId ?? gestionnaires.CONTROLE_MEDICAL.id;
        if (!d.gestionnaireControleMedicalId) {
          await db.dossier.update({
            where: { id: d.id },
            data: { gestionnaireControleMedicalId: gestCm },
          });
        }
        const userCm = choisir(rotation.CONTROLE_MEDICAL, d.numeroDossier + '-cm');
        const ouvertCm = statut === 'EN_ANALYSE' || statut === 'VALIDE';
        const ancreCm = plus(ancreTec, min(entre(30, 120)));
        const dataCm: Prisma.EtapeTraitementUncheckedCreateInput = {
          dossierId: d.id, service: 'CONTROLE_MEDICAL', userId: userCm, gestionnaireId: gestCm,
          type: 'TRAVAIL', source: 'MIGRATION',
          dateAffectation: ancreCm, dateDebut: plus(ancreCm, min(entre(5, 30))),
        };
        if (!ouvertCm) {
          dataCm.dateFin = plus(ancreCm, min(entre(50, 300)));
          dataCm.statutAvant = 'EN_ANALYSE';
          dataCm.statutApres = statut === 'REJETE' ? 'REJETE' : null;
        }
        await db.etapeTraitement.create({ data: dataCm });
        compter(userCm);
        creees++;
      }
    }
  }
  return { creees, parUser };
}

function hashGraine(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// ─── Programme principal ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.env.SEED_DEMO !== 'OUI') {
    console.error('❌ Sécurité : ce seed modifie les comptes de la base courante.');
    console.error('   Confirmez avec : SEED_DEMO=OUI npx tsx prisma/seed-demo.ts');
    console.error('   (à réserver aux environnements de développement / test)');
    process.exit(1);
  }
  console.log('🌱 COMPTES DE DÉMONSTRATION — Suivi Santé\n');

  const users = await semerComptes();
  console.log(`  ✅ ${COMPTES_DEMO.length} comptes assurés (créés ou complétés, aucun mot de passe existant écrasé)`);

  const gestionnaires = await semerGestionnaires();
  console.log(`  ✅ référentiel gestionnaires : un gestionnaire par service (dont CONTROLE_MEDICAL)`);

  const admin = users.get('admin@suivisante.mg');
  if (!admin) throw new Error('Compte administrateur introuvable après seed');
  await semerReferentielKpi(admin.id);
  console.log('  ✅ référentiel KPI : objectifs par service + seuils GLOBAL');

  // ── Liaisons externes ─────────────────────────────────────────────────────
  const societes = await resoudreSocietesCibles();
  console.log(`\n🔗 LIAISONS PORTAILS (${societes.length} sociétés cibles)`);
  for (const soc of societes) {
    const assureOk = await assurerAssurePortail(soc);
    const sourceContact = await assurerLiaisonContact(soc);
    console.log(`  • ${soc.nom} : assuré portail ${assureOk ? 'OK' : 'DÉCALÉ (autre société — à vérifier)'} ; liaison entreprise = ${sourceContact}`);
    chk(`liaison PORTAIL_CLIENT + CONTACT_ENTREPRISE : ${soc.cle}`, assureOk);
  }
  for (const cfg of PRESTATAIRES_DEMO) {
    const fiche = await assurerFichePrestataire(cfg, societes);
    chk(`fiche prestataire + e-mail de liaison : ${cfg.email}`, !!fiche);
  }

  // ── Étapes KPI ────────────────────────────────────────────────────────────
  const rotation: Rotation = {
    ACCUEIL: emailsDemoParService('ACCUEIL').map((e) => users.get(emailDemoNormalise(e))!.id),
    TECHNIQUE: emailsDemoParService('TECHNIQUE').map((e) => users.get(emailDemoNormalise(e))!.id),
    COMPTABILITE: emailsDemoParService('COMPTABILITE').map((e) => users.get(emailDemoNormalise(e))!.id),
    CONTROLE_MEDICAL: emailsDemoParService('CONTROLE_MEDICAL').map((e) => users.get(emailDemoNormalise(e))!.id),
  };
  console.log('\n⏱️  ÉTAPES DE TRAITEMENT (KPI collaborateurs)');
  const { creees, parUser } = await semerEtapesKpi(rotation, gestionnaires);
  console.log(`  ✅ ${creees} étapes créées (dossiers sans étape uniquement — limite ${MAX_DOSSIERS})`);
  const emailParId = new Map([...users.entries()].map(([email, v]) => [v.id, email]));
  for (const [userId, n] of [...parUser.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     - ${emailParId.get(userId) ?? userId} : ${n} étape(s)`);
  }

  // ── Vérifications intégrées ───────────────────────────────────────────────
  console.log('\n🔍 VÉRIFICATIONS INTÉGRÉES');
  for (const compte of COMPTES_DEMO) {
    const u = await db.utilisateur.findUnique({ where: { email: compte.email } });
    const roleOk = u?.role === compte.role;
    const serviceOk = compte.role !== 'RESPONSABLE_SERVICE'
      || u?.serviceResponsable === compte.serviceResponsable;
    chk(`compte ${compte.email} (${compte.role}${compte.role === 'RESPONSABLE_SERVICE' ? '/' + (compte.serviceResponsable ?? '') : ''})`, !!u && roleOk && serviceOk);
  }
  for (const service of ['ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const) {
    const n = await db.objectifDelai.count({ where: { service, typeDossier: null, valideAu: null } });
    chk(`objectif de délai en vigueur : ${service}`, n === 1);
  }
  chk('seuils d\u2019alerte GLOBAL (4 types)', (await db.seuilAlerteKpi.count({ where: { service: 'GLOBAL' } })) === 4);
  const gestCm = await db.gestionnaire.count({ where: { service: 'CONTROLE_MEDICAL' } });
  chk('gestionnaire(s) CONTROLE_MEDICAL dans le référentiel', gestCm >= 1);
  for (const service of ['ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const) {
    const n = await db.etapeTraitement.count({ where: { service } });
    chk(`étapes ${service} présentes pour les KPI (${n})`, n > 0);
  }
  // Chaque collaborateur du circuit a au moins une étape (KPI individuels)
  for (const service of ['ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const) {
    for (const email of emailsDemoParService(service)) {
      const id = users.get(emailDemoNormalise(email))?.id;
      const n = id ? await db.etapeTraitement.count({ where: { userId: id } }) : 0;
      if (n === 0) {
        console.log(`  ⚠️  ${email} : aucune étape — ajouter des dossiers puis relancer (SEED_DEMO_MAX_DOSSIERS)`);
      }
    }
  }
  const sansGestionnaireCm = await db.dossier.count({
    where: { gestionnaireControleMedicalId: null, statut: { notIn: ['RECU', 'REJETE'] }, typeDossier: { startsWith: 'HOSPITALISATION' } },
  });
  if (sansGestionnaireCm > 0) {
    console.log(`  ⚠️  ${sansGestionnaireCm} dossier(s) hospitalisation encore sans gestionnaire de contrôle médical (hors fenêtre de traitement)`);
  }

  const echecs = checks.filter(([, ok]) => !ok);
  if (echecs.length) {
    throw new Error(`${echecs.length} vérification(s) en échec : ${echecs.map(([l]) => l).join(' | ')}`);
  }

  console.log('\n🔑 COMPTES DE DÉMONSTRATION (mot de passe à la création — interne SuiviSante@2026, externe Contact@2026) :');
  for (const c of COMPTES_DEMO) {
    console.log(`  ${c.role.padEnd(20)} ${c.email.padEnd(38)} ${c.service}`);
  }
  console.log('\n🎉 COMPTES DE DÉMONSTRATION PRÊTS (seed idempotent — ré-exécutable sans effet de bord)');
}

main()
  .catch((e) => { console.error('\n❌ ÉCHEC :', e); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
