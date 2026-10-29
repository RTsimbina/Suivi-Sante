-- Migration : Module Sociétés clientes — unicité du nom, cycle de vie actif/inactif
-- Date : 2026-10-29
--
-- ⚠️ AUTOSUFFISANTE : le build Vercel n'exécute que `prisma migrate deploy`
--    (jamais `prisma db push`). Cette migration crée donc ELLE-MÊME toutes les
--    colonnes requises par prisma/schema.prisma, AVANT le backfill.
--    (Enseignement de l'incident P3018 du 24/09 sur les prestataires :
--    la version initiale supposait des colonnes créées par `db push`.)
--
--    Chaque instruction est idempotente (IF NOT EXISTS / gardes DO $$) :
--    la migration peut être rejouée après un `migrate resolve --rolled-back`.
--
-- Contenu (spécifications Sociétés clientes, miroir du traitement
-- Prestataires du 24/09) :
--   1. Societe.nomNormalise — support de l'unicité insensible casse/accents
--   2. Societe.actif — cycle de vie (le frontend affiche déjà le badge et la
--      carte « Sociétés actives » depuis la refactorisation du socle)
--   3. Index unique PARTIEL sur nomNormalise
--      (prédicat IS NOT NULL : colonne remplie par le backfill ou l'API)
--   4. Index simple de recherche sur nomNormalise

-- ─── 1. Nouvelles colonnes de la table Societe ──────────────────────────────
-- Créées AVANT le backfill (défaut corrigé de l'incident P3018).

ALTER TABLE "Societe" ADD COLUMN IF NOT EXISTS "nomNormalise" TEXT;
ALTER TABLE "Societe" ADD COLUMN IF NOT EXISTS "actif" BOOLEAN NOT NULL DEFAULT true;

-- ─── 2. Backfill de la colonne nomNormalise ─────────────────────────────────
-- Même normalisation que src/lib/prestataire-doublons.ts (minuscules, accents
-- supprimés, ponctuation → espace, espaces réduits à un seul).

CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE "Societe"
SET "nomNormalise" = btrim(regexp_replace(
      lower(unaccent("nom")),
      '[^a-z0-9]+', ' ', 'g'))
WHERE "nomNormalise" IS NULL
  AND btrim(regexp_replace(lower(unaccent("nom")), '[^a-z0-9]+', ' ', 'g')) <> '';

-- ─── 3. Index de recherche (déclaré dans prisma/schema.prisma @@index) ──────

CREATE INDEX IF NOT EXISTS "Societe_nomNormalise_idx" ON "Societe"("nomNormalise");

-- ─── 4. Index unique partiel sur le nom normalisé ───────────────────────────
-- Sécurité : vérifier les doublons existants AVANT — si la requête suivante
-- renvoie des lignes, l'index sera refusé (doublons à fusionner manuellement
-- avant de rejouer la migration) :
--
--   SELECT "nomNormalise", array_agg("nom")
--   FROM "Societe"
--   WHERE "nomNormalise" IS NOT NULL
--   GROUP BY "nomNormalise"
--   HAVING count(*) > 1;
--
-- Les sociétés au nom vide / non normalisable (nomNormalise IS NULL) restent
-- possibles en base ; l'API refuse quant à elle tout nom vide (Zod, nom ≥ 2).

CREATE UNIQUE INDEX IF NOT EXISTS "Societe_nomNormalise_unique"
  ON "Societe" ("nomNormalise")
  WHERE "nomNormalise" IS NOT NULL;
