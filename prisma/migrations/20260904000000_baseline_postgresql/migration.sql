-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'UTILISATEUR',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "dernierLogin" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Societe" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "nif" TEXT,
    "contactPrincipal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Societe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gestionnaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "budgetAnnuel" DOUBLE PRECISION NOT NULL,
    "budgetUtilise" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppelDeFonds" (
    "id" TEXT NOT NULL,
    "contratId" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "dateAppel" TIMESTAMP(3) NOT NULL,
    "datePaiement" TIMESTAMP(3),
    "reference" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppelDeFonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL,
    "numeroDossier" TEXT NOT NULL,
    "dateReception" TIMESTAMP(3) NOT NULL,
    "societeId" TEXT NOT NULL,
    "beneficiaire" TEXT NOT NULL,
    "typeDossier" TEXT NOT NULL,
    "categorieDossier" TEXT,
    "gestionnaireAccueilId" TEXT,
    "createurId" TEXT,
    "assureId" TEXT,
    "nSS" TEXT,
    "prestataireId" TEXT,
    "prestataireLegacy" TEXT,
    "dateSoins" TIMESTAMP(3),
    "moyenPaiement" TEXT,
    "observations" TEXT,
    "dateTraitementTechnique" TIMESTAMP(3),
    "montantReclame" DOUBLE PRECISION NOT NULL,
    "montantValide" DOUBLE PRECISION,
    "ticketModerateur" DOUBLE PRECISION,
    "partPatient" DOUBLE PRECISION,
    "partEntreprise" DOUBLE PRECISION,
    "gestionnaireTechniqueId" TEXT,
    "motifRejet" TEXT,
    "dateReceptionDecompte" TIMESTAMP(3),
    "datePaiement" TIMESTAMP(3),
    "referencePaiement" TEXT,
    "montantPaye" DOUBLE PRECISION,
    "gestionnaireComptaId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECU',
    "source" TEXT NOT NULL DEFAULT 'EXCEL',
    "historique" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commentaire" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "auteurId" TEXT,
    "contenu" TEXT NOT NULL,
    "prive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commentaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Justificatif" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "tailleKo" DOUBLE PRECISION,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Justificatif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportHistorique" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "nbLignes" INTEGER NOT NULL,
    "nbSucces" INTEGER NOT NULL DEFAULT 0,
    "nbErreurs" INTEGER NOT NULL DEFAULT 0,
    "rapport" TEXT NOT NULL DEFAULT '[]',
    "importePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportHistorique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bareme" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "prestation" TEXT NOT NULL,
    "tauxCouverture" DOUBLE PRECISION NOT NULL,
    "plafond" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bareme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDossier" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "dossierId" TEXT,
    "numeroLigne" INTEGER NOT NULL,
    "statutImport" TEXT NOT NULL DEFAULT 'SUCCES',
    "erreur" TEXT,
    "donnees" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ImportDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assure" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT,
    "nSS" TEXT,
    "matricule" TEXT,
    "typeBeneficiaire" TEXT NOT NULL DEFAULT 'ASSURE',
    "assurePrincipalId" TEXT,
    "codeFamille" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "sexe" TEXT,
    "dateEffet" TIMESTAMP(3),
    "bareme" DOUBLE PRECISION,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestataire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "nif" TEXT,
    "statut" TEXT,
    "rib" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestataire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestataireSociete" (
    "id" TEXT NOT NULL,
    "prestataireId" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrestataireSociete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courriel" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "societeId" TEXT,
    "beneficiaire" TEXT,
    "montant" DOUBLE PRECISION,
    "dateCourriel" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateSoins" TIMESTAMP(3),
    "prestataire" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECU',
    "traitePar" TEXT,
    "dateTraitement" TIMESTAMP(3),
    "observations" TEXT,
    "dossierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courriel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBot" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "expeditieurId" TEXT NOT NULL,
    "expeditieurNom" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reponse" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntrepriseContact" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT,
    "fonction" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntrepriseContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeCalculAppelFonds" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEPENSE_MENSUELLE',
    "parametres" TEXT NOT NULL DEFAULT '{}',
    "periodicite" TEXT NOT NULL DEFAULT 'MENSUELLE',
    "dateDebut" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeCalculAppelFonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationEmail" (
    "id" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpUser" TEXT NOT NULL,
    "smtpPass" TEXT NOT NULL,
    "smtpFrom" TEXT NOT NULL,
    "emailRapportDestinataire" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoriqueParametre" (
    "id" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "champ" TEXT NOT NULL,
    "ancienneValeur" TEXT,
    "nouvelleValeur" TEXT,
    "modifiePar" TEXT NOT NULL,
    "modifieParId" TEXT,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL DEFAULT 'MODIFICATION',
    "niveau" TEXT NOT NULL DEFAULT 'STANDARD',
    "module" TEXT,
    "objet" TEXT,
    "societeId" TEXT,
    "ipAdresse" TEXT,
    "navigateur" TEXT,
    "sessionId" TEXT,
    "motif" TEXT,

    CONSTRAINT "HistoriqueParametre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Dossier_numeroDossier_key" ON "Dossier"("numeroDossier");

-- CreateIndex
CREATE UNIQUE INDEX "Bareme_societeId_prestation_key" ON "Bareme"("societeId", "prestation");

-- CreateIndex
CREATE UNIQUE INDEX "Assure_nSS_key" ON "Assure"("nSS");

-- CreateIndex
CREATE UNIQUE INDEX "PrestataireSociete_prestataireId_societeId_key" ON "PrestataireSociete"("prestataireId", "societeId");

-- CreateIndex
CREATE UNIQUE INDEX "Courriel_dossierId_key" ON "Courriel"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "ModeCalculAppelFonds_societeId_key" ON "ModeCalculAppelFonds"("societeId");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_entite_entiteId_idx" ON "HistoriqueParametre"("entite", "entiteId");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_dateModification_idx" ON "HistoriqueParametre"("dateModification");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_action_idx" ON "HistoriqueParametre"("action");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_niveau_idx" ON "HistoriqueParametre"("niveau");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_modifieParId_idx" ON "HistoriqueParametre"("modifieParId");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_societeId_idx" ON "HistoriqueParametre"("societeId");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_module_idx" ON "HistoriqueParametre"("module");

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- AddForeignKey
ALTER TABLE "Contrat" ADD CONSTRAINT "Contrat_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppelDeFonds" ADD CONSTRAINT "AppelDeFonds_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "Contrat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_gestionnaireAccueilId_fkey" FOREIGN KEY ("gestionnaireAccueilId") REFERENCES "Gestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_assureId_fkey" FOREIGN KEY ("assureId") REFERENCES "Assure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "Prestataire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_gestionnaireTechniqueId_fkey" FOREIGN KEY ("gestionnaireTechniqueId") REFERENCES "Gestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_gestionnaireComptaId_fkey" FOREIGN KEY ("gestionnaireComptaId") REFERENCES "Gestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commentaire" ADD CONSTRAINT "Commentaire_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commentaire" ADD CONSTRAINT "Commentaire_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Justificatif" ADD CONSTRAINT "Justificatif_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bareme" ADD CONSTRAINT "Bareme_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDossier" ADD CONSTRAINT "ImportDossier_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportHistorique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDossier" ADD CONSTRAINT "ImportDossier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assure" ADD CONSTRAINT "Assure_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestataireSociete" ADD CONSTRAINT "PrestataireSociete_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "Prestataire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestataireSociete" ADD CONSTRAINT "PrestataireSociete_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courriel" ADD CONSTRAINT "Courriel_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courriel" ADD CONSTRAINT "Courriel_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrepriseContact" ADD CONSTRAINT "EntrepriseContact_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeCalculAppelFonds" ADD CONSTRAINT "ModeCalculAppelFonds_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

