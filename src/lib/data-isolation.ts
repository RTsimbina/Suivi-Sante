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
 *   - Accès unitaires hors périmètre → 404 (jamais 403) : ne pas révéler
 *     l'existence d'un dossier/contrat d'une autre société.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Rôles internes : périmètre global (toutes les sociétés). */
export const INTERNAL_ROLES = [
  'ADMINISTRATEUR',
  'ACCUEIL',
  'TECHNIQUE',
  'COMPTABILITE',
  'SANTE',
] as const;

/** Rôles externes : périmètre forcé sur la société rattachée au compte. */
export const EXTERNAL_ROLES = ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE'] as const;

/** Message renvoyé à un compte externe sans société rattachée (fail-closed). */
export const ERREUR_SANS_SOCIETE =
  "Ce compte n'est rattaché à aucune société. Contactez l'administrateur.";

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
