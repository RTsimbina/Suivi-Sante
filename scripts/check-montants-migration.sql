-- ═══════════════════════════════════════════════════════════════════════════
-- Contrôle des totaux — migration Float → Decimal(18,2)  (plan P3, Vague 1)
--
-- Exigence du plan : TOTAL AVANT MIGRATION = TOTAL APRÈS MIGRATION
-- (à l'arrondi métier près — le cast float8 → numeric(18,2) arrondit à la
-- 2e décimale ; sur des montants déjà à 2 décimales, l'égalité est exacte).
--
-- MODE D'EMPLOI (Neon) :
--   1. Sauvegarde : npm run db:backup
--   2. Exécuter ce script AVANT  `npm run db:migrate:deploy`  → noter les totaux
--   3. npm run db:migrate:deploy
--   4. Exécuter ce script APRÈS → comparer chaque total (égalité exacte attendue
--      si les données sont déjà à 2 décimales ; sinon arrondi comptable près)
-- ═══════════════════════════════════════════════════════════════════════════

\echo '=== Contrôle des totaux monétaires ==='

SELECT 'Contrat.budgetAnnuel'  AS colonne, COUNT(*) AS nb_lignes, ROUND(SUM("budgetAnnuel")::numeric, 2) AS total
FROM "Contrat"
UNION ALL
SELECT 'Contrat.budgetUtilise', COUNT(*), ROUND(SUM("budgetUtilise")::numeric, 2)
FROM "Contrat"
UNION ALL
SELECT 'AppelDeFonds.montant', COUNT(*), ROUND(SUM("montant")::numeric, 2)
FROM "AppelDeFonds"
UNION ALL
SELECT 'Dossier.montantReclame', COUNT(*), ROUND(SUM("montantReclame")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Dossier.montantValide', COUNT(*), ROUND(SUM("montantValide")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Dossier.ticketModerateur', COUNT(*), ROUND(SUM("ticketModerateur")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Dossier.partPatient', COUNT(*), ROUND(SUM("partPatient")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Dossier.partEntreprise', COUNT(*), ROUND(SUM("partEntreprise")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Dossier.montantPaye', COUNT(*), ROUND(SUM("montantPaye")::numeric, 2)
FROM "Dossier"
UNION ALL
SELECT 'Bareme.plafond', COUNT(*), ROUND(SUM("plafond")::numeric, 2)
FROM "Bareme"
UNION ALL
SELECT 'Courriel.montant', COUNT(*), ROUND(SUM("montant")::numeric, 2)
FROM "Courriel";

-- Anomalies de données à corriger AVANT la migration (plan P3 — analyse des valeurs) :
\echo '=== Valeurs anormales (négatives ou > 3 décimales) ==='
SELECT 'Dossier.montantReclame < 0' AS anomalie, COUNT(*) AS nb FROM "Dossier" WHERE "montantReclame" < 0
UNION ALL SELECT 'Dossier.montantValide < 0', COUNT(*) FROM "Dossier" WHERE "montantValide" < 0
UNION ALL SELECT 'Dossier.montantPaye < 0', COUNT(*) FROM "Dossier" WHERE "montantPaye" < 0
UNION ALL SELECT 'AppelDeFonds.montant <= 0', COUNT(*) FROM "AppelDeFonds" WHERE "montant" <= 0
UNION ALL SELECT 'Bareme.plafond <= 0', COUNT(*) FROM "Bareme" WHERE "plafond" <= 0
UNION ALL SELECT 'Dossier.montantReclame > 3 décimales', COUNT(*) FROM "Dossier" WHERE ROUND("montantReclame"::numeric, 3) <> ROUND("montantReclame"::numeric, 2);
