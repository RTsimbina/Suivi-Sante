-- R3 — Assignation native du Contrôle médical sur Dossier.
-- Même mécanique que gestionnaireAccueilId/TechniqueId/ComptaId : un
-- gestionnaire de référentiel (service CONTROLE_MEDICAL) peut être assigné au
-- dossier ; la période KPI de contrôle médical (EtapeTraitement.gestionnaireId)
-- porte cette assignation.

ALTER TABLE "Dossier" ADD COLUMN "gestionnaireControleMedicalId" TEXT;

ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_gestionnaireControleMedicalId_fkey" FOREIGN KEY ("gestionnaireControleMedicalId") REFERENCES "Gestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
