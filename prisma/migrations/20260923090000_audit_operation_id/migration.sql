-- Ajout de l'identifiant d'opération pour l'audit par champ :
-- une même opération (modification multi-champs) = N lignes regroupées
-- sous un même operationId (UUID généré côté applicatif).

ALTER TABLE "HistoriqueParametre" ADD COLUMN "operationId" TEXT;

CREATE INDEX "HistoriqueParametre_operationId_idx" ON "HistoriqueParametre"("operationId");
