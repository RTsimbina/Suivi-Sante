/**
 * ─── Navigation par URL réelles ────────────────────────────────────────────
 *
 * L'application interne vit sur la route unique `/` (src/app/page.tsx) : la
 * vue active y était mémorisée dans un `useState`, ce qui la perdait à chaque
 * actualisation (F5/Ctrl+R) — le navigateur rechargeait `/` sans aucune
 * information sur le module consulté.
 *
 * Ce module centralise la résolution de la vue à partir de l'URL :
 *
 *   /?vue=<clé>            → module (dossiers, technique, sante, ...)
 *   /?vue=technique&onglet=calcul → sous-module (onglets des vues)
 *   /?vue=profil           → profil utilisateur (menu utilisateur, tout rôle)
 *
 * Fonctions PURES (testées dans navigation.test.ts) — aucun appel React.
 * ────────────────────────────────────────────────────────────────────────── */

/** Clé de vue spéciale : profil de l'utilisateur connecté (menu utilisateur). */
export const VUE_PROFIL = 'profil';

/** Paramètre d'URL portant la vue active : /?vue=technique */
export const PARAM_VUE = 'vue';

/** Paramètre d'URL portant l'onglet d'une vue : /?vue=technique&onglet=calcul */
export const PARAM_ONGLET = 'onglet';

/**
 * Vue par défaut d'un rôle : la première navigation autorisée.
 * Le rôle ACCUEIL démarre sur « Accueil » (import), conformément à
 * l'expérience existante ; les autres rôles sur leur première vue.
 * Retourne null pour un rôle sans navigation interne (portails dédiés).
 */
export function vueParDefaut(role: string | null, clesAutorisees: string[]): string | null {
  if (!role || clesAutorisees.length === 0) return null;
  if (role === 'ACCUEIL' && clesAutorisees.includes('import')) return 'import';
  return clesAutorisees[0];
}

/**
 * Résout la vue active à partir de l'URL et du rôle.
 *
 * - vue absente, inconnue ou NON AUTORISÉE pour le rôle → vue par défaut du
 *   rôle, avec `urlCanonique` à corriger (router.replace) pour que l'URL
 *   reflète toujours la page affichée (garde de rôle préservé).
 * - `profil` est autorisé pour tout rôle connecté disposant d'une navigation.
 * - rôle sans navigation interne (PORTAIL_CLIENT, PRESTATAIRE…) → null :
 *   la page racine le redirige vers son portail dédié (comportement existant).
 */
export function resoudreVue(
  vueUrl: string | null,
  role: string | null,
  clesAutorisees: string[],
): { vue: string | null; urlCanonique: string | null } {
  const defaut = vueParDefaut(role, clesAutorisees);
  if (!defaut) return { vue: null, urlCanonique: null };
  if (vueUrl === VUE_PROFIL) return { vue: VUE_PROFIL, urlCanonique: null };
  if (vueUrl && clesAutorisees.includes(vueUrl)) return { vue: vueUrl, urlCanonique: null };
  return { vue: defaut, urlCanonique: `/?${PARAM_VUE}=${defaut}` };
}

/**
 * Un chemin est « local » s'il peut servir de destination post-connexion sans
 * risque d'open redirect : commence par un seul `/`, jamais un schéma ni un
 * protocole relatif (`//`, `\\`, `://`).
 */
export function estCheminLocal(chemin: string | null | undefined): boolean {
  if (!chemin) return false;
  if (!chemin.startsWith('/')) return false;
  if (chemin.startsWith('//') || chemin.startsWith('/\\')) return false;
  if (chemin.includes('://')) return false;
  return true;
}

/**
 * Destination après connexion : le callbackUrl s'il est local et n'est pas la
 * page de connexion elle-même (sinon boucle de redirection), sinon null
 * (l'appelant applique sa redirection par défaut selon le rôle).
 */
export function ciblePostConnexion(callbackUrl: string | null | undefined): string | null {
  if (!estCheminLocal(callbackUrl)) return null;
  if (callbackUrl!.startsWith('/login')) return null;
  return callbackUrl!;
}
