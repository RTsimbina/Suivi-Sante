import { db } from './db';

/**
 * Enregistre une modification de paramètre dans le journal d'audit.
 * Ce journal est immutable : aucune fonction de suppression ou modification n'est exposée.
 *
 * @param params
 *   - entite        : type d'entité (ex: "Bareme", "Contrat", "Utilisateur", "Societe")
 *   - entiteId      : identifiant de l'enregistrement modifié
 *   - champ         : nom du champ modifié (ex: "tauxCouverture", "role", "budgetAnnuel")
 *   - ancienneValeur: valeur avant modification (sérialisée en string)
 *   - nouvelleValeur: valeur après modification (sérialisée en string)
 *   - modifiePar    : identifiant de l'utilisateur qui a effectué la modification
 */
export async function logParametreChange(params: {
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: unknown;
  nouvelleValeur: unknown;
  modifiePar: string;
}): Promise<void> {
  try {
    const { entite, entiteId, champ, ancienneValeur, nouvelleValeur, modifiePar } = params;

    // Ne pas logger si les valeurs sont identiques
    const oldStr = ancienneValeur === undefined || ancienneValeur === null ? null : String(ancienneValeur);
    const newStr = nouvelleValeur === undefined || nouvelleValeur === null ? null : String(nouvelleValeur);

    if (oldStr === newStr) return;

    await db.historiqueParametre.create({
      data: {
        entite,
        entiteId,
        champ,
        ancienneValeur: oldStr,
        nouvelleValeur: newStr,
        modifiePar,
      },
    });
  } catch (error) {
    // L'audit log ne doit jamais faire planter l'opération principale
    console.error('[AuditLog] Erreur lors de l\'enregistrement :', error);
  }
}

/**
 * Extrait l'ID utilisateur depuis les headers de la requête (x-user-id).
 * Fallback sur "inconnu" si l'header est absent.
 */
export function getUserIdFromRequest(request: Request): string {
  return request.headers.get('x-user-id') || 'inconnu';
}

/**
 * Compare deux objets et retourne la liste des champs modifiés.
 * Utile pour les mises à jour partielles où on veut logger uniquement les champs changés.
 *
 * @returns tableau de { champ, ancienneValeur, nouvelleValeur }
 */
export function diffFields(
  oldRecord: Record<string, unknown>,
  newValues: Record<string, unknown>
): { champ: string; ancienneValeur: unknown; nouvelleValeur: unknown }[] {
  const changes: { champ: string; ancienneValeur: unknown; nouvelleValeur: unknown }[] = [];

  for (const [key, newVal] of Object.entries(newValues)) {
    if (newVal === undefined) continue; // champ non fourni
    const oldVal = oldRecord[key];
    // Comparer en string pour gérer les Float, Date, etc.
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({ champ: key, ancienneValeur: oldVal, nouvelleValeur: newVal });
    }
  }

  return changes;
}
