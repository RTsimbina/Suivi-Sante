-- FixRattrapage budgetUtilise
-- 1. Recalcule la valeur depuis les appels de fonds réels (source de vérité)
-- 2. Puis force 0 pour les contrats sans appels (NULL → 0)
-- 3. Assure la colonne est NOT NULL DEFAULT 0

UPDATE "Contrat" c
SET "budgetUtilise" = COALESCE(
  (SELECT SUM(a."montant") FROM "AppelDeFonds" a WHERE a."contratId" = c.id),
  0
)
WHERE c."budgetUtilise" IS NULL
   OR c."budgetUtilise" != COALESCE(
     (SELECT SUM(a."montant") FROM "AppelDeFonds" a WHERE a."contratId" = c.id),
     0
   );

-- Sécurité : forcer NOT NULL DEFAULT pour les futures insertions
ALTER TABLE "Contrat" ALTER COLUMN "budgetUtilise" SET NOT NULL;
ALTER TABLE "Contrat" ALTER COLUMN "budgetUtilise" SET DEFAULT 0;