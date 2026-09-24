-- Migration: Module Prestataires — unicité renforcée, exception doublons, audit enrichi
-- Date: 2026-09-24
-- À exécuter manuellement sur la base Neon (console Neon ou :
--   npx prisma db execute --file prisma/migrations/20260924110000_prestataires_exception_doublons/migration.sql --schema prisma/schema.prisma)
--
-- ⚠️ Les colonnes et tables sont créées automatiquement par `prisma db push` au déploiement.
--    Cette migration ajoute uniquement ce que Prisma ne peut pas exprimer :
--    les index uniques PARTIELS (ignorant les fiches dérogées) + le backfill de nomNormalise.
--
-- Principe des index partiels :
--   L'unicité est garantie par la base pour TOUTES les fiches normales.
--   Les fiches dont le doublon a été explicitement validé par un Administrateur
--   (exceptionValidee = true) sont exclues du prédicat — l'exception métier est
--   donc possible SANS désactiver la contrainte pour les autres.

-- ─── 0. Sécurité : vérifier les doublons existants avant création des index ──
-- Si l'une de ces requêtes renvoie des lignes, résoudre les doublons existants
-- (fusion/suppression) AVANT de créer l'index correspondant, sinon il sera refusé.
--   SELECT nif, array_agg(nom) FROM "Prestataire" WHERE nif IS NOT NULL GROUP BY nif HAVING count(*) > 1;
--   SELECT stat, array_agg(nom) FROM "Prestataire" WHERE stat IS NOT NULL GROUP BY stat HAVING count(*) > 1;
--   SELECT email, array_agg(nom) FROM "Prestataire" WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1;
--   SELECT code, array_agg(nom) FROM "Prestataire" WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1;
--   SELECT nomNormalise, array_agg(nom) FROM "Prestataire" WHERE nomNormalise IS NOT NULL GROUP BY nomNormalise HAVING count(*) > 1;

-- ─── 1. Backfill de la colonne nomNormalise pour les fiches existantes ──────
-- Même normalisation que src/lib/prestataire-doublons.ts (minuscules, accents
-- supprimés, ponctuation → espace, espaces réduits à un seul).
CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE "Prestataire"
SET "nomNormalise" = btrim(regexp_replace(
      lower(unaccent("nom")),
      '[^a-z0-9]+', ' ', 'g'))
WHERE "nomNormalise" IS NULL
  AND btrim(regexp_replace(lower(unaccent("nom")), '[^a-z0-9]+', ' ', 'g')) <> '';

-- ─── 2. Index uniques partiels (dérogation uniquement pour exceptionValidee) ─
CREATE UNIQUE INDEX IF NOT EXISTS "Prestataire_nif_unique_partiel"
  ON "Prestataire" (lower("nif"))
  WHERE "nif" IS NOT NULL AND "exceptionValidee" = false;

CREATE UNIQUE INDEX IF NOT EXISTS "Prestataire_stat_unique_partiel"
  ON "Prestataire" ("stat")
  WHERE "stat" IS NOT NULL AND "exceptionValidee" = false;

CREATE UNIQUE INDEX IF NOT EXISTS "Prestataire_email_unique_partiel"
  ON "Prestataire" (lower("email"))
  WHERE "email" IS NOT NULL AND "exceptionValidee" = false;

CREATE UNIQUE INDEX IF NOT EXISTS "Prestataire_code_unique_partiel"
  ON "Prestataire" (lower("code"))
  WHERE "code" IS NOT NULL AND "exceptionValidee" = false;

CREATE UNIQUE INDEX IF NOT EXISTS "Prestataire_nomNormalise_unique_partiel"
  ON "Prestataire" ("nomNormalise")
  WHERE "nomNormalise" IS NOT NULL AND "exceptionValidee" = false;

-- ─── 3. Colonne d'audit enrichie (idempotent, au cas où db push serait retardé) ─
ALTER TABLE "HistoriqueParametre" ADD COLUMN IF NOT EXISTS "metadonnees" TEXT;

-- ─── 4. Protection immutabilité du journal d'audit ───────────────────────────
-- Le journal est déjà en lecture seule applicative (aucune route d'écriture
-- dans /api/historique-parametres — vérifié par permissions.test.ts).
-- Les triggers ci-dessous verrouillent aussi UPDATE/DELETE au niveau base,
-- quel que soit le client connecté (y compris accès directs).
CREATE OR REPLACE FUNCTION interdire_modification_audit()
RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'Journal d''audit immuable : % interdit sur HistoriqueParametre (entrée %)', TG_OP, OLD."id";
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS historiqueparametre_immutabilite ON "HistoriqueParametre";
CREATE TRIGGER historiqueparametre_immutabilite
  BEFORE UPDATE OR DELETE ON "HistoriqueParametre"
  FOR EACH ROW
  EXECUTE FUNCTION interdire_modification_audit();
