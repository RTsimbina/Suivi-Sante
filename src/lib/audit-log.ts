import { db } from './db';
import {
  type AuditAction,
  type AuditNiveau,
} from './referentiels';
import {
  diffFields,
  serialiserValeurAudit,
  buildOperationId,
  type ChampDiff,
} from './audit-diff';

// Ré-export pour compatibilité avec les usages existants
export { diffFields };
export type { AuditAction, AuditNiveau };

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AuditParams {
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: unknown;
  nouvelleValeur: unknown;
  modifiePar: string;
  modifieParId?: string;
  // Rôle de l'utilisateur au moment de l'opération — figé dans le journal
  // (l'exigence d'audit impose de conserver le rôle TEL QU'IL ÉTAIT : le rôle
  // actuel de l'utilisateur peut évoluer après coup, la trace doit rester fidèle).
  roleUtilisateur?: string;
  /** Identifiant d'opération (généré automatiquement par logAuditOperation) */
  operationId?: string;

  // Champs enrichis (optionnels — remplis automatiquement si request fournie)
  action?: AuditAction;
  niveau?: AuditNiveau;
  module?: string;
  objet?: string;
  societeId?: string;
  motif?: string;
  // Requête HTTP pour extraire IP / navigateur / session
  request?: Request;
}

// ─── Mapping entité → module lisible (exporté pour la route historique) ─────

export const ENTITE_MODULE_MAP: Record<string, string> = {
  Bareme: 'Barèmes',
  Contrat: 'Contrats',
  Utilisateur: 'Utilisateurs',
  Societe: 'Sociétés',
  Prestataire: 'Prestataires',
  PrestataireSociete: 'Prestataire/Société',
  Assure: 'Assurés',
  Gestionnaire: 'Gestionnaires',
  EntrepriseContact: 'Contacts Entreprise',
  Dossier: 'Dossiers',
  Courriel: 'Courriels',
  AppelDeFonds: 'Appels de fonds',
  Justificatif: 'Justificatifs',
};

// ─── Champs sensibles (classification SENSIBLE ou CRITIQUE) ─────────────────

const CHAMPS_SENSIBLES: Record<string, string[]> = {
  Bareme: ['tauxCouverture', 'plafond', 'active'],
  Contrat: ['budgetAnnuel', 'statut', 'dateFin'],
  Utilisateur: ['role', 'actif', 'password'],
  Societe: ['nom', 'nif', 'actif'],
  // Libellés FR utilisés par /api/prestataires pour la traçabilité par champ :
  // identifiers (NIF, Num STAT), RIB et activation sont des données sensibles.
  Prestataire: [
    'NIF', 'Num STAT', 'RIB / Coordonnées bancaires', 'Compte actif',
    'Nom / Raison sociale',
  ],
  PrestataireSociete: ['actif'],
  Assure: ['actif', 'bareme', 'typeBeneficiaire'],
  Dossier: ['statut', 'montantValide', 'montantReclame', 'ticketModerateur'],
};

// ─── Classification automatique du niveau ──────────────────────────────────

function classifyNiveau(
  action: AuditAction,
  entite: string,
  champ: string
): AuditNiveau {
  // Toute suppression = CRITIQUE
  if (action === 'SUPPRESSION') return 'CRITIQUE';

  // Toute création = INFO
  if (action === 'CREATION') return 'INFO';

  // Modification : vérifier si le champ est sensible
  const sensibles = CHAMPS_SENSIBLES[entite];
  if (sensibles && sensibles.includes(champ)) {
    return 'SENSIBLE';
  }

  return 'STANDARD';
}

// ─── Déduire l'action depuis le champ ──────────────────────────────────────

function deduceAction(champ: string): AuditAction {
  if (champ === 'CREATION') return 'CREATION';
  if (champ === 'SUPPRESSION') return 'SUPPRESSION';
  return 'MODIFICATION';
}

// ─── Extraire le contexte de la requête HTTP ────────────────────────────────

function extractRequestContext(request: Request) {
  let ipAdresse: string | undefined;
  let navigateur: string | undefined;
  let sessionId: string | undefined;

  // IP : forwarded ou remote
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    ipAdresse = forwarded.split(',')[0].trim();
  } else {
    ipAdresse = request.headers.get('x-real-ip') || undefined;
  }

  // Navigateur : user-agent (tronqué à 200 chars)
  const ua = request.headers.get('user-agent');
  if (ua) {
    let browserName = ua;
    if (ua.includes('Edg/')) browserName = 'Edge ' + ua.match(/Edg\/(\d+\.\d+)/)?.[1];
    else if (ua.includes('Chrome/')) browserName = 'Chrome ' + ua.match(/Chrome\/(\d+\.\d+)/)?.[1];
    else if (ua.includes('Firefox/')) browserName = 'Firefox ' + ua.match(/Firefox\/(\d+\.\d+)/)?.[1];
    else if (ua.includes('Safari/')) browserName = 'Safari ' + ua.match(/Version\/(\d+\.\d+)/)?.[1];
    navigateur = browserName?.slice(0, 200);
  }

  // Session ID depuis le cookie next-auth
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionMatch = cookieHeader.match(/next-auth\.session-token=([^;]+)/);
  if (sessionMatch) {
    sessionId = sessionMatch[1].slice(0, 16).toUpperCase();
  }

  return { ipAdresse, navigateur, sessionId };
}

// ─── Fonction principale de logging (une ligne par champ) ──────────────────

/**
 * Enregistre UNE LIGNE dans le journal d'audit immuable.
 * Ce journal est en lecture seule — aucune fonction de suppression ou
 * modification n'est exposée, et la table n'est accessible qu'aux profils
 * autorisés (route GET réservée à ADMINISTRATEUR, cf. API_PERMISSIONS).
 *
 * La classification du niveau (INFO/STANDARD/SENSIBLE/CRITIQUE) est automatique
 * sauf si `niveau` est explicitement fourni.
 *
 * Pour tracer une modification multi-champs, préférer `logAuditOperation()`
 * qui regroupe les lignes sous un même `operationId`.
 */
export async function logParametreChange(params: AuditParams): Promise<void> {
  try {
    const {
      entite, entiteId, champ,
      ancienneValeur, nouvelleValeur, modifiePar,
      modifieParId, roleUtilisateur, operationId, action: actionOverride, niveau: niveauOverride,

      module: moduleOverride, objet: objetOverride,
      societeId, motif, request,
    } = params;

    // Déduire l'action si non fournie
    const action = actionOverride || deduceAction(champ);

    // Classification automatique du niveau
    const niveau = niveauOverride || classifyNiveau(action, entite, champ);

    // Module lisible
    const moduleLabel = moduleOverride || ENTITE_MODULE_MAP[entite] || entite;

    // Ne pas logger si les valeurs sont identiques (sauf création/suppression)
    if (action === 'MODIFICATION') {
      const oldStr = serialiserValeurAudit(ancienneValeur);
      const newStr = serialiserValeurAudit(nouvelleValeur);
      if (oldStr === newStr) return;
    }

    // Contexte requête
    const ctx = request ? extractRequestContext(request) : { ipAdresse: undefined, navigateur: undefined, sessionId: undefined };

    await db.historiqueParametre.create({
      data: {
        entite,
        entiteId,
        champ,
        ancienneValeur: serialiserValeurAudit(ancienneValeur),
        nouvelleValeur: serialiserValeurAudit(nouvelleValeur),
        modifiePar,
        modifieParId: modifieParId || null,
        roleUtilisateur: roleUtilisateur || null,
        operationId: operationId || null,

        action,
        niveau,
        module: moduleLabel,
        objet: objetOverride || null,
        societeId: societeId || null,
        ipAdresse: ctx.ipAdresse || null,
        navigateur: ctx.navigateur || null,
        sessionId: ctx.sessionId || null,
        motif: motif || null,
      },
    });
  } catch (error) {
    // L'audit log ne doit jamais faire planter l'opération principale
    console.error('[AuditLog] Erreur lors de l\'enregistrement :', error);
  }
}

/**
 * Purge code mort : logAudit (alias jamais utilisé) supprimé —
 * utiliser logParametreChange directement.
 */

// ─── Audit par opération (1 opération = N champs, un seul operationId) ──────

/**
 * Trace une opération complète dans le journal d'audit, champ par champ :
 *  - MODIFICATION : compare `ancien` et `nouveau`, écrit UNE LIGNE PAR CHAMP
 *    réellement modifié, toutes regroupées sous le même `operationId`.
 *  - CREATION / SUPPRESSION : écrit une ligne unique (champ 'CREATION' /
 *    'SUPPRESSION') avec le résumé de l'objet.
 *
 * @returns l'operationId généré (utile pour corréler les lignes en base).
 *
 * L'échec d'audit ne fait jamais planter l'opération métier (try/catch interne).
 */
export async function logAuditOperation(
  params:
    | (import('./audit-diff').AuditModificationParams & { roleUtilisateur?: string })
    | (import('./audit-diff').AuditActionSimpleParams & { roleUtilisateur?: string })
): Promise<string> {
  const operationId = buildOperationId();

  try {
    const base = {
      entite: params.entite,
      entiteId: params.entiteId,
      action: params.action,
      modifiePar: params.modifiePar,
      modifieParId: params.modifieParId,
      roleUtilisateur: params.roleUtilisateur,
      module: params.module,
      objet: params.objet,
      societeId: params.societeId,
      motif: params.motif,
      request: params.request,
    };

    if (params.action === 'MODIFICATION') {
      const diffs: ChampDiff[] = diffFields(params.ancien, params.nouveau);

      // Rien n'a changé : ne pas polluer le journal
      if (diffs.length === 0) return operationId;

      for (const diff of diffs) {
        await logParametreChange({
          ...base,
          champ: diff.champ,
          ancienneValeur: diff.ancienneValeur,
          nouvelleValeur: diff.nouvelleValeur,
          operationId,
        });
      }
    } else {
      // CREATION / SUPPRESSION : une seule ligne résumé
      await logParametreChange({
        ...base,
        champ: params.action,
        ancienneValeur: params.action === 'SUPPRESSION' ? (params.resume ?? null) : null,
        nouvelleValeur: params.action === 'CREATION' ? (params.resume ?? null) : null,
        operationId,
      });
    }
  } catch (error) {
    console.error('[AuditLog] Erreur lors de l\'enregistrement de l\'opération :', error);
  }

  return operationId;
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

/**
 * Extrait l'ID utilisateur depuis les headers de la requête (x-user-id).
 * Fallback sur "inconnu" si l'header est absent.
 */
function getUserIdFromRequest(request: Request): string {
  return request.headers.get('x-user-id') || 'inconnu';
}

/**
 * Extrait le nom complet + ID + rôle utilisateur depuis une requête authentifiée.
 * Utilise le token JWT si disponible (le rôle vient du JWT signé, jamais d'un
 * header falsifiable côté client).
 */
export async function getUserInfoFromRequest(
  request: Request
): Promise<{ nom: string; id: string; role?: string }> {
  try {
    const { getToken } = await import('next-auth/jwt');
    const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      return {
        nom: (token.nom as string) || (token.email as string) || 'inconnu',
        id: (token.id as string) || 'inconnu',
        role: (token.role as string) || undefined,
      };
    }
  } catch { /* fallback */ }
  return { nom: getUserIdFromRequest(request), id: 'inconnu' };
}

/**
 * Note : diffFields vit désormais dans audit-diff.ts (ré-exporté ci-dessus) ;
 * les libellés d'audit (actions/niveaux) vivent dans referentiels.ts.
 */

