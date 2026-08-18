import { db } from './db';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuditAction = 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
export type AuditNiveau = 'INFO' | 'STANDARD' | 'SENSIBLE' | 'CRITIQUE';

export interface AuditParams {
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: unknown;
  nouvelleValeur: unknown;
  modifiePar: string;
  modifieParId?: string;
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

// ─── Mapping entité → module lisible ────────────────────────────────────────

const ENTITE_MODULE_MAP: Record<string, string> = {
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
};

// ─── Champs sensibles (classification SENSIBLE ou CRITIQUE) ─────────────────

const CHAMPS_SENSIBLES: Record<string, string[]> = {
  Bareme: ['tauxCouverture', 'plafond', 'active'],
  Contrat: ['budgetAnnuel', 'statut', 'dateFin'],
  Utilisateur: ['role', 'actif', 'password'],
  Societe: ['nom', 'nif', 'actif'],
  Prestataire: ['actif', 'rib', 'nif'],
  PrestataireSociete: ['actif'],
  Assure: ['actif', 'bareme', 'typeBeneficiaire'],
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
    // Champs très critiques
    const champsCritiques = ['actif', 'role', 'password', 'budgetAnnuel'];
    if (champsCritiques.includes(champ)) return 'SENSIBLE';
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
    // Extraire le nom du navigateur de manière simplifiée
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

// ─── Générer un numéro de journal ──────────────────────────────────────────

function generateJournalNumber(date: Date, index: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = String(index).padStart(6, '0');
  return `AUD-${y}${m}${d}-${seq}`;
}

// ─── Fonction principale de logging ────────────────────────────────────────

/**
 * Enregistre une opération dans le journal d'audit immuable.
 * Ce journal est en lecture seule — aucune fonction de suppression ou modification n'est exposée.
 *
 * La classification du niveau (INFO/STANDARD/SENSIBLE/CRITIQUE) est automatique
 * sauf si `niveau` est explicitement fourni.
 */
export async function logParametreChange(params: AuditParams): Promise<void> {
  try {
    const {
      entite, entiteId, champ,
      ancienneValeur, nouvelleValeur, modifiePar,
      modifieParId, action: actionOverride, niveau: niveauOverride,
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
      const oldStr = ancienneValeur === undefined || ancienneValeur === null ? null : String(ancienneValeur);
      const newStr = nouvelleValeur === undefined || nouvelleValeur === null ? null : String(nouvelleValeur);
      if (oldStr === newStr) return;
    }

    const oldStr = ancienneValeur === undefined || ancienneValeur === null ? null : String(ancienneValeur);
    const newStr = nouvelleValeur === undefined || nouvelleValeur === null ? null : String(nouvelleValeur);

    // Contexte requête
    const ctx = request ? extractRequestContext(request) : { ipAdresse: undefined, navigateur: undefined, sessionId: undefined };

    await db.historiqueParametre.create({
      data: {
        entite,
        entiteId,
        champ,
        ancienneValeur: oldStr,
        nouvelleValeur: newStr,
        modifiePar,
        modifieParId: modifieParId || null,
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
 * Enregistre une modification de paramètre (compatibilité arrière).
 * Les anciens appels sans les nouveaux champs continuent de fonctionner.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  return logParametreChange(params);
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

/**
 * Extrait l'ID utilisateur depuis les headers de la requête (x-user-id).
 * Fallback sur "inconnu" si l'header est absent.
 */
export function getUserIdFromRequest(request: Request): string {
  return request.headers.get('x-user-id') || 'inconnu';
}

/**
 * Extrait le nom complet + ID utilisateur depuis une requête authentifiée.
 * Utilise le token JWT si disponible.
 */
export async function getUserInfoFromRequest(request: Request): Promise<{ nom: string; id: string }> {
  try {
    const { getToken } = await import('next-auth/jwt');
    const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      return {
        nom: (token.nom as string) || (token.email as string) || 'inconnu',
        id: (token.id as string) || 'inconnu',
      };
    }
  } catch { /* fallback */ }
  return { nom: getUserIdFromRequest(request), id: 'inconnu' };
}

/**
 * Compare deux objets et retourne la liste des champs modifiés.
 * Utile pour les mises à jour partielles où on veut logger uniquement les champs changés.
 */
export function diffFields(
  oldRecord: Record<string, unknown>,
  newValues: Record<string, unknown>
): { champ: string; ancienneValeur: unknown; nouvelleValeur: unknown }[] {
  const changes: { champ: string; ancienneValeur: unknown; nouvelleValeur: unknown }[] = [];

  for (const [key, newVal] of Object.entries(newValues)) {
    if (newVal === undefined) continue;
    const oldVal = oldRecord[key];
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({ champ: key, ancienneValeur: oldVal, nouvelleValeur: newVal });
    }
  }

  return changes;
}

// ─── Constantes exportées pour le frontend ──────────────────────────────────

export const AUDIT_ACTIONS: { value: AuditAction; label: string; icon: string }[] = [
  { value: 'CREATION', label: 'Création', icon: '➕' },
  { value: 'MODIFICATION', label: 'Modification', icon: '✏️' },
  { value: 'SUPPRESSION', label: 'Suppression', icon: '🗑' },
];

export const AUDIT_NIVEAUX: { value: AuditNiveau; label: string; icon: string; color: string }[] = [
  { value: 'INFO', label: 'Information', icon: '🟢', color: 'emerald' },
  { value: 'STANDARD', label: 'Modification standard', icon: '🟡', color: 'amber' },
  { value: 'SENSIBLE', label: 'Modification sensible', icon: '🟠', color: 'orange' },
  { value: 'CRITIQUE', label: 'Critique', icon: '🔴', color: 'red' },
];

export const AUDIT_MODULES = Object.entries(ENTITE_MODULE_MAP).map(([key, label]) => ({
  value: key,
  label,
}));
