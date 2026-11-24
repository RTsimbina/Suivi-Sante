-- Index de performance pour le volume important (1 000 000 dossiers).
-- 1) Ordre par défaut des listes : orderBy createdAt desc sans index → tri complet.
CREATE INDEX IF NOT EXISTS "Dossier_createdAt_idx" ON "Dossier"("createdAt");
-- 2) Kanban / listes globales filtrées par statut (statut + tri temporel).
CREATE INDEX IF NOT EXISTS "Dossier_statut_createdAt_idx" ON "Dossier"(statut, "createdAt");
-- 3) Jointures et cascades sur les pièces liées (FK sans index sous PostgreSQL).
CREATE INDEX IF NOT EXISTS "Commentaire_dossierId_idx" ON "Commentaire"("dossierId");
CREATE INDEX IF NOT EXISTS "Justificatif_dossierId_idx" ON "Justificatif"("dossierId");
-- 4) Recherche « contient » (beneficiaire / numeroDossier) sans trigram → seq scan
--    sur 1 M lignes à chaque recherche. pg_trgm + GIN accélère sans changer la requête.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Dossier_beneficiaire_trgm_idx" ON "Dossier" USING gin ("beneficiaire" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Dossier_numeroDossier_trgm_idx" ON "Dossier" USING gin ("numeroDossier" gin_trgm_ops);
