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

-- CreateIndex
CREATE UNIQUE INDEX "PrestataireSociete_prestataireId_societeId_key" ON "PrestataireSociete"("prestataireId", "societeId");

-- AddForeignKey
ALTER TABLE "PrestataireSociete" ADD CONSTRAINT "PrestataireSociete_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "Prestataire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestataireSociete" ADD CONSTRAINT "PrestataireSociete_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "Societe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
