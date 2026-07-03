-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'UTILISATEUR',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "dernierLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Societe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Gestionnaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "budgetAnnuel" REAL NOT NULL,
    "budgetUtilise" REAL NOT NULL DEFAULT 0,
    "dateDebut" DATETIME NOT NULL,
    "dateFin" DATETIME NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ACTIF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contrat_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppelDeFonds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratId" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "dateAppel" DATETIME NOT NULL,
    "datePaiement" DATETIME,
    "reference" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "observations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppelDeFonds_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "Contrat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numeroDossier" TEXT NOT NULL,
    "dateReception" DATETIME NOT NULL,
    "societeId" TEXT NOT NULL,
    "beneficiaire" TEXT NOT NULL,
    "typeDossier" TEXT NOT NULL,
    "gestionnaireAccueilId" TEXT,
    "createurId" TEXT,
    "assureId" TEXT,
    "nSS" TEXT,
    "prestataireId" TEXT,
    "prestataireLegacy" TEXT,
    "dateSoins" DATETIME,
    "moyenPaiement" TEXT,
    "observations" TEXT,
    "dateTraitementTechnique" DATETIME,
    "montantReclame" REAL NOT NULL,
    "montantValide" REAL,
    "ticketModerateur" REAL,
    "partPatient" REAL,
    "partEntreprise" REAL,
    "gestionnaireTechniqueId" TEXT,
    "motifRejet" TEXT,
    "dateReceptionDecompte" DATETIME,
    "datePaiement" DATETIME,
    "referencePaiement" TEXT,
    "montantPaye" REAL,
    "gestionnaireComptaId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECU',
    "source" TEXT NOT NULL DEFAULT 'EXCEL',
    "historique" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dossier_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dossier_gestionnaireAccueilId_fkey" FOREIGN KEY ("gestionnaireAccueilId") REFERENCES "Gestionnaire" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Dossier_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Dossier_assureId_fkey" FOREIGN KEY ("assureId") REFERENCES "Assure" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Dossier_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "Prestataire" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Dossier_gestionnaireTechniqueId_fkey" FOREIGN KEY ("gestionnaireTechniqueId") REFERENCES "Gestionnaire" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Dossier_gestionnaireComptaId_fkey" FOREIGN KEY ("gestionnaireComptaId") REFERENCES "Gestionnaire" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commentaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "auteurId" TEXT,
    "contenu" TEXT NOT NULL,
    "prive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commentaire_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commentaire_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Justificatif" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "tailleKo" REAL,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Justificatif_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportHistorique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "nbLignes" INTEGER NOT NULL,
    "nbSucces" INTEGER NOT NULL DEFAULT 0,
    "nbErreurs" INTEGER NOT NULL DEFAULT 0,
    "rapport" TEXT NOT NULL DEFAULT '[]',
    "importePar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bareme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societeId" TEXT NOT NULL,
    "prestation" TEXT NOT NULL,
    "tauxCouverture" REAL NOT NULL,
    "plafond" REAL NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bareme_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportDossier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "dossierId" TEXT,
    "numeroLigne" INTEGER NOT NULL,
    "statutImport" TEXT NOT NULL DEFAULT 'SUCCES',
    "erreur" TEXT,
    "donnees" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ImportDossier_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportHistorique" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportDossier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nSS" TEXT,
    "prenom" TEXT,
    "dateNaissance" DATETIME,
    "sexe" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assure_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prestataire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "nif" TEXT,
    "statut" TEXT,
    "rib" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Courriel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "societeId" TEXT,
    "beneficiaire" TEXT,
    "montant" REAL,
    "dateCourriel" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateSoins" DATETIME,
    "prestataire" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECU',
    "traitePar" TEXT,
    "dateTraitement" DATETIME,
    "observations" TEXT,
    "dossierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Courriel_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Courriel_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "Courriel_dossierId_key" ON "Courriel"("dossierId");
