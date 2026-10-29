-- ═══════════════════════════════════════════════════════════════════════════
-- P1 « Validité datée des barèmes » — migration PROGRESSIVE et NON DESTRUCTIVE
-- ───────────────────────────────────────────────────────────────────────────
-- Objectifs :
--   1. Dates de validité explicites : valideDu (obligatoire) / valideAu
--      (facultatif, NULL = version en cours).
--   2. Versionnement : n° de version par combinaison (societeId, prestation) ;
--      les modifications de taux/plafond créent une NOUVELLE version — les
--      anciens taux ne sont jamais écrasés ni supprimés.
--   3. Dossier : référence du barème appliqué + valeurs de justification
--      (taux, plafond, période) figées au calcul — NULL pour l'existant,
--      AUCUNE modification rétroactive des remboursements validés.
--
-- VALEURS INITIALES (documentées) :
--   - valideDu = "createdAt" : un barème existant est réputé avoir été valide
--     depuis sa création — c'est l'hypothèse la plus fidèle aux données
--     historiques (il n'existait qu'UNE ligne par combinaison, active).
--   - valideAu = NULL (encore en cours), version = 1, supprime = false.
--   - Le flag administratif `active` est PRÉSERVÉ tel quel : il reste distinct
--     de la validité temporelle.
--
-- SÉCURITÉ / RETOUR ARRIÈRE :
--   - Aucune donnée n'est effacée ni modifiée (hors backfill valideDu
--     documenté ci-dessus). Les montants et remboursements ne sont pas touchés.
--   - L'unicité passe de (societeId, prestation) à (societeId, prestation,
--     version) : moins stricte, la migration ne peut pas échouer sur les
--     données existantes (une seule ligne version 1 par combinaison garantie
--     par l'ancienne contrainte).
--   - ROLLBACK possible tant que toutes les lignes sont restées en version 1 :
--       UPDATE "Bareme" SET "version" = 1;
--       DROP INDEX IF EXISTS "Bareme_societeId_prestation_valideDu_idx";
--       DROP INDEX IF EXISTS "Bareme_societeId_prestation_version_key";
--       CREATE UNIQUE INDEX "Bareme_societeId_prestation_key"
--         ON "Bareme"("societeId", "prestation");
--       ALTER TABLE "Bareme"
--         DROP COLUMN "valideDu", DROP COLUMN "valideAu",
--         DROP COLUMN "version",  DROP COLUMN "supprime";
--       ALTER TABLE "Dossier"
--         DROP COLUMN "baremeId", DROP COLUMN "baremePrestation",
--         DROP COLUMN "baremeTaux", DROP COLUMN "baremePlafond",
--         DROP COLUMN "baremeValideDu", DROP COLUMN "baremeValideAu";
--   - Recommandé avant application en production : instantané Neon
--     (neonctl branches create --name pre-p1-baremes) ou pg_dump.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Bareme : validité datée + versionnement ─────────────────────────────
ALTER TABLE "Bareme" ADD COLUMN "valideDu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Bareme" ADD COLUMN "valideAu" TIMESTAMP(3);
ALTER TABLE "Bareme" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Bareme" ADD COLUMN "supprime" BOOLEAN NOT NULL DEFAULT false;

-- Backfill documenté : un barème existant est valide depuis sa création.
UPDATE "Bareme" SET "valideDu" = "createdAt" WHERE "valideDu" <> "createdAt";

-- Unicité par version (remplace l'unicité par combinaison — non destructif :
-- l'ancienne contrainte garantissait au plus une ligne version 1 par
-- combinaison, donc la nouvelle contrainte ne peut pas entrer en conflit).
DROP INDEX "Bareme_societeId_prestation_key";
CREATE UNIQUE INDEX "Bareme_societeId_prestation_version_key"
  ON "Bareme"("societeId", "prestation", "version");
CREATE INDEX "Bareme_societeId_prestation_valideDu_idx"
  ON "Bareme"("societeId", "prestation", "valideDu");

-- ─── 2. Dossier : référence du barème appliqué (justification) ──────────────
-- Toutes les colonnes sont NULLables : les dossiers existants (remboursements
-- déjà validés) ne sont JAMAIS modifiés rétroactivement.
ALTER TABLE "Dossier" ADD COLUMN "baremeId" TEXT;
ALTER TABLE "Dossier" ADD COLUMN "baremePrestation" TEXT;
ALTER TABLE "Dossier" ADD COLUMN "baremeTaux" DOUBLE PRECISION;
ALTER TABLE "Dossier" ADD COLUMN "baremePlafond" DECIMAL(18,2);
ALTER TABLE "Dossier" ADD COLUMN "baremeValideDu" TIMESTAMP(3);
ALTER TABLE "Dossier" ADD COLUMN "baremeValideAu" TIMESTAMP(3);
