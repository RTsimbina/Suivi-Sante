import type { AssistantContext, ParamValeurs, PeriodeParams, RoleType } from './types';
import { AssistantError, INTERNAL_ROLES } from './types';
import type { QuestionParamDef } from './types';

// ─── Contexte de sécurité — enforcement de périmètre (100 % serveur) ─────────
//
// Règle d'or : le client ne fait que CHOISIR une question et éventuellement
// des paramètres. Le serveur :
//   1. vérifie que la question existe et appartient au rôle de l'utilisateur ;
//   2. dérive le périmètre (société / prestataire / assuré) depuis le compte
//      connecté — JAMAIS depuis les entrées client ;
//   3. valide/force les paramètres : toute valeur hors périmètre est rejetée.

/** Rôles externes restreints à leur propre périmètre de données */
export function isRoleExterne(role: RoleType): boolean {
  return !INTERNAL_ROLES.includes(role);
}

/**
 * Extrait le contexte de sécurité depuis le token JWT NextAuth.
 * Les identifiants de périmètre proviennent EXCLUSIVEMENT du token signé
 * (déjà dérivés côté serveur à la connexion dans src/lib/auth.ts).
 */
export function buildContext(token: {
  id?: string;
  role?: string;
  email?: string;
  nom?: string;
  assureId?: string;
  societeId?: string;
  prestataireId?: string;
}): AssistantContext {
  if (!token.id || !token.role) {
    throw new AssistantError('Session invalide. Veuillez vous reconnecter.', 401);
  }
  return {
    userId: token.id,
    role: token.role as RoleType,
    email: token.email ?? '',
    nom: token.nom ?? '',
    assureId: token.assureId ?? null,
    societeId: token.societeId ?? null,
    prestataireId: token.prestataireId ?? null,
  };
}

/**
 * Vérifie qu'un rôle externe possède bien son rattachement de données.
 * Un PRESTATAIRE sans prestataireId ne doit rien pouvoir interroger.
 */
export function exigerRattachement(ctx: AssistantContext, requis: 'assureId' | 'societeId' | 'prestataireId'): string {
  const valeur = ctx[requis];
  if (!valeur) {
    throw new AssistantError(
      'Aucun rattachement de données lié à votre compte. Contactez votre administrateur.',
      403
    );
  }
  return valeur;
}

/**
 * Valide les paramètres d'une question :
 *  - seuls les paramètres déclarés sont acceptés (les autres sont ignorés) ;
 *  - les valeurs sont contrôlées par type (injection impossible : les valeurs
 *    SOCIETE/PRESTATAIRE/ASSURE/DOSSIER sont des identifiants ou numéros
 *    vérifiés contre la base par les requêtes elles-mêmes, avec le scope
 *    forcé côté serveur).
 * Retourne uniquement les paramètres déclarés et valides.
 */
export function validerParams(declares: QuestionParamDef[], brutes: ParamValeurs | undefined): ParamValeurs {
  const valides: ParamValeurs = {};
  if (!brutes) return valides;
  for (const def of declares) {
    const brut = brutes[def.key];
    if (brut === undefined || brut === null || brut === '') {
      continue;
    }
    if (typeof brut !== 'string') {
      throw new AssistantError(`Paramètre ${def.key} invalide.`);
    }
    if (brut.length > 120) {
      throw new AssistantError(`Paramètre ${def.key} trop long.`);
    }
    valides[def.key] = brut;
  }
  return valides;
}

/**
 * Paramètres de période extraits d'un lot validé.
 * Le paramètre PERIODE est encodé sous forme "PRESET" ou
 * "PERSONNALISEE|du|au" côté client.
 */
export function extrairePeriode(valides: ParamValeurs): PeriodeParams | undefined {
  const brut = valides.PERIODE;
  if (!brut) return undefined;
  if (brut.startsWith('PERSONNALISEE|')) {
    const [, du, au] = brut.split('|');
    return { preset: 'PERSONNALISEE', du, au };
  }
  return { preset: brut as PeriodeParams['preset'] };
}

/**
 * Contrôle qu'un paramètre d'entité (société / prestataire / assuré)
 * appartient au périmètre autorisé de l'utilisateur.
 *
 * @param autorises Liste blanche d'identifiants (dérivée du compte serveur)
 * @param valeur Valeur demandée
 * @param libelle Libellé du paramètre (pour le message d'erreur)
 */
export function verifierAutorisationParam(
  autorises: string[] | null,
  valeur: string | undefined,
  libelle: string
): string | undefined {
  if (!valeur) return undefined;
  if (autorises === null) return valeur; // Rôle interne : accès global
  if (!autorises.includes(valeur)) {
    throw new AssistantError(
      `Accès refusé : la ${libelle} sélectionnée est hors de votre périmètre de données.`,
      403
    );
  }
  return valeur;
}
