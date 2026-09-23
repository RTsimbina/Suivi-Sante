// ─── Audit par champ — Utilitaires purs (sans accès base) ──────────────────
// Ce module est volontairement pur (aucun import de db) pour être testable.
// audit-log.ts l'utilise pour produire une ligne de journal PAR CHAMP modifié,
// toutes regroupées sous un même identifiant d'opération (operationId).
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditAction } from './referentiels';

// ─── Diff champ par champ ───────────────────────────────────────────────────

export interface ChampDiff {
  champ: string;
  ancienneValeur: unknown;
  nouvelleValeur: unknown;
}

/**
 * Compare un enregistrement existant avec les nouvelles valeurs et retourne
 * la liste des champs réellement modifiés.
 * Les valeurs undefined (absentes du payload) sont ignorées.
 */
export function diffFields(
  oldRecord: Record<string, unknown>,
  newValues: Record<string, unknown>
): ChampDiff[] {
  const changes: ChampDiff[] = [];

  for (const [key, newVal] of Object.entries(newValues)) {
    if (newVal === undefined) continue;
    const oldVal = oldRecord[key];
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({ champ: key, ancienneValeur: oldVal, nouvelleValeur: newVal });
    }
  }

  return changes;
}

// ─── Sérialisation des valeurs pour le journal ──────────────────────────────

/** Longueur maximale stockée dans ancienneValeur/nouvelleValeur. */
export const AUDIT_VALEUR_MAX = 1000;

/**
 * Sérialise une valeur pour stockage dans le journal :
 * null/undefined → null, objets → JSON, chaînes tronquées à 1000 caractères.
 */
export function serialiserValeurAudit(valeur: unknown): string | null {
  if (valeur === undefined || valeur === null) return null;
  let str: string;
  if (typeof valeur === 'string') {
    str = valeur;
  } else if (valeur instanceof Date) {
    str = valeur.toISOString();
  } else if (typeof valeur === 'object') {
    try {
      str = JSON.stringify(valeur);
    } catch {
      str = String(valeur);
    }
  } else {
    str = String(valeur);
  }
  if (str.length > AUDIT_VALEUR_MAX) {
    str = str.slice(0, AUDIT_VALEUR_MAX - 3) + '...';
  }
  return str;
}

// ─── Identifiant d'opération ────────────────────────────────────────────────

/**
 * Génère l'identifiant qui regroupe toutes les lignes de journal d'une même
 * opération (ex: modification de 4 champs d'une société = 4 lignes partageant
 * le même operationId).
 */
export function buildOperationId(): string {
  // globalThis.crypto est disponible dans Node >= 19 et dans les navigateurs
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback déterministe (tests / environnements sans crypto.randomUUID)
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Paramètres d'une opération d'audit ─────────────────────────────────────

export interface AuditOperationParams {
  /** Type d'entité (Bareme, Societe, Utilisateur…) */
  entite: string;
  /** ID de l'enregistrement concerné */
  entiteId: string;
  /** Action effectuée */
  action: AuditAction;
  /** Nom de l'utilisateur (ou email) */
  modifiePar: string;
  /** ID utilisateur (optionnel) */
  modifieParId?: string;
  /** Libellé du module (déduit de l'entité si absent) */
  module?: string;
  /** Description de l'objet (ex: nom de la société) */
  objet?: string;
  /** Société liée (pour le filtrage par société du journal) */
  societeId?: string;
  /** Motif de l'opération */
  motif?: string;
  /** Requête HTTP pour extraire IP / navigateur / session */
  request?: Request;
}

/** Paramètres pour une MODIFICATION : ancien enregistrement + nouvelles valeurs. */
export interface AuditModificationParams extends AuditOperationParams {
  action: 'MODIFICATION';
  /** Enregistrement avant modification */
  ancien: Record<string, unknown>;
  /** Valeurs envoyées (les undefined sont ignorés) */
  nouveau: Record<string, unknown>;
}

/** Paramètres pour une CREATION ou SUPPRESSION : une seule ligne "champ unique". */
export interface AuditActionSimpleParams extends AuditOperationParams {
  action: 'CREATION' | 'SUPPRESSION';
  /** Description de l'objet créé/supprimé (stockée dans nouvelleValeur/ancienneValeur) */
  resume?: string;
}
