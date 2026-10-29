/**
 * societe-service.ts — Logique métier du module Sociétés clientes.
 *
 * Logique PURE (sans accès base) → testable unitairement (S1–S11).
 * La base ne fournit que les lignes candidates ; la décision est centralisée
 * ici. Miroir de prestataire-doublons.ts pour le référentiel des sociétés.
 *
 * Spécifications couvertes :
 *  - SPEC-1 : unicité du NOM insensible à la casse, aux accents et aux
 *    séparateurs (index unique partiel sur Societe.nomNormalise en base,
 *    détection applicative ici — la base est le dernier rempart, jamais la
 *    seule ligne de défense) ;
 *  - SPEC-4 : suppression protégée étendue — refus motivé (409) si dossiers,
 *    assurés, appels de fonds ou mode de calcul d'appels de fonds rattachés ;
 *    JAMAIS de violation de clé étrangère brute (500) ni de suppression
 *    silencieuse de données comptables (contrats) ;
 *  - SPEC-6 : garde d'ambiguïté de la liaison externe — un même e-mail de
 *    contact principal ne peut pas pointer vers deux sociétés (résolution
 *    CONTACT_ENTREPRISE de liaison-externe.ts deviendrait indéterminée).
 */

import { normaliserNom } from './prestataire-doublons';

export { normaliserNom };

// ─── Unicité du nom (SPEC-1) ────────────────────────────────────────────────

/** Fiche société minimale pour la détection de conflit de nom. */
export interface SocieteExistanteMin {
  id: string;
  nom: string;
  nomNormalise?: string | null;
}

/**
 * Détecte le conflit de nom normalisé entre une candidate et les sociétés
 * existantes. `exclureId` évite qu'une fiche se compare à elle-même
 * (modification). Retourne la société en conflit, ou null.
 *
 * La comparaison utilise la colonne nomNormalise si elle est renseignée,
 * sinon recalcule la normalisation à partir du nom brut (résilience si le
 * backfill n'a pas encore couvert la ligne).
 */
export function detecterConflitNom(
  nomCandidat: string,
  existantes: SocieteExistanteMin[],
  exclureId?: string
): SocieteExistanteMin | null {
  const nomNormaliseCandidat = normaliserNom(nomCandidat);
  if (!nomNormaliseCandidat) return null;

  for (const existante of existantes) {
    if (exclureId && existante.id === exclureId) continue;
    const nomExistant = existante.nomNormalise ?? normaliserNom(existante.nom || '');
    if (nomExistant && nomExistant === nomNormaliseCandidat) return existante;
  }
  return null;
}

/** Message 409 affiché à l'utilisateur avec la fiche en conflit. */
export function messageConflitNom(societeExistante: SocieteExistanteMin): string {
  return `Une société avec ce nom existe déjà : « ${societeExistante.nom} » (insensible à la casse et aux accents).`;
}

// ─── Suppression protégée (SPEC-4) ──────────────────────────────────────────

/** Comptes de dépendances d'une société, tels que mesurés en base. */
export interface ComptesSuppressionSociete {
  dossiers: number;
  assures: number;
  /** Appels de fonds rattachés aux contrats de la société. */
  appelsDeFonds: number;
  /** Ligne ModeCalculAppelFonds (paramétrage d'appels par société). */
  modeCalculAppelFonds: number;
}

/** Un motif de blocage : libellé humain + détail chiffré. */
export interface BlocageSuppression {
  libelle: string;
  detail: string;
}

/**
 * Détermine les motifs de blocage de la suppression d'une société.
 *
 * Règles (dans l'ordre d'importance) :
 *  - dossiers        → toujours bloquant (traçabilité des décomptes) ;
 *  - assurés         → toujours bloquant (le schéma Prisma déclare RESTRICT :
 *                      « la suppression de société est bloquée par l'API si
 *                      des assurés existent » — l'API honore désormais ce
 *                      contrat au lieu de laisser la FK produire un 500) ;
 *  - appels de fonds → toujours bloquant : les contrats ne sont PAS supprimés
 *                      silencieusement tant que des données comptables
 *                      (appels de fonds) y sont rattachées ;
 *  - mode de calcul  → bloquant : paramétrage à réaffecter ou supprimer
 *                      explicitement d'abord.
 *
 * Les conventions prestataires (PrestataireSociete) et les contacts
 * (EntrepriseContact) sont en CASCADE et ne bloquent pas ; les courriels
 * (Courriel) passent en SET NULL.
 */
export function motifsBlocageSuppression(
  comptes: ComptesSuppressionSociete
): BlocageSuppression[] {
  const blocages: BlocageSuppression[] = [];

  if (comptes.dossiers > 0) {
    blocages.push({
      libelle: 'dossiers',
      detail: `${comptes.dossiers} dossier(s) y sont rattaché(s). Supprimez ou réaffectez les dossiers avant de supprimer la société.`,
    });
  }
  if (comptes.assures > 0) {
    blocages.push({
      libelle: 'assurés',
      detail: `${comptes.assures} assuré(s) y sont rattaché(s). Réaffectez ou radiez les assurés avant de supprimer la société.`,
    });
  }
  if (comptes.appelsDeFonds > 0) {
    blocages.push({
      libelle: 'appels de fonds',
      detail: `${comptes.appelsDeFonds} appel(s) de fonds sont rattachés à ses contrats. Les contrats ne peuvent pas être supprimés avec leur historique comptable.`,
    });
  }
  if (comptes.modeCalculAppelFonds > 0) {
    blocages.push({
      libelle: 'paramétrage des appels de fonds',
      detail: `Un paramétrage d'appels de fonds (ModeCalculAppelFonds) est attaché à cette société. Supprimez-le d'abord.`,
    });
  }

  return blocages;
}

/** Message 409 agrégé pour l'ensemble des motifs de blocage. */
export function messageSuppressionBloquee(blocages: BlocageSuppression[]): string {
  return `Impossible de supprimer cette société : ${blocages.map((b) => b.detail).join(' ')}`;
}

// ─── Liaison externe (SPEC-6) ───────────────────────────────────────────────

/**
 * Normalise un e-mail de liaison (trim, minuscules) — même canon que la
 * résolution de liaison-externe.ts (comparaison mode: 'insensitive', e-mails
 * trimés). Retourne null si vide (champ optionnel).
 */
export function normaliserEmailLiaison(email: string | null | undefined): string | null {
  const propre = (email ?? '').trim().toLowerCase();
  return propre || null;
}

/** Fiche minimale pour la garde d'ambiguïté de la liaison externe. */
export interface SocieteLiaisonMin {
  id: string;
  nom: string;
  emailContactPrincipal?: string | null;
}

/**
 * Garde d'ambiguïté (SPEC-6) : un e-mail de contact principal ne peut lier
 * qu'UNE société — sinon la résolution du portail CONTACT_ENTREPRISE
 * (findFirst par e-mail) devient indéterminée.
 *
 * `exclureId` exclut la société en cours d'édition. Retourne la société qui
 * porte déjà cet e-mail, ou null.
 */
export function detecterConflitLiaisonEmail(
  emailCandidat: string | null | undefined,
  existantes: SocieteLiaisonMin[],
  exclureId?: string
): SocieteLiaisonMin | null {
  const emailNormalise = normaliserEmailLiaison(emailCandidat);
  if (!emailNormalise) return null;

  for (const existante of existantes) {
    if (exclureId && existante.id === exclureId) continue;
    const emailExistant = normaliserEmailLiaison(existante.emailContactPrincipal);
    if (emailExistant && emailExistant === emailNormalise) return existante;
  }
  return null;
}

// ─── Audit par champ (SPEC-3) ───────────────────────────────────────────────

/** Champs de fiche société auditées champ par champ lors d'une modification. */
export const CHAMPS_AUDIT_SOCIETE = [
  'nom',
  'adresse',
  'telephone',
  'email',
  'nif',
  'contactPrincipal',
  'emailContactPrincipal',
  'actif',
] as const;

export type ChampAuditSociete = (typeof CHAMPS_AUDIT_SOCIETE)[number];

/**
 * Calcule les différences champ par champ entre l'état existant et les
 * valeurs nouvelles (undefined = champ inchangé, non audité).
 * Les valeurs sont normalisées en chaîne pour la comparaison (booleans,
 * null vs undefined). Retourne la liste des champs réellement modifiés avec
 * ancienne / nouvelle valeur prêtes pour logParametreChange.
 */
export function differencesSociete<
  E extends Record<string, unknown>,
  N extends Record<string, unknown | undefined>,
>(existant: E, nouveau: N): { champ: ChampAuditSociete; ancienne: unknown; nouvelle: unknown }[] {
  const diffs: { champ: ChampAuditSociete; ancienne: unknown; nouvelle: unknown }[] = [];

  for (const champ of CHAMPS_AUDIT_SOCIETE) {
    if (!(champ in nouveau)) continue;
    const nouvelleValeur = nouveau[champ];
    if (nouvelleValeur === undefined) continue;
    const ancienneValeur = existant[champ];

    const ancienneCanon = ancienneValeur === null || ancienneValeur === undefined ? null : ancienneValeur;
    const nouvelleCanon = nouvelleValeur === null || nouvelleValeur === undefined ? null : nouvelleValeur;

    if (String(ancienneCanon) !== String(nouvelleCanon)) {
      diffs.push({ champ, ancienne: ancienneCanon, nouvelle: nouvelleCanon });
    }
  }

  return diffs;
}
