/**
 * Vérification de plafond annuel de couverture — logique partagée.
 *
 * Cette fonction est appelée depuis :
 *   - /api/sante/simuler-acte (simulation)
 *   - POST /api/dossiers (création manuelle) — BLOQUANT (422) + re-vérification
 *     transactionnelle FOR UPDATE (PLAFOND_ATTEINT_TRANSACTION → 422)
 *   - PATCH /api/dossiers/[id] (transition EN_ANALYSE → VALIDE) — idem, BLOQUANT
 *   - POST /api/technique/baremes (prévisualisation formulaire + plafond annuel)
 *   - POST /api/technique/import-isa (BLOQUANT PAR LIGNE, rejet partiel)
 *   - POST /api/import (BLOQUANT PAR LIGNE, rejet partiel)
 *
 * La logique est extraite de simuler-acte pour garantir un calcul identique
 * partout dans le circuit de traitement.
 */

import { db } from './db';
import { Decimal, enNombre, sommer, superieurA, superieurOuEgal, inferieurOuEgal, inferieurA, minDecimal, reliquat as calculerReliquat, formaterAr, formaterPourcent, versDecimal } from './money';
import { dedupliquerEnVigueur, trouverBaremeValide, type BaremeDated } from './baremes-validite';
import { calculerRemboursement } from './services/calcul-remboursement';

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
    /** P2-04 — décomposition métier du calcul centralisé (calcul-remboursement.ts). */
    priseEnChargeTheorique?: number | null;
    partContractuelleAssure?: number | null;
    partAssureur?: number | null;
    partPatient?: number | null;
    ticketModerateur?: number | null;
    depassementPlafond?: number | null;
    plafondGlobal?: number | null;
    consommeGlobal?: number | null;
    reliquatGlobal?: number | null;
    nbActesIdentiques?: number;
    prestataireActifPourSociete?: boolean;
    /** Version du barème appliquée (P1) — figée sur le dossier au calcul. */
    baremeApplique?: {
      id: string;
      version: number;
      tauxCouverture: number;
      plafond: string;
      valideDu: string;
      valideAu: string | null;
    } | null;
  };
  /** Alertes info/warning (non bloquantes) */
  alertes: { type: 'info' | 'warning' | 'danger'; message: string }[];
}

// ─── Fenêtre annuelle canonique (BIZ-2) ─────────────────────────────────────

/**
 * Fenêtre de consommation annuelle — SOURCE UNIQUE (BIZ-2).
 *
 * Ancien comportement : le moteur central bornait la consommation sur
 * l'année COURANTE tandis que les re-vérifications transactionnelles
 * (PATCH dossier, création) utilisaient l'année de dateReception — un
 * dossier traité l'année suivant sa réception était jugé selon deux
 * fenêtres différentes selon le chemin de code.
 *
 * Règle retenue (à valider fonctionnellement — décision n°1) : l'année de
 * la réception du dossier, déjà appliquée par les re-vérifications
 * transactionnelles existantes.
 */
export function fenetreAnnuelle(dateReference: Date): { debut: Date; fin: Date; annee: number } {
  const annee = dateReference.getFullYear();
  return {
    debut: new Date(annee, 0, 1),
    fin: new Date(annee, 11, 31, 23, 59, 59),
    annee,
  };
}

// ─── Définition canonique de la consommation (A-05) ─────────────────────────

/**
 * Statuts qui CONSOMMENT le plafond annuel — SOURCE UNIQUE (A-05).
 *
 * Règle métier centrale : seuls les dossiers réellement pris en charge
 * consomment le plafond.
 *   - RECU      : simple réception, pas encore traité → ne consomme PAS ;
 *   - REJETE    : refusé → ne consomme PAS ;
 *   - EN_ANALYSE → VALIDE → EN_COMPTABILITE → EN_PAIEMENT → PAYE : consomme.
 *
 * Toute vue affichant une consommation (vérification d'assuré, simulateur,
 * circuit de traitement) doit importer cette constante — plus aucun filtre
 * de statut écrit en local.
 */
export const STATUTS_CONSOMMATION = [
  'EN_ANALYSE',
  'VALIDE',
  'EN_COMPTABILITE',
  'EN_PAIEMENT',
  'PAYE',
] as const;

/**
 * Clause WHERE canonique de la consommation annuelle — SOURCE UNIQUE (A-05).
 *
 * Partagée par le moteur verifierPlafondAnnuel() et les vues de contrôle :
 * fenêtre annuelle (BIZ-2) + statuts consommateurs + périmètre assuré, en
 * un seul endroit pour garantir un calcul identique sur tous les chemins.
 */
export function whereConsommationAnnuelle(
  fenetre: { debut: Date; fin: Date },
  opts: { assureId?: string; excludeDossierId?: string } = {}
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    dateReception: { gte: fenetre.debut, lte: fenetre.fin },
    statut: { in: STATUTS_CONSOMMATION },
  };
  if (opts.assureId) where.assureId = opts.assureId;
  if (opts.excludeDossierId) where.id = { not: opts.excludeDossierId };
  return where;
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
 *   - datePrestation : optionnel (P1) — date à laquelle le tarif doit être
 *     valide (dossier.dateSoins, à défaut dateReception). Défaut : maintenant.
 *   - dateReception : optionnel (BIZ-2) — ancre la fenêtre annuelle de
 *     consommation sur l'année de réception du dossier. Défaut : année de
 *     datePrestation.
 */
export async function verifierPlafondAnnuel(opts: {
  assureId?: string;
  societeId: string;
  typeActe: string;
  montantDemande: number;
  prestataireId?: string;
  excludeDossierId?: string;
  datePrestation?: Date;
  dateReception?: Date;
}): Promise<PlafondCheckResult> {
  const { assureId, societeId, typeActe, montantDemande, prestataireId, excludeDossierId } = opts;
  const datePrestation = opts.datePrestation ?? new Date();
  // BIZ-2 : fenêtre de consommation ancrée sur l'année de réception du
  // dossier (à défaut, de la prestation) — identique sur tous les chemins.
  const fenetre = fenetreAnnuelle(opts.dateReception ?? datePrestation);

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
  const bareme: BaremeDated | null = await trouverBaremeValide(db, {
    societeId,
    prestation: typeActe,
    date: datePrestation,
  });

  if (!bareme) {
    return {
      autorise: false,
      raison: 'ACTE_NON_COVERT',
      message: `L'acte "${typeActe}" n'est pas couvert par un barème valide pour cette société à la date de la prestation.`,
      details: { prestation: typeActe },
      alertes: [],
    };
  }

  // Version appliquée, sérialisée pour la traçabilité (P1, point 8) : les
  // appelants (création de dossier) figent ces valeurs sur le dossier pour
  // que le montant calculé reste justifiable après évolution du barème.
  const baremeApplique = {
    id: bareme.id,
    version: bareme.version,
    tauxCouverture: bareme.tauxCouverture,
    plafond: String(bareme.plafond),
    valideDu: bareme.valideDu.toISOString(),
    valideAu: bareme.valideAu ? bareme.valideAu.toISOString() : null,
  };

  // ─── 4. Calculer la consommation annuelle ────────────────────────────────
  // BIZ-2 : la fenêtre provient de fenetreAnnuelle() — même année de
  // dateReception sur le moteur central et les re-vérifications transaction.
  // A-05 : fenêtre + statuts consommateurs viennent de la définition
  // canonique whereConsommationAnnuelle() — partagée avec la vue de contrôle
  // santé (vérification d'assuré) pour un calcul strictement identique.
  const whereBase = whereConsommationAnnuelle(fenetre, { assureId, excludeDossierId });

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

  // Plafond global = somme des barèmes EN VIGUEUR à la date de référence
  // (une seule version par combinaison — dédupliquée, P1) : sans
  // déduplication, les versions historiques multiplieraient le plafond.
  const toutesVersions = await db.bareme.findMany({ where: { societeId, supprime: false } });
  const baremes = dedupliquerEnVigueur(toutesVersions, datePrestation);
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
        baremeApplique,
      },
      alertes: [{
        type: 'danger',
        message: `PLAFOND ATTEINT — L'assuré a épuisé son plafond ${typeActe} pour l'année ${fenetre.annee}.`,
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
        message: `PLAFOND GLOBAL ATTEINT — Tous les plafonds sont épuisés pour l'année ${fenetre.annee}.`,
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
  // P1 : le plafond de la version peut être un number (mocks) — conversion
  // Decimal pour le calcul du taux de consommation.
  const tauxActe = tauxConsommation(consommeActe, versDecimal(bareme.plafond) ?? new Decimal(0));
  if (tauxActe !== null && superieurOuEgal(tauxActe, 70)) {
    alertes.push({
      type: 'warning',
      message: `Plafond ${typeActe} à ${formaterPourcent(consommeActe, bareme.plafond)}.`,
    });
  }

  // ─── 6. Calcul final — SERVICE MÉTIER CENTRALISÉ (P2-04) ────────────────
  // La règle du remboursement / ticket modérateur vit désormais dans
  // src/lib/services/calcul-remboursement.ts (source unique partagée par
  // toute l'application) : le plafond borne la prise en charge AUTORISÉE
  // (min(théorique, restant)) et le ticket modérateur distingue la part
  // contractuelle de l'assuré du dépassement du plafond.
  const calcul = calculerRemboursement({
    montantFrais: montantDemande,
    tauxCouverture: bareme.tauxCouverture,
    plafondAnnuel: enNombre(bareme.plafond) ?? 0,
    consommationAnterieure: enNombre(consommeActe) ?? 0,
  });

  // montantCouvert (sémantique inchangée) = montant soumis au taux :
  // min(montant demandé, reliquat acte). La prise en charge effective de
  // l'assureur est `partAssureur` = prise en charge autorisée du service.
  const montantCouvert = minDecimal(montantDemande, reliquatActe) ?? new Decimal(0);
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
      // P2-04 : règle unifiée — le plafond borne la prise en charge APRÈS
      // taux ; le ticket modérateur = dépense − prise en charge autorisée.
      partAssureur: calcul.priseEnChargeAutorisee,
      partPatient: calcul.ticketModerateur,
      ticketModerateur: calcul.ticketModerateur,
      depassementPlafond: calcul.depassementPlafond,
      priseEnChargeTheorique: calcul.priseEnChargeTheorique,
      partContractuelleAssure: calcul.partContractuelleAssure,
      plafondGlobal: enNombre(plafondGlobal),
      consommeGlobal: enNombre(consommeGlobal),
      reliquatGlobal: enNombre(reliquatGlobal),
      nbActesIdentiques: dossiersActe.length,
      baremeApplique,
    },
    alertes,
  };
}
