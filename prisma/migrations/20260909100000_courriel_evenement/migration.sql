-- Journal d'événements du cycle de vie des e-mails (table `email_events`
-- du plan de mise en œuvre). Une ligne par transition de statut, horodatée :
-- MISE_EN_FILE, EN_COURS, ENVOYE, RETRY, ECHEC, RECUPERE.
-- La suppression d'un message (purge) supprime son historique (cascade).

-- CreateTable
CREATE TABLE "CourrielEvenement" (
    "id" TEXT NOT NULL,
    "courrielId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fournisseur" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourrielEvenement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourrielEvenement_courrielId_createdAt_idx" ON "CourrielEvenement"("courrielId", "createdAt");

-- CreateIndex
CREATE INDEX "CourrielEvenement_type_createdAt_idx" ON "CourrielEvenement"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "CourrielEvenement" ADD CONSTRAINT "CourrielEvenement_courrielId_fkey" FOREIGN KEY ("courrielId") REFERENCES "CourrielSortant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
