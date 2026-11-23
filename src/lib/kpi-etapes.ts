/**
 * kpi-etapes.ts — Traçabilité du traitement des dossiers (module KPI).
 * ────────────────────────────────────────────────────────────────────────────
 * Complète l'historique existant (Dossier.historique JSON + HistoriqueParametre)
 * avec des PÉRIODES DE RESPONSABILITÉ requêtables : une ligne EtapeTraitement
 * par (dossier × service), ouverte à l'entrée du dossier dans le service et
 * fermée à la sortie ou à la réaffectation. Append-only : une étape fermée
 * n'est jamais modifiée.
 *
 * Conventions de mesure (documentées, appliquées par le moteur kpi-performance) :
 *   - dateAffectation : entrée de responsabilité (transition du circuit,
 *     création du dossier ou réaffectation) ;
 *   - dateDebut : première action effective du responsable — posée par
 *     l'endpoint « début de traitement », sinon posée à la fermeture
 *     (traitement instantané lors de la transition) ;
 *   - dateFin : sortie de responsabilité (NULL = étape ouverte) ;
 *   - suspensions : fenêtres EXCLUES du temps actif (attente pièce,
 *     validation externe…) avec motif obligatoire ;
 *   - réaffectation : fermeture de l'étape du responsable précédent + ouverture
 *     d'une étape pour le nouveau — chaque période reste attribuée à son
 *     responsable (aucun transfert artificiel du temps au dernier titulaire).
 *
 * Cartographie service ← statut (statuts.ts, source de vérité) :
 *   RECU → ACCUEIL ; EN_ANALYSE/VALIDE → TECHNIQUE ;
 *   EN_COMPTABILITE/EN_PAIEMENT → COMPTABILITE ; PAYE/REJETE → terminal.
 * CONTROLE_MEDICAL est hors circuit des statuts : ses étapes sont ouvertes et
 * fermées explicitement par les profils habilités (rôle SANTE / ADMINISTRATEUR).
 */

import { Prisma, type EtapeTraitement, type EtapeSuspension } from '@prisma/client';

type Tx = Prisma.TransactionClient;

// ─── Référentiel des services KPI ────────────────────────────────────────────

export const SERVICES_KPI = ['ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const;
export type ServiceKpi = (typeof SERVICES_KPI)[number];

/** Service responsable d'un dossier selon son statut (null = terminal). */
export const SERVICE_PAR_STATUT: Record<string, ServiceKpi | null> = {
  RECU: 'ACCUEIL',
  EN_ANALYSE: 'TECHNIQUE',
  VALIDE: 'TECHNIQUE',
  EN_COMPTABILITE: 'COMPTABILITE',
  EN_PAIEMENT: 'COMPTABILITE',
  PAYE: null,
  REJETE: null,
};

/** Rôle utilisateur correspondant à un service (attribution de responsabilité). */
export const ROLE_PAR_SERVICE: Record<ServiceKpi, string> = {
  ACCUEIL: 'ACCUEIL',
  TECHNIQUE: 'TECHNIQUE',
  CONTROLE_MEDICAL: 'SANTE',
  COMPTABILITE: 'COMPTABILITE',
};

/** Objectifs par défaut (minutes) — semés à l'installation, modifiables. */
export const OBJECTIFS_DEFAUT_MINUTES: Record<ServiceKpi, number> = {
  ACCUEIL: 30,
  TECHNIQUE: 240,
  CONTROLE_MEDICAL: 240,
  COMPTABILITE: 120,
};

/** Seuils d'alerte par défaut (typeAlerte → valeur), par service + GLOBAL. */
export const SEUILS_DEFAUT = {
  PROCHE_CIBLE: 80,   // % du délai cible consommé
  ACCUMULATION: 20,   // dossiers ouverts simultanément dans le service
  DEGRADATION: 10,    // points de baisse du taux de respect vs période précédente
  HAUSSE_RETOURS: 10, // % de taux de retour pour correction
} as const;

// ─── Contexte de synchronisation ─────────────────────────────────────────────

export interface ContexteSynchronisation {
  dossierId: string;
  /** Statut avant l'opération (null = création du dossier) */
  statutAvant: string | null;
  /** Statut après l'opération (null = pas de changement de statut) */
  statutApres: string | null;
  /** Gestionnaires assignés APRÈS l'opération (différentiel géré ici) */
  gestionnairesApres: { ACCUEIL?: string | null; TECHNIQUE?: string | null; COMPTABILITE?: string | null };
  /** Utilisateur ayant effectué l'opération (JWT, côté serveur) */
  userId?: string | null;
  /** Rôle de cet utilisateur — sert à attribuer la responsabilité de l'étape */
  userRole?: string | null;
  /** Horodatage serveur (défaut : maintenant) */
  date?: Date;
  motifReaffectation?: string;
  source?: 'CIRCUIT' | 'MIGRATION' | 'MANUEL';
}

/** Snapshot minimal de gestionnaires avant opération (pour la réaffectation). */
export interface GestionnairesDossier {
  ACCUEIL?: string | null;
  TECHNIQUE?: string | null;
  COMPTABILITE?: string | null;
}

// ─── Helpers internes ────────────────────────────────────────────────────────

function gestionnairePourService(g: GestionnairesDossier, service: ServiceKpi): string | null {
  if (service === 'ACCUEIL') return g.ACCUEIL ?? null;
  if (service === 'TECHNIQUE') return g.TECHNIQUE ?? null;
  if (service === 'COMPTABILITE') return g.COMPTABILITE ?? null;
  return null; // CONTROLE_MEDICAL : pas de champ gestionnaire dédié
}

function roleCorrespondService(role: string | null | undefined, service: ServiceKpi): boolean {
  if (!role) return false;
  return ROLE_PAR_SERVICE[service] === role;
}

// ─── Synchronisation (idempotent, à appeler dans la transaction de la route) ─

/**
 * Aligne les étapes ouvertes sur l'état APRÈS opération :
 *  1. ferme les étapes ouvertes dont le service n'est plus responsable ;
 *  2. ferme/rouvre si le gestionnaire du service courant a changé (réaffectation) ;
 *  3. ouvre l'étape du service responsable du nouveau statut ;
 *  4. attribue la responsabilité (userId) au premier acteur non-admin du service.
 * Idempotent : aucun effet si l'état correspond déjà aux étapes ouvertes.
 */
export async function synchroniserEtapes(tx: Tx, ctx: ContexteSynchronisation): Promise<void> {
  const date = ctx.date ?? new Date();
  const statutApres = ctx.statutApres ?? ctx.statutAvant;
  const serviceAvant = ctx.statutAvant ? SERVICE_PAR_STATUT[ctx.statutAvant] ?? null : null;
  const serviceApres = statutApres ? SERVICE_PAR_STATUT[statutApres] ?? null : null;

  const ouvertes = await tx.etapeTraitement.findMany({
    where: { dossierId: ctx.dossierId, dateFin: null },
  });

  // 1. Fermer les étapes ouvertes de services qui ne sont plus responsables.
  for (const etape of ouvertes) {
    const resteResponsable = serviceApres !== null && etape.service === serviceApres;
    if (resteResponsable) continue;
    await tx.etapeTraitement.update({
      where: { id: etape.id },
      data: {
        dateFin: date,
        statutApres: statutApres ?? undefined,
        // Première action du responsable = la transition de sortie elle-même :
        // traitement instantané (règle documentée) si aucun début n'a été marqué.
        dateDebut: etape.dateDebut ?? date,
      },
    });
  }

  if (serviceApres === null) return; // dossier terminal : rien à ouvrir

  // Attribution de responsabilité : le premier acteur dont le rôle correspond
  // au service devient responsable (anti faux positif : un administrateur
  // faisant une transition pour un service ne s'attribue pas le dossier).
  const attribution = ctx.userId && roleCorrespondService(ctx.userRole, serviceApres)
    ? ctx.userId : null;
  const gestionnaireApres = gestionnairePourService(ctx.gestionnairesApres, serviceApres);

  // 2. Affectation / réaffectation du gestionnaire du service courant :
  //    - NULL → G : simple complétion d'affectation, la période reste la même
  //      (évite de gonfler le nombre de dossiers « affectés ») ;
  //    - G1 → G2 (deux affectations distinctes) : VRAIE réaffectation — la
  //      période du titulaire précédent est fermée, une nouvelle période est
  //      ouverte pour le nouveau (chaque période reste attribuée à son
  //      responsable, aucun transfert de temps) ;
  //    - G → NULL : désaffectation — fermeture de la période, réouverture d'une
  //      période sans gestionnaire (invariant : le service garde une étape ouverte).
  const ouverteService = ouvertes.find((e) => e.service === serviceApres);
  if (ouverteService && gestionnaireApres !== (ouverteService.gestionnaireId ?? null)) {
    if (!ouverteService.gestionnaireId && gestionnaireApres) {
      await tx.etapeTraitement.update({
        where: { id: ouverteService.id },
        data: { gestionnaireId: gestionnaireApres },
      });
      return;
    }
    await tx.etapeTraitement.update({
      where: { id: ouverteService.id },
      data: {
        dateFin: date,
        statutApres: statutApres ?? undefined,
        dateDebut: ouverteService.dateDebut ?? date,
        motifReaffectation: ctx.motifReaffectation
          ?? (gestionnaireApres ? 'Réaffectation du gestionnaire' : 'Désaffectation du gestionnaire'),
      },
    });
    await tx.etapeTraitement.create({
      data: {
        dossierId: ctx.dossierId,
        service: serviceApres,
        gestionnaireId: gestionnaireApres,
        userId: ouverteService.userId,
        type: 'TRAVAIL',
        source: ctx.source ?? 'CIRCUIT',
        dateAffectation: date,
        motifReaffectation: ctx.motifReaffectation,
        statutAvant: statutApres,
      },
    });
    return;
  }

  // 3. Ouvrir l'étape du service responsable si aucune n'est ouverte.
  if (!ouverteService) {
    await tx.etapeTraitement.create({
      data: {
        dossierId: ctx.dossierId,
        service: serviceApres,
        gestionnaireId: gestionnaireApres,
        userId: attribution,
        type: 'TRAVAIL',
        source: ctx.source ?? 'CIRCUIT',
        dateAffectation: date,
        statutAvant: ctx.statutAvant ?? statutApres,
      },
    });
    return;
  }

  // 4. Attribution complémentaire : étape ouverte sans responsable et acteur
  //    du service → attribuer (sans écraser une attribution existante).
  if (!ouverteService.userId && attribution) {
    await tx.etapeTraitement.update({
      where: { id: ouverteService.id },
      data: { userId: attribution },
    });
  }
}

// ─── Actions collaborateur sur l'étape ouverte ───────────────────────────────

/** Étape ouverte d'un dossier (TRAVAIL uniquement). */
export async function etapeOuverte(tx: Tx, dossierId: string): Promise<EtapeTraitement | null> {
  return tx.etapeTraitement.findFirst({
    where: { dossierId, dateFin: null, type: 'TRAVAIL' },
    orderBy: { dateAffectation: 'desc' },
  });
}

/** Le collaborateur marque le début effectif de son traitement. */
export async function marquerDebutTraitement(tx: Tx, dossierId: string, userId: string, userRole?: string | null): Promise<EtapeTraitement> {
  const etape = await etapeOuverte(tx, dossierId);
  if (!etape) throw new Error('ETAPE_ABSENTE: aucune étape ouverte pour ce dossier');
  if (etape.dateDebut) throw new Error('DEJA_MARQUE: le début de traitement est déjà posé');
  return tx.etapeTraitement.update({
    where: { id: etape.id },
    data: {
      dateDebut: new Date(),
      userId: etape.userId ?? userId,
      // Un non-admin qui agit devient responsable ; un admin ne s'attribue pas
      // un dossier déjà attribué (anti faux positif, règle documentée).
      ...(etape.userId ? {} : {}),
    },
  });
}

/** Suspend l'étape ouverte (motif obligatoire) — durée exclue du temps actif. */
export async function suspendreEtape(tx: Tx, dossierId: string, motif: string, parId: string | null): Promise<EtapeSuspension> {
  const etape = await etapeOuverte(tx, dossierId);
  if (!etape) throw new Error('ETAPE_ABSENTE: aucune étape ouverte pour ce dossier');
  const enCours = await tx.etapeSuspension.findFirst({ where: { etapeId: etape.id, reprisA: null } });
  if (enCours) throw new Error('DEJA_SUSPENDU: une suspension est déjà en cours');
  return tx.etapeSuspension.create({
    data: { etapeId: etape.id, motif, suspenduA: new Date(), parId },
  });
}

/** Reprise : clôture la suspension ouverte. */
export async function reprendreEtape(tx: Tx, dossierId: string, parId: string | null): Promise<EtapeSuspension> {
  const etape = await etapeOuverte(tx, dossierId);
  if (!etape) throw new Error('ETAPE_ABSENTE: aucune étape ouverte pour ce dossier');
  const enCours = await tx.etapeSuspension.findFirst({ where: { etapeId: etape.id, reprisA: null } });
  if (!enCours) throw new Error('AUCUNE_SUSPENSION: pas de suspension en cours');
  return tx.etapeSuspension.update({
    where: { id: enCours.id },
    data: { reprisA: new Date(), parId },
  });
}

/**
 * Retour pour correction : événement TRAÇABLE (le dossier conserve son statut —
 * aucune règle de transition modifiée). Compte dans le taux de retour pour
 * correction ; la responsabilité reste celle de l'étape ouverte.
 */
export async function enregistrerRetourCorrection(
  tx: Tx, dossierId: string, statutCourant: string, userId: string, motif: string,
): Promise<EtapeTraitement> {
  const etape = await etapeOuverte(tx, dossierId);
  const now = new Date();
  return tx.etapeTraitement.create({
    data: {
      dossierId,
      service: etape?.service ?? SERVICE_PAR_STATUT[statutCourant] ?? 'ACCUEIL',
      userId,
      type: 'RETOUR_CORRECTION',
      source: 'CIRCUIT',
      statutAvant: statutCourant,
      statutApres: statutCourant,
      dateAffectation: now,
      dateDebut: now,
      dateFin: now,
      motifRetour: motif,
    },
  });
}

// ─── Contrôle médical (hors circuit des statuts) ─────────────────────────────

/** Ouvre une étape de contrôle médical (phase DEBUT). */
export async function ouvrirEtapeControleMedical(tx: Tx, dossierId: string, userId: string): Promise<EtapeTraitement> {
  const existante = await tx.etapeTraitement.findFirst({
    where: { dossierId, service: 'CONTROLE_MEDICAL', dateFin: null },
  });
  if (existante) throw new Error('DEJA_OUVERTE: une étape de contrôle médical est en cours');
  return tx.etapeTraitement.create({
    data: {
      dossierId,
      service: 'CONTROLE_MEDICAL',
      userId,
      type: 'TRAVAIL',
      source: 'CIRCUIT',
      dateAffectation: new Date(),
      dateDebut: new Date(),
      statutAvant: null,
    },
  });
}

/** Clôture l'étape de contrôle médical ouverte (phase FIN). */
export async function fermerEtapeControleMedical(tx: Tx, dossierId: string): Promise<EtapeTraitement> {
  const etape = await tx.etapeTraitement.findFirst({
    where: { dossierId, service: 'CONTROLE_MEDICAL', dateFin: null },
  });
  if (!etape) throw new Error('ETAPE_ABSENTE: aucune étape de contrôle médical ouverte');
  const now = new Date();
  return tx.etapeTraitement.update({
    where: { id: etape.id },
    data: { dateFin: now, dateDebut: etape.dateDebut ?? now, statutApres: etape.statutAvant },
  });
}
