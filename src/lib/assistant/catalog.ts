import type { QuestionDef, RoleType } from './types';
import { questionsAdministrateur } from './questions/administrateur';
import { questionsAccueil } from './questions/accueil';
import { questionsTechnique } from './questions/technique';
import { questionsComptabilite } from './questions/comptabilite';
import { questionsSante } from './questions/sante';
import { questionsAssure } from './questions/assure';
import { questionsEntreprise } from './questions/entreprise';
import { questionsPrestataire } from './questions/prestataire';

// ─── Catalogue central de l'assistant ────────────────────────────────────────
// 8 rôles × 20 questions = 160 questions prédéfinies.
// Chaque question appartient à UN rôle et déclenche UNE requête prédéfinie.

export const CATALOGUE: QuestionDef[] = [
  ...questionsAdministrateur,
  ...questionsAccueil,
  ...questionsTechnique,
  ...questionsComptabilite,
  ...questionsSante,
  ...questionsAssure,
  ...questionsEntreprise,
  ...questionsPrestataire,
];

const INDEX_PAR_ID = new Map(CATALOGUE.map((q) => [q.id, q]));

/** Récupère une question par son identifiant interne (ex : COMPTA_TOTAL_FACTURES) */
export function questionParId(id: string): QuestionDef | undefined {
  return INDEX_PAR_ID.get(id);
}

/** Questions autorisées pour un rôle donné (base de la liste côté client) */
export function questionsDuRole(role: RoleType): QuestionDef[] {
  return CATALOGUE.filter((q) => q.role === role);
}
