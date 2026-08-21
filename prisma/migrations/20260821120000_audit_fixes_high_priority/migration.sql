-- Migration: Corrections haute priorité (audit)
-- Date: 2026-08-21

-- 1. Retirer la cascade silencieuse sur Assure.societeId
--    (la suppression de société est maintenant bloquée par l'API si des assurés existent)
ALTER TABLE "Assure" DROP CONSTRAINT IF EXISTS "Assure_societeId_fkey";
ALTER TABLE "Assure" ADD CONSTRAINT "Assure_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT;

-- 2. Créer la table ModeCalculAppelFonds
CREATE TABLE IF NOT EXISTS "ModeCalculAppelFonds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societeId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEPENSE_MENSUELLE',
    "parametres" TEXT NOT NULL DEFAULT '{}',
    "periodicite" TEXT NOT NULL DEFAULT 'MENSUELLE',
    "dateDebut" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModeCalculAppelFonds_societeId_key" UNIQUE ("societeId"),
    CONSTRAINT "ModeCalculAppelFonds_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE CASCADE
);

-- 3. Ajouter la colonne modeCalculAppelFondsId à Societe (relation 1:1)
--    Note: Prisma gère cette relation via le champ unique sur ModeCalculAppelFonds.societeId
--    Pas besoin d'ajouter une colonne à Societe

-- Index pour accélérer les recherches
CREATE INDEX IF NOT EXISTS "ModeCalculAppelFonds_societeId_idx" ON "ModeCalculAppelFonds"("societeId");
