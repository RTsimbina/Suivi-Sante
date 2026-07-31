-- AlterTable
ALTER TABLE "HistoriqueParametre" ADD COLUMN "action" TEXT NOT NULL DEFAULT 'MODIFICATION';
ALTER TABLE "HistoriqueParametre" ADD COLUMN "niveau" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "HistoriqueParametre" ADD COLUMN "module" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "objet" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "societeId" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "ipAdresse" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "navigateur" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "motif" TEXT;
ALTER TABLE "HistoriqueParametre" ADD COLUMN "modifieParId" TEXT;

-- CreateIndex
CREATE INDEX "HistoriqueParametre_action_idx" ON "HistoriqueParametre"("action");
CREATE INDEX "HistoriqueParametre_niveau_idx" ON "HistoriqueParametre"("niveau");
CREATE INDEX "HistoriqueParametre_modifieParId_idx" ON "HistoriqueParametre"("modifieParId");
CREATE INDEX "HistoriqueParametre_societeId_idx" ON "HistoriqueParametre"("societeId");
CREATE INDEX "HistoriqueParametre_module_idx" ON "HistoriqueParametre"("module");
