/**
 * doublon-detection.ts — Détection de doublons via SQL self-join
 * Remplace l'algorithme O(n²) qui comparait chaque paire de dossiers en JS.
 */
import { db } from "@/lib/db";

export interface DoublonRow {
  numeroDossier1: string;
  numeroDossier2: string;
  beneficiaire: string;
  motif: string;
}

/**
 * Détecte les doublons potentiels via SQL self-join.
 * Deux critères :
 *  1. Même bénéficiaire + société + type + date de soins
 *  2. Même bénéficiaire + société + type + montant (> 0)
 */
export async function detectDoublons(limit: number = 100): Promise<DoublonRow[]> {
  type SqlRow = {
    numeroDossier1: string;
    numeroDossier2: string;
    beneficiaire: string;
    motif: string;
  };

  const rows = await db.$queryRaw<SqlRow[]>`
    WITH pairs AS (
      SELECT
        a."numeroDossier" AS "numeroDossier1",
        b."numeroDossier" AS "numeroDossier2",
        a."beneficiaire",
        CASE
          WHEN a."dateSoins" IS NOT NULL
            AND b."dateSoins" IS NOT NULL
            AND a."dateSoins"::date = b."dateSoins"::date
          THEN 'M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et date de soins'
          WHEN a."montantReclame" = b."montantReclame"
            AND a."montantReclame" > 0
          THEN 'M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et montant'
        END AS motif
      FROM "Dossier" a
      JOIN "Dossier" b
        ON a."id" < b."id"
        AND LOWER(TRIM(a."beneficiaire")) = LOWER(TRIM(b."beneficiaire"))
        AND a."societeId" = b."societeId"
        AND a."typeDossier" = b."typeDossier"
    )
    SELECT * FROM pairs
    WHERE motif IS NOT NULL
    ORDER BY "numeroDossier1"
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    numeroDossier1: r.numeroDossier1,
    numeroDossier2: r.numeroDossier2,
    beneficiaire: r.beneficiaire,
    motif: r.motif,
  }));
}