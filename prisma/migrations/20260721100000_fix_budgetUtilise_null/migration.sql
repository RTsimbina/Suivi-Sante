-- FixRattrapage: les lignes Contrat créées avant l'ajout de @default(0)
-- ont budgetUtilise = NULL, ce qui provoque des NaN dans les calculs frontend.
-- On force 0 et on ajoute une contrainte NOT NULL DEFAULT 0.

UPDATE "Contrat" SET "budgetUtilise" = 0 WHERE "budgetUtilise" IS NULL;