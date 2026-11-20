-- CreateIndex
CREATE INDEX "Contrat_societeId_statut_idx" ON "Contrat"("societeId", "statut");

-- CreateIndex
CREATE INDEX "Dossier_societeId_statut_dateReception_idx" ON "Dossier"("societeId", "statut", "dateReception");

-- CreateIndex
CREATE INDEX "Dossier_assureId_typeDossier_dateReception_idx" ON "Dossier"("assureId", "typeDossier", "dateReception");

-- CreateIndex
CREATE INDEX "Dossier_assureId_dateReception_idx" ON "Dossier"("assureId", "dateReception");

-- CreateIndex
CREATE INDEX "Dossier_prestataireId_idx" ON "Dossier"("prestataireId");

-- CreateIndex
CREATE INDEX "Assure_societeId_actif_idx" ON "Assure"("societeId", "actif");

-- CreateIndex
CREATE INDEX "Assure_codeFamille_idx" ON "Assure"("codeFamille");

-- CreateIndex
CREATE INDEX "Assure_assurePrincipalId_idx" ON "Assure"("assurePrincipalId");

-- CreateIndex
CREATE INDEX "Courriel_statut_dateCourriel_idx" ON "Courriel"("statut", "dateCourriel");

-- CreateIndex
CREATE INDEX "Courriel_societeId_idx" ON "Courriel"("societeId");

