/**
 * comptes-demo.ts — Catalogue des comptes de DÉMONSTRATION (module PUR).
 * ────────────────────────────────────────────────────────────────────────────
 * Source de vérité partagée par :
 *   - prisma/seed-demo.ts (création / complétion idempotente des comptes) ;
 *   - les tests de non-régression (matrice de permissions par rôle) ;
 *   - la documentation docs/comptes-demonstration.md.
 *
 * RÈGLES :
 *   - Aucun mot de passe ici : le catalogue porte uniquement une catégorie
 *     (« INTERNE » / « EXTERNE »). Les mots de passe de démonstration sont
 *     posés À LA CRÉATION par prisma/seed-demo.ts (jamais sur un compte
 *     existant sans l'option explicite REINIT_MDP_DEMO) et ne vivent que
 *     pour les environnements de développement / test.
 *   - Uniquement des rôles du référentiel ROLES (src/lib/referentiels.ts) :
 *     aucun rôle hors référentiel (le login est fail-closed, un rôle inconnu
 *     refuse la connexion — src/lib/auth.ts).
 *   - Un compte « existant » (existant: true) est présent dans les seeds
 *     historiques (prisma/seed.ts, scripts/reset_seed.mjs) : seed-demo ne
 *     le COMPLÈTE jamais en écrasant son mot de passe, il aligne seulement
 *     rôle / service / état actif si nécessaire.
 *   - Aucune dépendance Node ni Prisma : module réutilisable partout.
 */

import { ROLES } from './referentiels';

/** Rôles internes habilités aux vues d'entreprise (miroir de auth-context). */
export type RoleDemo =
  | 'ADMINISTRATEUR'
  | 'DIRECTION_GENERALE'
  | 'RESPONSABLE_SERVICE'
  | 'ACCUEIL'
  | 'TECHNIQUE'
  | 'COMPTABILITE'
  | 'SANTE'
  | 'PORTAIL_CLIENT'
  | 'CONTACT_ENTREPRISE'
  | 'PRESTATAIRE';

/** Services du référentiel des gestionnaires (Gestionnaire.service). */
export const SERVICES_DEMO = ['ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'CONTROLE_MEDICAL'] as const;
export type ServiceDemo = (typeof SERVICES_DEMO)[number];

export interface CompteDemo {
  /** Identifiant de connexion (e-mail) — clé d'idempotence du seed. */
  email: string;
  /** Nom affiché dans l'application. */
  nom: string;
  /** Rôle du référentiel (ROLES) — jamais un rôle inventé. */
  role: RoleDemo;
  /** Service géré — UNIQUEMENT pour le rôle RESPONSABLE_SERVICE (R2). */
  serviceResponsable?: ServiceDemo;
  /** INTERNE : personnel de la caisse · EXTERNE : portails client/prestataire. */
  categorie: 'INTERNE' | 'EXTERNE';
  /** Service / fonction métier (libellé documentaire). */
  service: string;
  /** Modules et opérations que le compte sert à tester. */
  usage: string;
  /** true = compte déjà créé par seed.ts / reset_seed.mjs : conserver, compléter sans écraser le mot de passe. */
  existant?: boolean;
  /** true = jamais de réinitialisation de mot de passe (compte partagé de référence). */
  motDePasseVerrouille?: boolean;
}

/**
 * Comptes internes de démonstration — couverture complète des profils du
 * circuit (Accueil 1, Technique 5, Contrôle santé 3, Comptabilité/Finance 4,
 * Direction générale 1, Responsables de service 4, Administrateur 1).
 */
export const COMPTES_INTERNES_DEMO: CompteDemo[] = [
  {
    email: 'admin@suivisante.mg',
    nom: 'Administrateur Système',
    role: 'ADMINISTRATEUR',
    categorie: 'INTERNE',
    service: 'Administration',
    usage: 'Paramétrage complet : utilisateurs, sociétés, contrats, barèmes, permissions, journal de bord, objectifs et seuils KPI',
    existant: true,
    motDePasseVerrouille: true,
  },
  {
    email: 'accueil@suivisante.mg',
    nom: 'Ravao Andrianjaka',
    role: 'ACCUEIL',
    categorie: 'INTERNE',
    service: 'Accueil',
    usage: 'Réception, import, affectation, transmission, kanban, dossiers en attente, Ma Performance',
    existant: true,
  },
  {
    email: 'technique@suivisante.mg',
    nom: 'Jean-Pierre Rakoto',
    role: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Service Technique',
    usage: 'Dossiers affectés, analyse, validation, rejet, barèmes, prestataires, KPI individuels',
    existant: true,
  },
  {
    email: 'technique2@suivisante.mg',
    nom: 'Haingo Tovono',
    role: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Service Technique',
    usage: 'Collaborateur technique n°2 : analyse/validation/retour de dossiers, KPI individuels',
  },
  {
    email: 'technique3@suivisante.mg',
    nom: 'Sitraka Mamy',
    role: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Service Technique',
    usage: 'Collaborateur technique n°3 : analyse/validation/retour de dossiers, KPI individuels',
  },
  {
    email: 'technique4@suivisante.mg',
    nom: 'Lova Nirina',
    role: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Service Technique',
    usage: 'Collaborateur technique n°4 : analyse/validation/retour de dossiers, KPI individuels',
  },
  {
    email: 'technique5@suivisante.mg',
    nom: 'Fenitra Koto',
    role: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Service Technique',
    usage: 'Collaborateur technique n°5 : analyse/validation/retour de dossiers, KPI individuels',
  },
  {
    email: 'compta@suivisante.mg',
    nom: 'Marie Rasoa',
    role: 'COMPTABILITE',
    categorie: 'INTERNE',
    service: 'Comptabilité',
    usage: 'Dossiers validés, comptabilisation, contrôles, transmission finance, KPI individuels',
    existant: true,
  },
  {
    email: 'compta2@suivisante.mg',
    nom: 'Tahiry Vola',
    role: 'COMPTABILITE',
    categorie: 'INTERNE',
    service: 'Comptabilité',
    usage: 'Comptabilisation n°2 : décomptes, contrôles comptables, KPI individuels',
  },
  {
    email: 'finance1@suivisante.mg',
    nom: 'Ony Dimby',
    role: 'COMPTABILITE',
    categorie: 'INTERNE',
    service: 'Finance (rôle COMPTABILITE)',
    usage: 'Finance n°1 : appels de fonds, paiements, reporting, suivi des règlements, KPI individuels',
  },
  {
    email: 'finance2@suivisante.mg',
    nom: 'Hasina Vero',
    role: 'COMPTABILITE',
    categorie: 'INTERNE',
    service: 'Finance (rôle COMPTABILITE)',
    usage: 'Finance n°2 : appels de fonds, paiements, reporting, montants payés / restant à payer, KPI individuels',
  },
  {
    email: 'sante@suivisante.mg',
    nom: 'Dr. Nahitra Raza',
    role: 'SANTE',
    categorie: 'INTERNE',
    service: 'Contrôle médical',
    usage: 'Contrôle médical (début/fin), validation/rejet, vérification assuré, simulation d\u2019acte, KPI individuels',
    existant: true,
  },
  {
    email: 'sante2@suivisante.mg',
    nom: 'Dr. Soa Eric',
    role: 'SANTE',
    categorie: 'INTERNE',
    service: 'Contrôle médical',
    usage: 'Contrôle médical n°2 : dossiers assignés, contrôle/validation/rejet, KPI individuels',
  },
  {
    email: 'utilisateur@suivisante.mg',
    nom: 'Andry Faly',
    role: 'SANTE',
    categorie: 'INTERNE',
    service: 'Contrôle médical',
    usage: 'Compte historique du seed de base — vérification assuré et contrôle médical',
    existant: true,
  },
  {
    email: 'dg@suivisante.mg',
    nom: 'Rasoanaivo Zo',
    role: 'DIRECTION_GENERALE',
    categorie: 'INTERNE',
    service: 'Direction générale',
    usage: 'Tableau de bord direction : KPI collaborateurs (consultation globale), alertes, exports, Ma Performance',
  },
  {
    email: 'rs-accueil@suivisante.mg',
    nom: 'Ravao Hanta',
    role: 'RESPONSABLE_SERVICE',
    serviceResponsable: 'ACCUEIL',
    categorie: 'INTERNE',
    service: 'Chef de service — Accueil',
    usage: 'KPI collaborateurs bornés au service ACCUEIL (périmètre forcé côté serveur), Ma Performance',
  },
  {
    email: 'rs-technique@suivisante.mg',
    nom: 'Rakoto Jean-Claude',
    role: 'RESPONSABLE_SERVICE',
    serviceResponsable: 'TECHNIQUE',
    categorie: 'INTERNE',
    service: 'Chef de service — Technique',
    usage: 'KPI collaborateurs bornés au service TECHNIQUE (périmètre forcé côté serveur), Ma Performance',
  },
  {
    email: 'rs-controle-medical@suivisante.mg',
    nom: 'Dr. Razafi Miora',
    role: 'RESPONSABLE_SERVICE',
    serviceResponsable: 'CONTROLE_MEDICAL',
    categorie: 'INTERNE',
    service: 'Chef de service — Contrôle médical',
    usage: 'KPI collaborateurs bornés au service CONTROLE_MEDICAL (périmètre forcé côté serveur)',
  },
  {
    email: 'rs-comptabilite@suivisante.mg',
    nom: 'Rasolofa Nirina',
    role: 'RESPONSABLE_SERVICE',
    serviceResponsable: 'COMPTABILITE',
    categorie: 'INTERNE',
    service: 'Chef de service — Comptabilité',
    usage: 'KPI collaborateurs bornés au service COMPTABILITE (périmètre forcé côté serveur), Ma Performance',
  },
];

/**
 * Comptes externes — un par société cliente (CONTACT_ENTREPRISE via les 3
 * sources de liaison, PORTAIL_CLIENT via un assuré dédié portant l\u2019e-mail)
 * et un par prestataire de démonstration (PRESTATAIRE, liaison par e-mail de
 * facturation de la fiche — src/lib/liaison-prestataire.ts).
 */
export const COMPTES_EXTERNES_DEMO: CompteDemo[] = [
  {
    email: 'contact.sanlam@sanlam.mg',
    nom: 'Hery Rakotomalala',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'EXTERNE',
    service: 'Société SANLAM (liaison par contact déclaré)',
    usage: 'Portail entreprise : assurés, dossiers et contrats de SA société uniquement',
    existant: true,
  },
  {
    email: 'contact.telma@telma.mg',
    nom: 'Voahangy Ravelomanana',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'EXTERNE',
    service: 'Société TELMA (liaison par e-mail du contact principal)',
    usage: 'Portail entreprise : isolation par la source « Societe.emailContactPrincipal »',
    existant: true,
  },
  {
    email: 'j.rakotoarison@jirama.mg',
    nom: 'Jean-Claude Rakotoarison',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'EXTERNE',
    service: 'Société JIRAMA (liaison par e-mail général de la société)',
    usage: 'Portail entreprise : isolation par la source « Societe.email »',
    existant: true,
  },
  {
    email: 'contact.airtel@airtel.mg',
    nom: 'Fenosoa Andriamampionona',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'EXTERNE',
    service: 'Société AIRTEL (liaison par contact déclaré)',
    usage: 'Portail entreprise : dossiers et assurés de SA société uniquement',
    existant: true,
  },
  {
    email: 'contact.bni@bni.mg',
    nom: 'Tojo Randrianarivelo',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'EXTERNE',
    service: 'Société BNI (liaison par contact déclaré)',
    usage: 'Portail entreprise : dossiers et assurés de SA société uniquement',
    existant: true,
  },
  {
    email: 'portail.sanlam@suivisante.mg',
    nom: 'Tiana Rasoanaivo',
    role: 'PORTAIL_CLIENT',
    categorie: 'EXTERNE',
    service: 'Assuré SANLAM',
    usage: 'Portail assuré : ses dossiers, ses ayants droit, son barème — jamais les autres sociétés',
    existant: true,
  },
  {
    email: 'portail.telma@suivisante.mg',
    nom: 'Lova Randrianasolo',
    role: 'PORTAIL_CLIENT',
    categorie: 'EXTERNE',
    service: 'Assuré TELMA',
    usage: 'Portail assuré : ses dossiers, ses ayants droit, son barème',
    existant: true,
  },
  {
    email: 'portail.jirama@suivisante.mg',
    nom: 'Aline Rakotoarisoa',
    role: 'PORTAIL_CLIENT',
    categorie: 'EXTERNE',
    service: 'Assuré JIRAMA',
    usage: 'Portail assuré JIRAMA : ses dossiers uniquement (compte ajouté)',
  },
  {
    email: 'portail.airtel@suivisante.mg',
    nom: 'Sitraka Mananjara',
    role: 'PORTAIL_CLIENT',
    categorie: 'EXTERNE',
    service: 'Assuré AIRTEL',
    usage: 'Portail assuré AIRTEL : ses dossiers uniquement (compte ajouté)',
  },
  {
    email: 'portail.bni@suivisante.mg',
    nom: 'Vololona Rajaonarivelo',
    role: 'PORTAIL_CLIENT',
    categorie: 'EXTERNE',
    service: 'Assuré BNI',
    usage: 'Portail assuré BNI : ses dossiers uniquement (compte ajouté)',
  },
  {
    email: 'contact@clinique-saintemarie.mg',
    nom: 'Clinique Sainte Marie',
    role: 'PRESTATAIRE',
    categorie: 'EXTERNE',
    service: 'Prestataire — Clinique Sainte Marie',
    usage: 'Portail prestataire : ses dossiers, ses sociétés conventionnées, ses factures',
    existant: true,
  },
  {
    email: 'facturation@hopital-principal.mg',
    nom: 'Hôpital Principal HJ Anosy',
    role: 'PRESTATAIRE',
    categorie: 'EXTERNE',
    service: 'Prestataire — Hôpital Principal HJ Anosy',
    usage: 'Portail prestataire : ses dossiers, ses sociétés conventionnées, ses factures',
    existant: true,
  },
];

/** Catalogue complet (internes puis externes). */
export const COMPTES_DEMO: CompteDemo[] = [...COMPTES_INTERNES_DEMO, ...COMPTES_EXTERNES_DEMO];

/** Sociétés cibles du jeu de démonstration (scripts/reset_seed.mjs). */
export const SOCIETES_DEMO = [
  { nom: 'SANLAM MADAGASCAR ASSURANCE', contactEmail: 'contact.sanlam@sanlam.mg', portailEmail: 'portail.sanlam@suivisante.mg' },
  { nom: 'TELMA MADAGASCAR', contactEmail: 'contact.telma@telma.mg', portailEmail: 'portail.telma@suivisante.mg' },
  { nom: 'JIRAMA', contactEmail: 'j.rakotoarison@jirama.mg', portailEmail: 'portail.jirama@suivisante.mg' },
  { nom: 'AIRTEL MADAGASCAR', contactEmail: 'contact.airtel@airtel.mg', portailEmail: 'portail.airtel@suivisante.mg' },
  { nom: 'BNI MADAGASCAR', contactEmail: 'contact.bni@bni.mg', portailEmail: 'portail.bni@suivisante.mg' },
] as const;

/** Fiches prestataires de démonstration (e-mail de facturation = identifiant de liaison). */
export const PRESTATAIRES_DEMO = [
  { nom: 'Clinique Sainte Marie', email: 'contact@clinique-saintemarie.mg', type: 'CLINIQUE' },
  { nom: 'Hôpital Principal HJ Anosy', email: 'facturation@hopital-principal.mg', type: 'HOPITAL' },
] as const;

/** Rôles des comptes techniques du circuit (attribution des étapes KPI). */
export const ROLE_PAR_SERVICE_DEMO: Record<ServiceDemo, RoleDemo> = {
  ACCUEIL: 'ACCUEIL',
  TECHNIQUE: 'TECHNIQUE',
  COMPTABILITE: 'COMPTABILITE',
  CONTROLE_MEDICAL: 'SANTE',
};

/** Normalisation d'e-mail (miroir de login-policy — comparaison stable). */
export function emailDemoNormalise(email: string): string {
  return email.trim().toLowerCase();
}

/** Garde-fous structurels du catalogue — levés en erreur par les tests. */
export function validerCatalogueDemo(): string[] {
  const erreurs: string[] = [];
  const vus = new Set<string>();
  for (const c of COMPTES_DEMO) {
    const email = emailDemoNormalise(c.email);
    if (vus.has(email)) erreurs.push(`e-mail en doublon : ${c.email}`);
    vus.add(email);
    if (!(ROLES as readonly string[]).includes(c.role)) {
      erreurs.push(`rôle hors référentiel : ${c.role} (${c.email})`);
    }
    if (c.role === 'RESPONSABLE_SERVICE') {
      if (!c.serviceResponsable || !SERVICES_DEMO.includes(c.serviceResponsable)) {
        erreurs.push(`RESPONSABLE_SERVICE sans service valide : ${c.email}`);
      }
    } else if (c.serviceResponsable) {
      erreurs.push(`serviceResponsable défini hors rôle RESPONSABLE_SERVICE : ${c.email}`);
    }
    if (c.role === 'PORTAIL_CLIENT' && !c.email.endsWith('@suivisante.mg')) {
      erreurs.push(`PORTAIL_CLIENT sans e-mail de liaison assuré dédié : ${c.email}`);
    }
    if (c.categorie === 'INTERNE' && !c.email.endsWith('@suivisante.mg')) {
      erreurs.push(`compte interne hors domaine de démonstration : ${c.email}`);
    }
  }
  return erreurs;
}

/** Emails des comptes de démonstration par service (rotation des étapes KPI). */
export function emailsDemoParService(service: ServiceDemo): string[] {
  const role = ROLE_PAR_SERVICE_DEMO[service];
  // Le rôle cible est toujours un rôle de collaborateur du circuit : ni
  // ADMINISTRATEUR, ni DIRECTION_GENERALE, ni RESPONSABLE_SERVICE — les
  // comptes de direction ne portent jamais d'étape du circuit.
  return COMPTES_DEMO
    .filter((c) => c.role === role)
    .map((c) => c.email);
}
