/**
 * Données de démonstration pour l'installation (démo uniquement).
 * Extrait de l'ancienne route /api/setup (ARC-01) : le fichier de 996 lignes
 * mélangeait DDL runtime, garde d'accès et seed — les responsabilités sont
 * désormais séparées :
 *   - src/lib/seed/donnees-demo.ts : référentiels et générateurs de démo ;
 *   - src/lib/seed/installation.ts  : procédure d'installation (seed) ;
 *   - src/app/api/setup/route.ts    : garde d'accès (jeton + rate limit).
 *
 * Le SCHÉMA n'est plus créé ici : source unique = migrations Prisma
 * (`prisma migrate deploy`), exécutées séparément du seed.
 */

import { ALL_SOUS_TYPES } from '@/lib/prestations';
import { DOSSIER_STATUT_VALEURS } from '@/lib/statuts';
import { MOYEN_PAIEMENT_VALEURS } from '@/lib/referentiels';

// Référentiels importés des sources de vérité (src/lib/prestations, statuts, referentiels)
export const TYPES_DOSSIER = ALL_SOUS_TYPES;
export const STATUTS = DOSSIER_STATUT_VALEURS;
export const MOYENS_PAIEMENT = MOYEN_PAIEMENT_VALEURS;
export const OBSERVATIONS = [
  'Urgence prise en charge', 'Dossier prioritaire', 'A vérifier avec la mutuelle',
  'Réclamation client en cours', 'Deuxième avis médical requis', '', '', '', '', '',
];
export const NOMS_MALAGASY = [
  'Rakoto', 'Rasoa', 'Andry', 'Faly', 'Naina', 'Hery', 'Tiana', 'Mialy',
  'Jean', 'Marie', 'Pierre', 'Aline', 'Claude', 'Nirina', 'Haingo',
  'Tahiry', 'Sitraka', 'Lova', 'Fenitra', 'Ony',
];
export const PRENOMS_MALAGASY = [
  'Rakotonirina', 'Rasoanaivo', 'Andrianjaka', 'Randriamanalina', 'Rakotomanga',
  'Andriamananjara', 'Rasolofomanana', 'Rakotobe', 'Andrianarisoa', 'Ramiandrisoa',
];

export const PRESTATAIRES_DATA = [
  { nom: 'Clinique Sainte Marie', type: 'CLINIQUE', telephone: '032 12 345 67', email: 'contact@clinique-saintemarie.mg', adresse: 'Lot VJ 34 Antanimena, Antananarivo', nif: '4001234567' },
  { nom: 'Hôpital Principal', type: 'HOPITAL', telephone: '020 22 345 67', email: 'info@hopital-principal.mg', adresse: "Avenue de l'Indépendance, Antananarivo", nif: '4002345678' },
  { nom: 'Centre Médical Albert', type: 'CABINET_MEDICAL', telephone: '034 56 789 01', email: 'rdv@cm-albert.mg', adresse: 'Anosy, Antananarivo', nif: '4003456789' },
  { nom: 'Pharmacie Centrale', type: 'PHARMACIE', telephone: '020 22 456 78', email: 'commande@pharmacie-centrale.mg', adresse: 'Place Behorizy, Antananarivo', nif: '4004567890' },
  { nom: 'Cabinet Dentaire Blanc', type: 'DENTAIRE', telephone: '033 67 890 12', email: 'blanc.dental@gmail.com', adresse: 'Analakely, Antananarivo', nif: '4005678901' },
  { nom: 'Laboratoire BioMad', type: 'LABORATOIRE', telephone: '020 22 567 89', email: 'lab@biomad.mg', adresse: 'Isotry, Antananarivo', nif: '4006789012' },
  { nom: 'Centre Optique Vision Plus', type: 'OPTICIEN', telephone: '034 78 901 23', email: 'visionplus@optique.mg', adresse: 'Tana Water Front, Antananarivo', nif: '4007890123' },
  { nom: 'Maternité Fleur de Vie', type: 'CLINIQUE', telephone: '020 24 678 90', email: 'maternite@fleurdevie.mg', adresse: 'Ampefiloha, Antananarivo', nif: '4008901234' },
  { nom: 'Hôpital Militaire', type: 'HOPITAL', telephone: '020 22 789 01', email: 'admin@hopital-militaire.mg', adresse: 'Soarano, Antananarivo', nif: '4009012345' },
  { nom: 'Policlinique du Nord', type: 'CLINIQUE', telephone: '032 89 012 34', email: 'contact@policlinique-nord.mg', adresse: 'Antsahamarina, Antananarivo', nif: '4010123456' },
];

export const PRESTATAIRES_EXTRA_DATA = [
  { nom: 'Hôpital Andrianarisoa', type: 'HOPITAL', telephone: '020 23 456 78', email: 'contact@hopital-andria.mg', adresse: 'Ambohimanarina', nif: '4011234567' },
  { nom: 'Pharmacie du Centre', type: 'PHARMACIE', telephone: '020 22 345 67', email: 'info@pharmacie-centre.mg', adresse: 'Ankatso', nif: '4012345678' },
  { nom: 'Labo Analyses Plus', type: 'LABORATOIRE', telephone: '034 12 345 67', email: 'lab@analysesplus.mg', adresse: 'Mahamasina', nif: '4013456789' },
];

export const BAREMES_DATA = [
  { prestation: 'HOSPITALISATION', tauxCouverture: 80, plafond: 5_000_000, description: 'Hospitalisation chirurgicale et médicale' },
  { prestation: 'CONSULTATION', tauxCouverture: 70, plafond: 100_000, description: 'Consultation spécialisée, prénatale et simple' },
  { prestation: 'PHARMACIE', tauxCouverture: 60, plafond: 200_000, description: 'Médicaments sur ordonnance' },
  { prestation: 'EXAMEN', tauxCouverture: 75, plafond: 500_000, description: 'Examens de laboratoire' },
  { prestation: 'ACCOUCHEMENT', tauxCouverture: 85, plafond: 3_000_000, description: 'Accouchement chirurgical et normal' },
  { prestation: 'IMAGERIE', tauxCouverture: 70, plafond: 800_000, description: 'Radiologie, échographie, scanner, IRM' },
  { prestation: 'DENTAIRES', tauxCouverture: 60, plafond: 300_000, description: 'Soins, détartrage, extraction, prothèse, orthodontie' },
  { prestation: 'OPTIQUE', tauxCouverture: 50, plafond: 250_000, description: 'Lunettes et lentilles correctrices' },
];

export const SOCIETES_DATA = [
  'TELMA Madagascar', 'JIRAMA', 'Airtel Madagascar', 'BOA Madagascar',
  'BNI Madagascar', 'Société Générale MDG', 'Total Energies MDG',
  'Shopee Madagascar', 'Coca Cola MAD', 'Colas Madagascar',
  'Orange Madagascar', 'Henkel Madagascar', 'Groupe Filatex',
  'SIFOR Madagascar', "Banque de l'Océan Indien",
];

export const GESTIONNAIRES_DATA = [
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
  // R3 — assignation native du contrôle médical : un gestionnaire du service
  // Contrôle médical est disponible en démo pour l'assignation des dossiers.
  { nom: 'Soa E.', service: 'CONTROLE_MEDICAL' },
];

export const MOTIFS_REJET = ['Pièces manquantes', 'Montant non conforme', 'Hors contrat', 'Dossier incomplet', 'Soins non couverts'];

export const COMMENTAIRES_DEMO = [
  'Dossier vérifié, en attente de validation supérieure.',
  'Pièce justificative reçue, traitement en cours.',
  'Montant confirmé par le prestataire.',
  'Rappel envoyé au service comptabilité.',
  "Client a appelé pour connaître l'avancement.",
  'Décompte corrigé après vérification.',
  'Conforme au contrat, passage en paiement.',
  'Attente retour du médecin conseil.',
];

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randomFloat(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
export function generateNumeroDossier(index: number): string {
  return `DOS-2026-${String(index).padStart(6, '0')}`;
}
export function generateNSS(): string {
  return `SS-${randomInt(100000, 999999)}`;
}

/** Tirage pondéré des statuts de dossiers de démo (répartition réaliste). */
const STATUT_WEIGHTS: Record<string, number> = {
  RECU: 15, EN_ANALYSE: 15, VALIDE: 10, EN_COMPTABILITE: 8, EN_PAIEMENT: 12, PAYE: 30, REJETE: 10,
};

export function weightedRandomStatut(): string {
  const total = Object.values(STATUT_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [statut, weight] of Object.entries(STATUT_WEIGHTS)) {
    r -= weight;
    if (r <= 0) return statut;
  }
  return 'PAYE';
}
