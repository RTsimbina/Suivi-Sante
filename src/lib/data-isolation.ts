/**
 * ─── Isolation des données (RLS applicatif) ───────────────────────────────
 * 
 * Ce module centralise toutes les règles d'isolation des données au niveau
 * applicatif, simulant un Row-Level Security (RLS) comme on l'aurait avec
 * PostgreSQL. Chaque requête Prisma doit passer par ces filtres pour
 * garantir que :
 * 
 * 1. Un UTILISATEUR ne voit que les dossiers de sa société (societeId)
 * 2. Les commentaires privés ne sont visibles que par l'équipe interne
 * 3. Les justificatifs suivent la même règle de société
 * 4. Les KPIs et analyses IA respectent le périmètre de l'utilisateur
 * 
 * Prêt pour une future migration PostgreSQL + Supabase avec RLS natif.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { Prisma } from "@prisma/client";

/** Rôles internes ayant accès à toutes les données */
const INTERNAL_ROLES = ["ADMINISTRATEUR", "ACCUEIL", "TECHNIQUE", "COMPTABILITE"];

/** Rôles pouvant voir les commentaires privés */
const PRIVATE_COMMENT_ROLES = ["ADMINISTRATEUR", "TECHNIQUE", "COMPTABILITE"];

/**
 * Retourne le filtre Prisma à appliquer sur les dossiers pour un rôle/utilisateur donné.
 * - ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE : pas de filtre (voient tout)
 * - UTILISATEUR : filtre par societeId lié au compte utilisateur
 */
export function getDossierIsolationFilter(
  userRole: string,
  userId: string,
  userSocieteId: string | null
): Prisma.DossierWhereInput {
  if (INTERNAL_ROLES.includes(userRole)) {
    return {}; // Pas de restriction pour les rôles internes
  }

  // UTILISATEUR : ne voit que les dossiers de sa société
  if (userRole === "UTILISATEUR" && userSocieteId) {
    return { societeId: userSocieteId };
  }

  // Fallback : UTILISATEUR sans société → uniquement ses dossiers créés
  return { createurId: userId };
}

/**
 * Filtre les commentaires privés selon le rôle.
 * Les rôles ADMIN, TECHNIQUE et COMPTABILITE voient tout.
 * Les autres ne voient que les commentaires publics.
 */
export function getCommentaireIsolationFilter(userRole: string): Prisma.CommentaireWhereInput {
  if (PRIVATE_COMMENT_ROLES.includes(userRole)) {
    return {}; // Voit tous les commentaires
  }
  return { prive: false }; // Ne voit que les commentaires publics
}

/**
 * Retourne true si le rôle peut voir les analyses IA complètes (toutes sociétés).
 * Sinon, les analyses seront limitées à la société de l'utilisateur.
 */
export function canSeeAllSocietes(userRole: string): boolean {
  return INTERNAL_ROLES.includes(userRole);
}

/**
 * Retourne le filtre pour les justificatifs (même logique que les dossiers).
 */
export function getJustificatifIsolationFilter(
  userRole: string,
  userId: string,
  userSocieteId: string | null
): Prisma.JustificatifWhereInput {
  if (INTERNAL_ROLES.includes(userRole)) {
    return {};
  }
  if (userRole === "UTILISATEUR" && userSocieteId) {
    return { dossier: { societeId: userSocieteId } };
  }
  return { uploadedBy: userId };
}

/**
 * Enrichit un where existant avec les filtres d'isolation.
 * Fusionne intelligemment avec un AND si le where contient déjà des conditions.
 */
export function withIsolation<T extends Record<string, unknown>>(
  baseWhere: T,
  isolationFilter: Prisma.DossierWhereInput
): Prisma.DossierWhereInput {
  const hasConditions = Object.keys(baseWhere).length > 0;
  if (!hasConditions) return isolationFilter;
  
  const hasIsolation = Object.keys(isolationFilter).length > 0;
  if (!hasIsolation) return baseWhere as Prisma.DossierWhereInput;

  return {
    AND: [baseWhere as Prisma.DossierWhereInput, isolationFilter],
  };
}

/**
 * Récupère le societeId d'un utilisateur à partir de la DB.
 * Utilisé par les API routes pour construire les filtres d'isolation.
 */
export async function getUserSocieteId(userId: string): Promise<string | null> {
  try {
    const { db } = await import("@/lib/db");
    const user = await db.utilisateur.findUnique({
      where: { id: userId },
      select: { societeId: true, role: true },
    });
    return user?.societeId || null;
  } catch {
    return null;
  }
}