import { db } from '@/lib/db';
import type { AssistantContext, ParamValeurs } from '../types';
import { AssistantError } from '../types';
import { familleAssureIds, societesDuPrestataire } from '../results';

// ─── Périmètre des rôles externes (dérivé côté serveur, jamais du client) ────

/**
 * Assuré : PORTAIL_CLIENT → assureId du token, étendu à la famille
 * (conjoint + enfants rattachés), comme sur le portail client existant.
 */
export async function scopeAssure(ctx: AssistantContext): Promise<{ ids: string[]; societeId: string | null }> {
  if (!ctx.assureId) {
    throw new AssistantError(
      'Aucun assuré lié à votre compte. Contactez votre administrateur.',
      403
    );
  }
  const ids = await familleAssureIds(ctx.assureId);
  const assure = await db.assure.findUnique({
    where: { id: ctx.assureId },
    select: { societeId: true },
  });
  return { ids, societeId: assure?.societeId ?? null };
}

/** Société : CONTACT_ENTREPRISE → societeId du token. */
export function scopeSociete(ctx: AssistantContext): string {
  if (!ctx.societeId) {
    throw new AssistantError(
      'Aucune société liée à votre compte. Contactez votre administrateur.',
      403
    );
  }
  return ctx.societeId;
}

/** Prestataire : PORTAIL_PRESTATAIRE → prestataireId du token. */
export function scopePrestataire(ctx: AssistantContext): string {
  if (!ctx.prestataireId) {
    throw new AssistantError(
      'Aucun prestataire lié à votre compte. Contactez votre administrateur.',
      403
    );
  }
  return ctx.prestataireId;
}

/**
 * Valide qu'un dossier appartient au périmètre de l'utilisateur.
 * Utilisé pour les questions « statut d'un dossier donné » : la recherche
 * s'effectue TOUJOURS à l'intérieur du scope (aucune fuite par numéro).
 */
export async function dossierAutorise(
  numeroDossier: string,
  where: Record<string, unknown>
): Promise<number | null> {
  const numero = numeroDossier.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(numero)) {
    throw new AssistantError('Numéro de dossier invalide.');
  }
  const d = await db.dossier.findFirst({
    where: { numeroDossier: numero, ...where },
    select: { id: true },
  });
  return d?.id ?? null;
}

/**
 * Valide le paramètre SOCIETE d'un PORTAIL_PRESTATAIRE : la société doit
 * être parmi celles auxquelles le prestataire est réellement rattaché.
 */
export async function societeAutoriseePrestataire(
  ctx: AssistantContext,
  params: ParamValeurs
): Promise<string | null> {
  const demandee = params.SOCIETE;
  const autorisees = await societesDuPrestataire(scopePrestataire(ctx));
  if (!demandee) return null;
  if (!autorisees.includes(demandee)) {
    throw new AssistantError(
      'Accès refusé : cette société est hors de votre périmètre de prestataire.',
      403
    );
  }
  return demandee;
}
