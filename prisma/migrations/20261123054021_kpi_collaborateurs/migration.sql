-- CreateTable
CREATE TABLE "EtapeTraitement" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "userId" TEXT,
    "gestionnaireId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TRAVAIL',
    "source" TEXT NOT NULL DEFAULT 'CIRCUIT',
    "statutAvant" TEXT,
    "statutApres" TEXT,
    "dateAffectation" TIMESTAMP(3) NOT NULL,
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "motifReaffectation" TEXT,
    "motifRetour" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtapeTraitement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapeSuspension" (
    "id" TEXT NOT NULL,
    "etapeId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "suspenduA" TIMESTAMP(3) NOT NULL,
    "reprisA" TIMESTAMP(3),
    "parId" TEXT,

    CONSTRAINT "EtapeSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectifDelai" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "typeDossier" TEXT,
    "delaiMinutes" INTEGER NOT NULL,
    "valideDu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valideAu" TIMESTAMP(3),
    "motif" TEXT,
    "creeParId" TEXT NOT NULL,

    CONSTRAINT "ObjectifDelai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeuilAlerteKpi" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "typeAlerte" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "modifieParId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeuilAlerteKpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EtapeTraitement_dossierId_idx" ON "EtapeTraitement"("dossierId");

-- CreateIndex
CREATE INDEX "EtapeTraitement_service_dateAffectation_idx" ON "EtapeTraitement"("service", "dateAffectation");

-- CreateIndex
CREATE INDEX "EtapeTraitement_userId_dateFin_idx" ON "EtapeTraitement"("userId", "dateFin");

-- CreateIndex
CREATE INDEX "EtapeTraitement_gestionnaireId_idx" ON "EtapeTraitement"("gestionnaireId");

-- CreateIndex
CREATE INDEX "EtapeSuspension_etapeId_idx" ON "EtapeSuspension"("etapeId");

-- CreateIndex
CREATE INDEX "ObjectifDelai_service_valideDu_idx" ON "ObjectifDelai"("service", "valideDu");

-- CreateIndex
CREATE INDEX "SeuilAlerteKpi_service_idx" ON "SeuilAlerteKpi"("service");

-- CreateIndex
CREATE UNIQUE INDEX "SeuilAlerteKpi_service_typeAlerte_key" ON "SeuilAlerteKpi"("service", "typeAlerte");

-- CreateIndex
CREATE INDEX "HistoriqueParametre_roleUtilisateur_idx" ON "HistoriqueParametre"("roleUtilisateur");

-- AddForeignKey
ALTER TABLE "EtapeTraitement" ADD CONSTRAINT "EtapeTraitement_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeTraitement" ADD CONSTRAINT "EtapeTraitement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeTraitement" ADD CONSTRAINT "EtapeTraitement_gestionnaireId_fkey" FOREIGN KEY ("gestionnaireId") REFERENCES "Gestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeSuspension" ADD CONSTRAINT "EtapeSuspension_etapeId_fkey" FOREIGN KEY ("etapeId") REFERENCES "EtapeTraitement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeSuspension" ADD CONSTRAINT "EtapeSuspension_parId_fkey" FOREIGN KEY ("parId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectifDelai" ADD CONSTRAINT "ObjectifDelai_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeuilAlerteKpi" ADD CONSTRAINT "SeuilAlerteKpi_modifieParId_fkey" FOREIGN KEY ("modifieParId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
