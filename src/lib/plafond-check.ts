/**
 * Vérification de plafond annuel de couverture — logique partagée.
 *
 * Cette fonction est appelée depuis :
 *   - /api/sante/simuler-acte (simulation)
 *   - POST /api/dossiers (création manuelle)
 *   - PATCH /api/dossiers/[id] (transition EN_ANALYSE → VALIDE)
 *   - POST /api/technique/baremes (prévisualisation formulaire + plafond annuel)
 *   - POST /api/technique/import-isa (alertes non bloquantes)
 *   - POST /api/import (alertes non bloquantes pour EXCEL avec assureId)
 *
 * La logique est extraite de simuler-acte pour garantir un calcul identique
 * partout dans le circuit de traitement.
 */

import { db } from './db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlafondCheckResult {
  /** true = le montant demandé est couvert, false = bloqué ou partiel */
  autorise: boolean;
  /** Code de raison si bloqué */
  raison: 'OK' | 'ASSURE_INACTIF' | 'PLAFOND_ACTE_ATTEINT' | 'PLAFOND_GLOBAL_ATTEINT' | 'MONTANT_DEPASSE_RELIQUAT' | 'ACTE_NON_COVERT' | 'PRESTATAIRE_INACTIF';
  /** Message lisible */
  message: string;
  /** Détails chiffrés */
  details: {
    assureActif?: boolean;
    prestation?: string;
    plafondActe?: number;
    consommeActe?: number;
    reliquatActe?: number;
    tauxCouverture?: number;
    montantDemande?: number;
    montantCouvert?: number;
    partAssureur?: number;
    partPatient?: number;
    plafondGlobal?: number;
    consommeGlobal?: number;
    reliquatGlobal?: number;
    nbActesIdentiques?: number;
    prestataireActifPourSociete?: boolean;
  };
  /** Alertes info/warning (non bloquantes) */
  alertes: { type: 'info' | 'warning' | 'danger'; message: string }[];
}

// ─── Fonction principale ───────────────────────────────────────────────────

/**
 * Vérifie le plafond annuel pour un assuré / type d'acte.
 *
 * @param opts
 *   - assureId : identifiant de l'assuré (requis pour le calcul de consommation)
 *   - societeId : identifiant de la société (requis)
 *   - typeActe : type de prestation / typeDossier (requis)
 *   - montantDemande : montant réclamé pour ce dossier (requis)
 *   - prestataireId : optionnel, vérifie si le prestataire est actif pour cette société
 *   - excludeDossierId : optionnel, exclure un dossier de la consommation
 *     (utile lors de la mise à jour d'un dossier existant)
 */
export async function verifierPlafondAnnuel(opts: {
  assureId?: string;
  societeId: string;
  typeActe: string;
  montantDemande: number;
  prestataireId?: string;
  excludeDossierId?: string;
}): Promise<PlafondCheckResult> {
  const { assureId, societeId, typeActe, montantDemande, prestataireId, excludeDossierId } = opts;

  // ─── 1. Récupérer l'assuré (si fourni) ───────────────────────────────────
  let assureActif = true;
  if (assureId) {
    const assure = await db.assure.findUnique({
      where: { id: assureId },
      select: { id: true, actif: true, societeId: true },
    });
    if (!assure) {
      return {
        autorise: false,
        raison: 'ASSURE_INACTIF',
        message: 'Assuré non trouvé.',
        details: { assureActif: false },
        alertes: [],
      };
    }
    assureActif = assure.actif;
    if (!assureActif) {
      return {
        autorise: false,
        raison: 'ASSURE_INACTIF',
        message: "L'assuré est inactif. Aucune prise en charge possible.",
        details: { assureActif: false },
        alertes: [],
      };
    }
  }

  // ─── 2. Vérifier le prestataire (si fourni) ───────────────────────────────
  if (prestataireId) {
    const lienPS = await db.prestataireSociete.findUnique({
      where: { prestataireId_societeId: { prestataireId, societeId } },
      select: { actif: true },
    });
    if (lienPS && !lienPS.actif) {
      return {
        autorise: false,
        raison: 'PRESTATAIRE_INACTIF',
        message: 'Le prestataire est inactif pour cette société. Les actes sont refusés automatiquement.',
        details: { prestataireActifPourSociete: false },
        alertes: [],
      };
    }
  }

  // ─── 3. Récupérer le barème ───────────────────────────────────────────────
  const bareme = await db.bareme.findFirst({
    where: { societeId, prestation: typeActe, active: true },
  });

  if (!bareme) {
    return {
      autorise: false,
      raison: 'ACTE_NON_COVERT',
      message: `L'acte "${typeActe}" n'est pas couvert par un barème actif pour cette société.`,
      details: { prestation: typeActe },
      alertes: [],
    };
  }

  // ─── 4. Calculer la consommation annuelle ────────────────────────────────
  const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
  const finAnnee = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  const whereBase: Record<string, unknown> = {
    dateReception: { gte: debutAnnee, lte: finAnnee },
    statut: { not: 'REJETE' },
  };

  // Si on a un assureId, filtrer par assuré
  if (assureId) {
    (whereBase as Record<string, unknown>).assureId = assureId;
  }

  // Exclure un dossier spécifique (pour les mises à jour)
  if (excludeDossierId) {
    (whereBase as Record<string, unknown>).id = { not: excludeDossierId };
  }

  // Consommation par type d'acte
  const dossiersActe = await db.dossier.findMany({
    where: { ...whereBase, typeDossier: typeActe },
    select: { montantPaye: true, montantValide: true, montantReclame: true },
  });
  const consommeActe = dossiersActe.reduce(
    (s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame),
    0
  );
  const reliquatActe = Math.max(0, bareme.plafond - consommeActe);

  // Consommation globale (tous types d'actes)
  const dossiersGlobal = await db.dossier.findMany({
    where: whereBase,
    select: { montantPaye: true, montantValide: true, montantReclame: true },
  });
  const consommeGlobal = dossiersGlobal.reduce(
    (s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame),
    0
  );

  // Plafond global = somme de tous les barèmes actifs de la société
  const baremes = await db.bareme.findMany({ where: { societeId, active: true } });
  const plafondGlobal = baremes.reduce((s, b) => s + b.plafond, 0);
  const reliquatGlobal = Math.max(0, plafondGlobal - consommeGlobal);

  // ─── 5. Alertes ──────────────────────────────────────────────────────────
  const alertes: { type: 'info' | 'warning' | 'danger'; message: string }[] = [];

  // 5a. Plafond spécifique atteint → BLOQUANT
  if (consommeActe >= bareme.plafond) {
    return {
      autorise: false,
      raison: 'PLAFOND_ACTE_ATTEINT',
      message: `Plafond ${typeActe} déjà atteint (${consommeActe.toLocaleString('fr-FR')} Ar / ${bareme.plafond.toLocaleString('fr-FR')} Ar). Aucun reliquat disponible.`,
      details: {
        prestation: typeActe,
        plafondActe: bareme.plafond,
        consommeActe,
        reliquatActe: 0,
        nbActesIdentiques: dossiersActe.length,
        tauxCouverture: bareme.tauxCouverture,
        plafondGlobal,
        consommeGlobal,
        reliquatGlobal,
      },
      alertes: [{
        type: 'danger',
        message: `PLAFOND ATTEINT — L'assuré a épuisé son plafond ${typeActe} pour l'année ${new Date().getFullYear()}.`,
      }],
    };
  }

  // 5b. Plafond global atteint → BLOQUANT
  if (consommeGlobal >= plafondGlobal) {
    return {
      autorise: false,
      raison: 'PLAFOND_GLOBAL_ATTEINT',
      message: 'Plafond annuel global atteint. Aucun nouvel acte ne peut être pris en charge.',
      details: {
        plafondGlobal,
        consommeGlobal,
        reliquatGlobal: 0,
      },
      alertes: [{
        type: 'danger',
        message: `PLAFOND GLOBAL ATTEINT — Tous les plafonds sont épuisés pour l'année ${new Date().getFullYear()}.`,
      }],
    };
  }

  // 5c. Montant demandé dépasse le reliquat acte → bloquant (montant couvert = reliquat)
  if (montantDemande > reliquatActe) {
    alertes.push({
      type: 'danger',
      message: `Le montant demandé (${montantDemande.toLocaleString('fr-FR')} Ar) dépasse le reliquat disponible pour ${typeActe} (${reliquatActe.toLocaleString('fr-FR')} Ar).`,
    });
  }

  // 5d. Plafond global > 70% → avertissement
  if (plafondGlobal > 0 && (consommeGlobal / plafondGlobal) * 100 >= 70) {
    alertes.push({
      type: 'warning',
      message: `Plafond global à ${((consommeGlobal / plafondGlobal) * 100).toFixed(1)}%. Approbation spéciale recommandée.`,
    });
  }

  // 5e. Plafond acte > 70% → avertissement
  if ((consommeActe / bareme.plafond) * 100 >= 70) {
    alertes.push({
      type: 'warning',
      message: `Plafond ${typeActe} à ${((consommeActe / bareme.plafond) * 100).toFixed(1)}%.`,
    });
  }

  // ─── 6. Calcul final ─────────────────────────────────────────────────────
  const montantCouvert = Math.min(montantDemande, reliquatActe);
  const partAssureur = montantCouvert * (bareme.tauxCouverture / 100);
  const partPatient = montantCouvert - partAssureur;
  const autorise = montantDemande <= reliquatActe && consommeGlobal < plafondGlobal;

  return {
    autorise,
    raison: autorise ? 'OK' : 'MONTANT_DEPASSE_RELIQUAT',
    message: autorise
      ? `Acte couvert. Montant couvert : ${montantCouvert.toLocaleString('fr-FR')} Ar.`
      : 'Le montant demandé dépasse le reliquat disponible pour ce type d\'acte.',
    details: {
      prestation: typeActe,
      plafondActe: bareme.plafond,
      consommeActe,
      reliquatActe,
      tauxCouverture: bareme.tauxCouverture,
      montantDemande,
      montantCouvert,
      partAssureur: Math.round(partAssureur),
      partPatient: Math.round(partPatient),
      plafondGlobal,
      consommeGlobal,
      reliquatGlobal,
      nbActesIdentiques: dossiersActe.length,
    },
    alertes,
  };
}
