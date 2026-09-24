/**
 * prestataire-service.ts — Accès base pour la vérification de doublons prestataires.
 * Utilisé par /api/prestataires (POST/PUT) et /api/prestataires/verifier-doublons.
 * La logique de décision reste PURE dans src/lib/prestataire-doublons.ts.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  detecterDoublons,
  normaliserNom,
  type ConflitDoublon,
  type DonneesPrestataireNormalisees,
  type PrestataireExistantMin,
} from '@/lib/prestataire-doublons';

/** Client Prisma (transactionnel ou non) */
type PrismaClientLike = Pick<typeof db, 'prestataire'>;

/** Colonnes minimales nécessaires à la détection de doublons */
export const SELECT_MIN_PRESTATAIRE = {
  id: true,
  nom: true,
  code: true,
  nif: true,
  stat: true,
  email: true,
  nomNormalise: true,
} satisfies Prisma.PrestataireSelect;

/**
 * Clause WHERE récupérant uniquement les lignes candidates : celles partageant
 * au moins une des valeurs uniques fournies. Les valeurs candidates étant déjà
 * normalisées, `insensitive` couvre aussi les anciennes données saisies avant
 * normalisation (NIF / code / e-mail en minuscules…).
 */
export function construireConditionsCandidates(
  donnees: DonneesPrestataireNormalisees,
  exclureId?: string
): Prisma.PrestataireWhereInput {
  const ou: Prisma.PrestataireWhereInput[] = [];

  if (donnees.nif) {
    ou.push({ nif: { equals: donnees.nif, mode: 'insensitive' } });
  }
  if (donnees.stat) {
    ou.push({ stat: donnees.stat });
  }
  if (donnees.email) {
    ou.push({ email: { equals: donnees.email, mode: 'insensitive' } });
  }
  if (donnees.code) {
    ou.push({ code: { equals: donnees.code, mode: 'insensitive' } });
  }
  if (donnees.nomNormalise) {
    ou.push({ nomNormalise: donnees.nomNormalise });
    // Résilience pré-backfill : comparaison insensible à la casse du nom brut
    if (donnees.nom) {
      ou.push({ nom: { equals: donnees.nom, mode: 'insensitive' } });
    }
  }

  return { AND: [ou.length > 0 ? { OR: ou } : {}, exclureId ? { id: { not: exclureId } } : {}] };
}

/**
 * Vérifie les doublons d'un prestataire candidat contre la base.
 * À appeler DANS une transaction avec verrou advisory pour exclure les
 * courses critiques (deux créations simultanées avec la même valeur).
 */
export async function verifierDoublonsEnBase(
  client: PrismaClientLike,
  donnees: DonneesPrestataireNormalisees,
  exclureId?: string
): Promise<ConflitDoublon[]> {
  const where = construireConditionsCandidates(donnees, exclureId);
  const existants = await client.prestataire.findMany({
    where,
    select: SELECT_MIN_PRESTATAIRE,
  });
  return detecterDoublons(donnees, existants as PrestataireExistantMin[], exclureId);
}

/** Verrou advisory transactionnel : sérialise les créations/modifications concurrentes */
export const VERROU_UNICITE_PRESTATAIRES = Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('unicite-prestataires'))`;

export { normaliserNom };
