-- Migration : Module Prestataires — unicité renforcée, exception doublons, audit enrichi
-- Date : 2026-09-24
--
-- ⚠️ AUTOSUFFISANTE : le build Vercel n'exécute que `prisma migrate deploy`
--    (jamais `prisma db push`). Cette migration crée donc ELLE-MÊME toutes les
--    colonnes et tables requises par prisma/schema.prisma, AVANT le backfill.
--    (Incident P3018 du 24/09 : la version initiale supposait les colonnes
--    créées par `db push` → `column "nomNormalise" does not exist`.)
--
--    Chaque instruction est idempotent (IF NOT EXISTS / gardes DO $$) :
--    la migration peut être rejouée après un `migrate resolve --rolled-back`.
--
-- Principe des index partiels :
--   L'unicité est garantie par la base pour TOUTES les fiches normales.
--   Les fiches dont le doublon a été explicitement validé par un Administrateur
--   (exceptionValidee = true) sont exclues du prédicat — l'exception métier est
--   donc possible SANS désactiver la contrainte pour les autres.

-- ─── 1. Table GroupePrestataire ─────────────────────────────────────────────
-- Plusieurs établissements / agences d'un même opérateur : justifie les
-- exceptions de doublon (données communes légitimes, validées par un Admin).

CREATE TABLE IF NOT EXISTS "GroupePrestataire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupePrestataire_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupePrestataire_nom_key" ON "GroupePrestataire"("nom");

-- ─── 2. Nouvelles colonnes de la table Prestataire ──────────────────────────
-- Créées AVANT le backfill (c'était le défaut de la version initiale).

ALTER TABLE "Prestataire" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Prestataire" ADD COLUMN IF NOT EXISTS "nomNormalise" TEXT;
ALTER TABLE "Prestataire" ADD COLUMN IF NOT EXISTS "iban" TEXT;
ALTER TABLE "Prestataire" ADD COLUMN IF NOT EXISTS "exceptionValidee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Prestataire" ADD COLUMN IF NOT EXISTS "groupePrestataireId" TEXT;

-- Clé étrangère Prestataire → GroupePrestataire (relation optionnelle :
-- Prisma génère ON DELETE SET NULL ON UPDATE CASCADE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Prestataire_groupePrestataireId_fkey') THEN
    ALTER TABLE "Prestataire" ADD CONSTRAINT "Prestataire_groupePrestataireId_fkey"
      FOREIGN KEY ("groupePrestataireId") REFERENCES "GroupePrestataire"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Index simples déclarés dans prisma/schema.prisma (@@index) et absents
-- des migrations précédentes (stat n'avait jamais eu d'index).
CREATE INDEX IF NOT EXISTS "Prestataire_nomNormalise_idx" ON "Prestataire"("nomNormalise");
CREATE INDEX IF NOT EXISTS "Prestataire_code_idx" ON "Prestataire"("code");
CREATE INDEX IF NOT EXISTS "Prestataire_nif_idx" ON "Prestataire"("nif");
CREATE INDEX IF NOT EXISTS "Prestataire_stat_idx" ON "Prestataire"("stat");
CREATE INDEX IF NOT EXISTS "Prestataire_email_idx" ON "Prestataire"("email");
CREATE INDEX IF NOT EXISTS "Prestataire_groupePrestataireId_idx" ON "Prestataire"("groupePrestataireId");

-- ─── 3. Table ExceptionDoublon ──────────────────────────────────────────────
-- Trace de chaque exception de doublon validée par un Administrateur :
-- donnée en doublon, fiche existante, motif, validateur, rôle, date/heure.
-- Complément structurel immuable du Journal d'Audit — ne jamais supprimer.

CREATE TABLE IF NOT EXISTS "ExceptionDoublon" (
    "id" TEXT NOT NULL,
    "prestataireId" TEXT NOT NULL,
    "prestataireExistantId" TEXT,
    "prestataireExistantNom" TEXT NOT NULL,
    "champ" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "contexte" TEXT NOT NULL,
    "operationId" TEXT,
    "valideParNom" TEXT NOT NULL,
    "valideParId" TEXT,
    "valideParRole" TEXT NOT NULL,
    "dateValidation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionDoublon_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExceptionDoublon_prestataireId_idx" ON "ExceptionDoublon"("prestataireId");
CREATE INDEX IF NOT EXISTS "ExceptionDoublon_champ_valeur_idx" ON "ExceptionDoublon"("champ", "valeur");
CREATE INDEX IF NOT EXISTS "ExceptionDoublon_operationId_idx" ON "ExceptionDoublon"("operationId");

-- Suppression d'un prestataire → ses exceptions disparaissent avec lui
-- (onDelete: Cascade, comme déclaré dans le schéma Prisma).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExceptionDoublon_prestataireId_fkey') THEN
    ALTER TABLE "ExceptionDoublon" ADD CONSTRAINT "ExceptionDoublon_prestataireId_fkey"
      FOREIGN KEY ("prestataireId") REFERENCES "Prestataire"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 4. Backfill de la colonne nomNormalise ─────────────────────────────────
-- Même normalisation que src/lib/prestataire-doublons.ts (minuscules, accents
-- supprimés, ponctuation → espace, espaces réduits à un seul).
CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE "Prestataire"
SET "nomNormalise" = btrim(regexp_replace(
      lower(unaccent("nom")),
      '[^a-z0-9]+', ' ', 'g'))
WHERE "nomNormalise" IS NULL
  AND btrim(regexp_replace(lower(unaccent("nom")), '[^a-z0-9]+', ' ', 'g')) <> '';

-- ─── 5. Colonne d'audit enrichie (HistoriqueParametre) ──────────────────────
-- JSON : contexte additionnel (exceptions de doublon validées, etc.).
ALTER TABLE "HistoriqueParametre" ADD COLUMN IF NOT EXISTS "metadonnees" TEXT;

-- ─── 6. Index uniques partiels (dérogation uniquement pour exceptionValidee) ─
-- Sécurité : vérifier les doublons existants AVANT — si une de ces requêtes
-- renvoie des lignes, l'index correspondant sera refusé (doublons à fusionner) :
--   SELECT nif, array_agg(nom) FROM "Prestataire" WHERE nif IS NOT NULL GROUP BY nif HAVING count(*) > 1;
--   SELECT stat, array_agg(nom) FROM "Prestataire" WHERE stat IS NOT NULL GROUP BY stat HAVING count(*) > 1;
--   SELECT email, array_agg(nom) FROM "Prestataire" WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1;
--   SELECT code, array_agg(nom) FROM "Prestataire" WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1;
--   SELECT nomNormalise, array_agg(nom) FROM "Prestataire" WHERE nomNormalise IS NOT NULL GROUP BY nomNormalise HAVING count(*) > 1;

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

-- ─── 7. Protection immutabilité du journal d'audit ──────────────────────────
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
