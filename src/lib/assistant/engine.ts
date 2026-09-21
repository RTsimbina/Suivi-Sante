import type {
  AssistantContext,
  AssistantResult,
  ParamValeurs,
  QuestionDef,
  RoleType,
} from './types';
import { AssistantError } from './types';
import { questionsDuRole, questionParId } from './catalog';
import { validerParams, extrairePeriode, isRoleExterne } from './context';
import { resolvePeriode } from './periods';

// ─── Moteur d'exécution sécurisé de l'assistant ──────────────────────────────
//
// Chaîne imposée (cahier des charges) :
//   RÔLE → questions autorisées → question sélectionnée → paramètres éventuels
//   → vérification des permissions → filtre d'isolation → requête prédéfinie
//   → résultat → synthèse / KPI / tableau / graphique.
//
// Aucune requête n'est construite depuis une entrée client non validée :
//   - l'identifiant de question doit exister dans le catalogue ;
//   - il doit appartenir au rôle de l'utilisateur ;
//   - les paramètres sont filtrés par validerParams (liste déclarée) ;
//   - le périmètre (société / prestataire / assuré) est appliqué par les
//     implémentations via questions/*/scope.ts, à partir du token serveur.

/** Questions visibles pour un rôle (sans exécuter de requête) */
export function listerQuestions(role: RoleType) {
  const questions = questionsDuRole(role);
  return {
    role,
    total: questions.length,
    questions: questions.map((q) => ({
      id: q.id,
      categorie: q.categorie,
      question: q.question,
      params: q.params,
      presentation: q.presentation,
      note: q.note ?? null,
    })),
  };
}

/** Exécute une question avec vérification complète des permissions */
export async function executerQuestion(
  ctx: AssistantContext,
  questionId: string,
  parametresBruts: ParamValeurs | undefined
): Promise<AssistantResult> {
  // 1. La question doit exister dans le catalogue
  const question = questionParId(questionId);
  if (!question) {
    throw new AssistantError(`Question inconnue : ${String(questionId).slice(0, 60)}`, 404);
  }

  // 2. La question doit appartenir au rôle de l'utilisateur (défense serveur)
  if (question.role !== ctx.role) {
    throw new AssistantError(
      'Accès refusé : cette question ne fait pas partie de votre périmètre fonctionnel.',
      403
    );
  }

  // 3. Les rôles externes doivent avoir leur rattachement de données
  if (isRoleExterne(ctx.role)) {
    if (ctx.role === 'PORTAIL_CLIENT' && !ctx.assureId) {
      throw new AssistantError('Aucun assuré lié à votre compte. Contactez votre administrateur.', 403);
    }
    if (ctx.role === 'CONTACT_ENTREPRISE' && !ctx.societeId) {
      throw new AssistantError('Aucune société liée à votre compte. Contactez votre administrateur.', 403);
    }
    if (ctx.role === 'PRESTATAIRE' && !ctx.prestataireId) {
      throw new AssistantError('Aucun prestataire lié à votre compte. Contactez votre administrateur.', 403);
    }
  }

  // 4. Validation des paramètres (seuls ceux déclarés passent, typés/limités)
  const params = validerParams(question.params, parametresBruts);

  // 5. Les questions à paramètre obligatoire le vérifient tôt
  for (const def of question.params) {
    if (def.required && !params[def.key]) {
      throw new AssistantError(`Paramètre requis manquant : ${def.label}.`);
    }
  }

  // 6. Exécution de la requête prédéfinie (isolation appliquée à l'intérieur)
  const core = await question.impl(ctx, params);

  // 7. Assemblage du résultat final
  return {
    questionId: question.id,
    question: question.question,
    ...core,
  };
}

/** Liste publique des questions (métadonnées uniquement, sans implémentation) */
export type QuestionPublique = ReturnType<typeof listerQuestions>['questions'][number];

export function questionEstAutorisee(role: RoleType, questionId: string): boolean {
  const q = questionParId(questionId);
  return !!q && q.role === role;
}

/** Expose la période par défaut d'une question (utilitaire UI) */
export function periodeParDefaut(question: QuestionDef): string {
  if (!question.params.some((p) => p.key === 'PERIODE')) return '';
  return 'ANNEE_COURANTE';
}

export { resolvePeriode, extrairePeriode };
