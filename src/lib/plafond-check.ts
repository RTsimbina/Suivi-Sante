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
import { Decimal, enNombre, sommer, superieurA, superieurOuEgal, inferieurOuEgal, inferieurA, minDecimal, appliquerTaux, moins, plus, reliquat as calculerReliquat, formaterAr, formaterPourcent } from './money';

/** Taux de consommation en % : consommé / plafond × 100 (Decimal exact). */
function tauxConsommation(consomme: Decimal, plafond: Decimal): Decimal | null {
  if (plafond.isZero()) return null;
  return consomme.div(plafond).mul(100);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlafondCheckResult {
  /** true = le montant demandé est couvert, false = bloqué ou partiel */
  autorise: boolean;
  /** Code de raison si bloqué */
  raison: 'OK' | 'ASSURE_INACTIF' | 'PLAFOND_ACTE_ATTEINT' | 'PLAFOND_GLOBAL_ATTEINT' | 'MONTANT_DEPASSE_RELIQUAT' | 'ACTE_NON_COVERT' | 'PRESTATAIRE_INACTIF';
  /** Message lisible */
  message: string;
  /** Détails chiffrés (null = non calculé / non applicable) */
  details: {
    assureActif?: boolean;
    prestation?: string;
    plafondActe?: number | null;
    consommeActe?: number | null;
    reliquatActe?: number | null;
    tauxCouverture?: number;
    montantDemande?: number;
    montantCouvert?: number | null;
    partAssureur?: number | null;
    partPatient?: number | null;
    ticketModerateur?: number | null;
    depassementPlafond?: number | null;
    plafondGlobal?: number | null;
    consommeGlobal?: number | null;
    reliquatGlobal?: number | null;
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
    // Seuls les dossiers traités (au moins EN_ANALYSE) consomment le plafond.
    // RECU = simplement reçu, pas encore validé → ne compte pas.
    statut: { in: ['EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] },
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
  // Somme EXACTE en Decimal (plan P3) — l'ancien reduce flottant cumulait
  // les erreurs d'arrondi IEEE 754 sur la consommation annuelle.
  const consommeActe = sommer(
    dossiersActe.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame)
  );
  // reliquat = max(0, plafond − consommé)
  const reliquatActe = calculerReliquat(bareme.plafond, consommeActe) ?? new Decimal(0);

  // Consommation globale (tous types d'actes)
  const dossiersGlobal = await db.dossier.findMany({
    where: whereBase,
    select: { montantPaye: true, montantValide: true, montantReclame: true },
  });
  const consommeGlobal = sommer(
    dossiersGlobal.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame)
  );

  // Plafond global = somme de tous les barèmes actifs de la société
  const baremes = await db.bareme.findMany({ where: { societeId, active: true } });
  const plafondGlobal = sommer(baremes.map(b => b.plafond));
  const reliquatGlobal = calculerReliquat(plafondGlobal, consommeGlobal) ?? new Decimal(0);

  // ─── 5. Alertes ──────────────────────────────────────────────────────────
  const alertes: { type: 'info' | 'warning' | 'danger'; message: string }[] = [];

  // 5a. Plafond spécifique atteint → BLOQUANT (comparaison exacte)
  if (superieurOuEgal(consommeActe, bareme.plafond)) {
    return {
      autorise: false,
      raison: 'PLAFOND_ACTE_ATTEINT',
      message: `Plafond ${typeActe} déjà atteint (${formaterAr(consommeActe)} / ${formaterAr(bareme.plafond)}). Aucun reliquat disponible.`,
      details: {
        prestation: typeActe,
        plafondActe: enNombre(bareme.plafond),
        consommeActe: enNombre(consommeActe),
        reliquatActe: 0,
        nbActesIdentiques: dossiersActe.length,
        tauxCouverture: bareme.tauxCouverture,
        plafondGlobal: enNombre(plafondGlobal),
        consommeGlobal: enNombre(consommeGlobal),
        reliquatGlobal: enNombre(reliquatGlobal),
      },
      alertes: [{
        type: 'danger',
        message: `PLAFOND ATTEINT — L'assuré a épuisé son plafond ${typeActe} pour l'année ${new Date().getFullYear()}.`,
      }],
    };
  }

  // 5b. Plafond global atteint → BLOQUANT (comparaison exacte)
  if (superieurOuEgal(consommeGlobal, plafondGlobal)) {
    return {
      autorise: false,
      raison: 'PLAFOND_GLOBAL_ATTEINT',
      message: 'Plafond annuel global atteint. Aucun nouvel acte ne peut être pris en charge.',
      details: {
        plafondGlobal: enNombre(plafondGlobal),
        consommeGlobal: enNombre(consommeGlobal),
        reliquatGlobal: 0,
      },
      alertes: [{
        type: 'danger',
        message: `PLAFOND GLOBAL ATTEINT — Tous les plafonds sont épuisés pour l'année ${new Date().getFullYear()}.`,
      }],
    };
  }

  // 5c. Montant demandé dépasse le reliquat acte → bloquant (montant couvert = reliquat)
  if (superieurA(montantDemande, reliquatActe)) {
    alertes.push({
      type: 'danger',
      message: `Le montant demandé (${formaterAr(montantDemande)}) dépasse le reliquat disponible pour ${typeActe} (${formaterAr(reliquatActe)}).`,
    });
  }

  // 5d. Plafond global > 70% → avertissement (comparaison exacte)
  const tauxGlobal = tauxConsommation(consommeGlobal, plafondGlobal);
  if (tauxGlobal !== null && superieurOuEgal(tauxGlobal, 70)) {
    alertes.push({
      type: 'warning',
      message: `Plafond global à ${formaterPourcent(consommeGlobal, plafondGlobal)}. Approbation spéciale recommandée.`,
    });
  }

  // 5e. Plafond acte > 70% → avertissement
  const tauxActe = tauxConsommation(consommeActe, bareme.plafond);
  if (tauxActe !== null && superieurOuEgal(tauxActe, 70)) {
    alertes.push({
      type: 'warning',
      message: `Plafond ${typeActe} à ${formaterPourcent(consommeActe, bareme.plafond)}.`,
    });
  }

  // ─── 6. Calcul final (Decimal exact, arrondi comptable 2 décimales) ────
  const montantCouvert = minDecimal(montantDemande, reliquatActe) ?? new Decimal(0);
  // Ticket modérateur = part du patient sur le montant couvert (taux non couvert)
  const partAssureur = appliquerTaux(montantCouvert, bareme.tauxCouverture) ?? new Decimal(0);
  const ticketModerateur = moins(montantCouvert, partAssureur) ?? new Decimal(0);
  // Dépassement plafond = ce qui dépasse le plafond (à la charge totale du patient)
  const depassementPlafond = moins(montantDemande, reliquatActe);
  const depassement = depassementPlafond && depassementPlafond.isNegative() ? new Decimal(0) : (depassementPlafond ?? new Decimal(0));
  // Part patient totale = ticket modérateur + dépassement plafond
  const partPatient = plus(ticketModerateur, depassement) ?? new Decimal(0);
  const autorise = inferieurOuEgal(montantDemande, reliquatActe) && inferieurA(consommeGlobal, plafondGlobal);

  return {
    autorise,
    raison: autorise ? 'OK' : 'MONTANT_DEPASSE_RELIQUAT',
    message: autorise
      ? `Acte couvert. Montant couvert : ${formaterAr(montantCouvert)}.`
      : 'Le montant demandé dépasse le reliquat disponible pour ce type d\'acte.',
    details: {
      prestation: typeActe,
      plafondActe: enNombre(bareme.plafond),
      consommeActe: enNombre(consommeActe),
      reliquatActe: enNombre(reliquatActe),
      tauxCouverture: bareme.tauxCouverture,
      montantDemande,
      montantCouvert: enNombre(montantCouvert),
      partAssureur: Math.round(enNombre(partAssureur) ?? 0),
      partPatient: Math.round(enNombre(partPatient) ?? 0),
      ticketModerateur: enNombre(ticketModerateur),
      depassementPlafond: enNombre(depassement),
      plafondGlobal: enNombre(plafondGlobal),
      consommeGlobal: enNombre(consommeGlobal),
      reliquatGlobal: enNombre(reliquatGlobal),
      nbActesIdentiques: dossiersActe.length,
    },
    alertes,
  };
}
