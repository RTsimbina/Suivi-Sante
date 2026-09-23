/**
 * ─── Isolation des données par société (RLS applicatif) ───────────────────
 *
 * POINT CENTRAL du périmètre société : toute route API qui lit des données
 * rattachées à une Societe (dossiers, contrats, assurés, sociétés, suivi,
 * commentaires) doit passer par les fonctions de ce module.
 *
 * CHAÎNE DE CONFIANCE — le navigateur n'est JAMAIS la source du périmètre :
 *
 *   1. Login (src/lib/auth.ts) : le societeId est résolu CÔTÉ SERVEUR
 *        PORTAIL_CLIENT      → Assure rattaché à l'e-mail du compte
 *        CONTACT_ENTREPRISE  → EntrepriseContact rattaché à l'e-mail du compte
 *        PRESTATAIRE         → Prestataire rattaché à l'e-mail du compte
 *   2. JWT signé (8 h) : token.societeId — non modifiable par le client
 *   3. Middleware (src/proxy.ts) : header x-user-societeid ÉCRASÉ depuis le JWT
 *      (toute valeur envoyée par le navigateur est écrasée, donc non falsifiable)
 *   4. Handler : request.headers.get('x-user-societeid') = SEULE source admise.
 *      Un ?societeId=... transmis par le client ne peut que RESTREINDRE
 *      davantage le périmètre (intersection), jamais l'élargir.
 *
 * RÈGLES :
 *   - Rôles internes (ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE, SANTE)
 *     → périmètre GLOBAL (outillage interne : toutes les sociétés).
 *   - Rôles externes (PORTAIL_CLIENT, CONTACT_ENTREPRISE)
 *     → périmètre FORCÉ sur leur société. FAIL-CLOSED : un compte externe
 *       sans société rattachée est refusé (403), jamais servi avec une liste
 *       vide silencieuse qui masquerait un compte mal provisionné.
 *   - Rôle PRESTATAIRE : le périmètre société ne s'applique pas (un
 *     prestataire conventionne avec PLUSIEURS sociétés clientes). Son
 *     identité est le prestataireId résolu côté serveur — voir les
 *     fonctions perimetrePrestataire* ci-dessous. Sur les routes à
 *     périmètre société il est refusé en fail-closed (403).
 *   - Accès unitaires hors périmètre → 404 (jamais 403) : ne pas révéler
 *     l'existence d'un dossier/contrat d'une autre société.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { Prisma } from "@prisma/client";
import {
  INTERNAL_ROLES as INTERNAL_ROLES_SOURCE,
  EXTERNAL_ROLES as EXTERNAL_ROLES_SOURCE,
} from "./referentiels";

/** Rôles internes : périmètre global (toutes les sociétés) — source : referentiels.ts */
export const INTERNAL_ROLES = INTERNAL_ROLES_SOURCE;

/** Rôles externes : périmètre forcé sur la société rattachée au compte — source : referentiels.ts */
export const EXTERNAL_ROLES = EXTERNAL_ROLES_SOURCE;

/** Message renvoyé à un compte externe sans société rattachée (fail-closed). */
export const ERREUR_SANS_SOCIETE =
  "Ce compte n'est rattaché à aucune société. Contactez l'administrateur.";

/** Message renvoyé à un compte prestataire hors routes dédiées (fail-closed). */
export const ERREUR_HORS_PORTAIL_PRESTATAIRE =
  "Ce compte prestataire n'accède qu'au Portail Prestataire. Contactez l'administrateur.";

/** Périmètre de société d'un utilisateur authentifié. */
export interface PerimetreSociete {
  /** true → les requêtes DOIVENT être filtrées par societeId */
  restricted: boolean;
  /** société imposée si restricted ; null pour les rôles internes */
  societeId: string | null;
  /** présent quand un rôle externe n'est rattaché à aucune société → 403 */
  refusal: string | null;
}

/**
 * Résout le périmètre depuis l'identité SERVEUR (rôle + societeId du JWT).
 * - Rôle externe + société    → restreint à cette société
 * - Rôle externe sans société → refus (fail-closed)
 * - Rôle PRESTATAIRE          → refus sur les routes à périmètre société
 *                               (son périmètre propre est prestataireId,
 *                               voir perimetrePrestataireDepuisHeaders)
 * - Rôle interne              → périmètre global (un header societeId
 *                               résiduel est ignoré : il ne fait pas foi)
 * - Rôle inconnu              → refus par défaut (défense en profondeur)
 */
export function resoudrePerimetre(
  userRole: string,
  societeIdServeur: string | null | undefined
): PerimetreSociete {
  const role = (userRole || '').trim();

  if ((EXTERNAL_ROLES as readonly string[]).includes(role)) {
    const societeId = (societeIdServeur || '').trim();
    if (!societeId) {
      return { restricted: true, societeId: null, refusal: ERREUR_SANS_SOCIETE };
    }
    return { restricted: true, societeId, refusal: null };
  }

  if ((INTERNAL_ROLES as readonly string[]).includes(role)) {
    return { restricted: false, societeId: null, refusal: null };
  }

  // Rôle PRESTATAIRE : pas de périmètre société (multi-sociétés par
  // convention) — mais JAMAIS d'accès aux routes à périmètre société.
  if (role === 'PRESTATAIRE') {
    return { restricted: true, societeId: null, refusal: ERREUR_HORS_PORTAIL_PRESTATAIRE };
  }

  // Rôle non répertorié : fail-closed. En pratique le middleware ne laisse
  // passer que les rôles déclarés dans API_PERMISSIONS, mais on ne prend
  // aucun risque si un nouveau rôle apparaît sans passer ici.
  return { restricted: true, societeId: null, refusal: ERREUR_SANS_SOCIETE };
}

/**
 * Extrait le périmètre depuis les headers injectés par le middleware
 * (x-user-role / x-user-societeid — écrasés depuis le JWT signé, donc
 * non falsifiables par le navigateur).
 */
export function perimetreDepuisHeaders(headers: Headers): PerimetreSociete {
  return resoudrePerimetre(
    headers.get('x-user-role') || '',
    headers.get('x-user-societeid')
  );
}

/**
 * À appeler juste après checkAuth : renvoie une Response 403 si le périmètre
 * est invalide (rôle externe sans société, rôle inconnu), sinon null.
 */
export function refuserHorsPerimetre(perimetre: PerimetreSociete): Response | null {
  if (perimetre.refusal) {
    return Response.json({ erreur: perimetre.refusal }, { status: 403 });
  }
  return null;
}

/**
 * Fusionne le périmètre dans un where Prisma existant en ÉCRASANT tout
 * societeId transmis par le client (query/body). À utiliser sur les tables
 * portant une colonne societeId (Dossier, Contrat, Assure).
 *
 * No-op pour les rôles internes : le filtre client éventuel est conservé.
 * Pré-condition : refuserHorsPerimetre a déjà été appelé (pas de refusal).
 */
export function avecPerimetreSociete<T>(where: T, perimetre: PerimetreSociete): T {
  if (!perimetre.restricted || !perimetre.societeId) return where;
  return { ...(where as Record<string, unknown>), societeId: perimetre.societeId } as T;
}

/**
 * Variante pour la table Societe elle-même : le périmètre filtre sur `id`
 * (un contact d'entreprise ne liste que SA société, pas un filtre societeId).
 */
export function avecPerimetreSocieteCourante<T>(
  where: T,
  perimetre: PerimetreSociete
): T {
  if (!perimetre.restricted || !perimetre.societeId) return where;
  return { ...(where as Record<string, unknown>), id: perimetre.societeId } as T;
}

// ═══════════════════════════════════════════════════════════════════════
// ─── Périmètre PRESTATAIRE (Portail Prestataire) ─────────────────────
//
// Même chaîne de confiance que le périmètre société :
//   1. Login (src/lib/auth.ts)  : prestataireId résolu CÔTÉ SERVEUR
//                                 (fiche Prestataire portant l'e-mail du compte)
//   2. JWT signé (8 h)          : token.prestataireId — non falsifiable
//   3. Middleware (src/proxy.ts): header x-user-prestataireid ÉCRASÉ depuis
//                                 le JWT (toute valeur navigateur est écrasée)
//   4. Handler                  : perimetrePrestataireDepuisHeaders(headers)
//                                 = SEULE source admise. Un ?prestataireId=…
//                                 fourni par le client qui ne correspond PAS
//                                 à l'identité serveur est un rejet (403).
//
// FAIL-CLOSED : un compte PRESTATAIRE sans prestataire résolu est refusé
// (403 actionnable), jamais servi avec une liste vide silencieuse.
// ═══════════════════════════════════════════════════════════════════════

/** Message renvoyé à un compte PRESTATAIRE sans fiche rattachée (fail-closed). */
export const ERREUR_SANS_PRESTATAIRE =
  "Aucun prestataire n'est rattaché à votre compte. Vérifiez que la fiche du prestataire (GESTION → Prestataires) porte exactement l'e-mail de ce compte ; une fois corrigé, rechargez cette page.";

/** Périmètre prestataire d'un utilisateur authentifié. */
export interface PerimetrePrestataire {
  /** true → les requêtes DOIVENT être filtrées par prestataireId */
  restricted: boolean;
  /** prestataire imposé si restricted ; null pour les rôles internes */
  prestataireId: string | null;
  /** présent quand le périmètre est invalide → 403 */
  refusal: string | null;
}

/**
 * Résout le périmètre prestataire depuis l'identité SERVEUR.
 * - PRESTATAIRE + prestataireId → restreint à ce prestataire
 * - PRESTATAIRE sans prestataireId → refus (fail-closed)
 * - ADMINISTRATEUR → périmètre global (mode démonstration du portail :
 *   la route renvoie un message, jamais de données d'un prestataire choisi)
 * - Autre rôle → refus par défaut (défense en profondeur)
 */
export function resoudrePerimetrePrestataire(
  userRole: string,
  prestataireIdServeur: string | null | undefined
): PerimetrePrestataire {
  const role = (userRole || '').trim();

  if (role === 'PRESTATAIRE') {
    const prestataireId = (prestataireIdServeur || '').trim();
    if (!prestataireId) {
      return { restricted: true, prestataireId: null, refusal: ERREUR_SANS_PRESTATAIRE };
    }
    return { restricted: true, prestataireId, refusal: null };
  }

  if (role === 'ADMINISTRATEUR') {
    return { restricted: false, prestataireId: null, refusal: null };
  }

  // Tout autre rôle : fail-closed (le middleware ne laisse déjà passer
  // que PRESTATAIRE / ADMINISTRATEUR sur ces routes, défense en profondeur).
  return { restricted: true, prestataireId: null, refusal: 'Accès refusé.' };
}

/**
 * Extrait le périmètre prestataire depuis les headers injectés par le
 * middleware (x-user-role / x-user-prestataireid — écrasés depuis le JWT
 * signé, donc non falsifiables par le navigateur).
 */
export function perimetrePrestataireDepuisHeaders(headers: Headers): PerimetrePrestataire {
  return resoudrePerimetrePrestataire(
    headers.get('x-user-role') || '',
    headers.get('x-user-prestataireid')
  );
}

/**
 * À appeler juste après la résolution du périmètre : renvoie une Response 403
 * si le périmètre est invalide, sinon null.
 */
export function refuserHorsPerimetrePrestataire(
  perimetre: PerimetrePrestataire
): Response | null {
  if (perimetre.refusal) {
    return Response.json({ erreur: perimetre.refusal }, { status: 403 });
  }
  return null;
}

/**
 * Fusionne le périmètre dans un where Prisma en ÉCRASANT tout prestataireId
 * transmis par le client (query/body). Pré-condition :
 * refuserHorsPerimetrePrestataire a déjà été appelé (pas de refusal).
 */
export function avecPerimetrePrestataire<T>(
  where: T,
  perimetre: PerimetrePrestataire
): T {
  if (!perimetre.restricted || !perimetre.prestataireId) return where;
  return { ...(where as Record<string, unknown>), prestataireId: perimetre.prestataireId } as T;
}

/**
 * Rejet explicite (403) si le client transmet un prestataireId qui ne
 * correspond pas à l'identité serveur. Utilisé par les routes du portail :
 * un prestataire A qui tente ?prestataireId=B est REFUSÉ (et non silencieusement
 * ignoré) — le serveur ne révèle rien sur B.
 */
export function refuserPrestataireIdEtranger(
  prestataireIdClient: string | null | undefined,
  prestataireIdServeur: string
): Response | null {
  const fourni = (prestataireIdClient || '').trim();
  if (fourni && fourni !== prestataireIdServeur) {
    return Response.json(
      { erreur: 'Accès refusé : vous ne pouvez consulter que les données de votre propre prestataire.' },
      { status: 403 }
    );
  }
  return null;
}
