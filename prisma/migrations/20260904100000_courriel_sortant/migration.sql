-- Service de messagerie centralisé : file d'attente + journal des e-mails sortants.
-- Chaque ligne = un message à envoyer, avec statut, tentatives (retry) et traçabilité.

-- CreateTable
CREATE TABLE "CourrielSortant" (
    "id" TEXT NOT NULL,
    "destinataires" JSONB NOT NULL,
    "destinatairePrincipal" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "template" TEXT,
    "donnees" JSONB,
    "texte" TEXT,
    "html" TEXT,
    "piecesJointes" JSONB,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "maxTentatives" INTEGER NOT NULL DEFAULT 5,
    "prochaineTentative" TIMESTAMP(3),
    "derniereErreur" TEXT,
    "messageId" TEXT,
    "priorite" INTEGER NOT NULL DEFAULT 5,
    "categorie" TEXT,
    "source" TEXT,
    "sourceId" TEXT,
    "fromPersonnalise" TEXT,
    "replyTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "envoyeLe" TIMESTAMP(3),

    CONSTRAINT "CourrielSortant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex : file d'attente (claim des messages à traiter)
CREATE INDEX "CourrielSortant_statut_prochaineTentative_idx" ON "CourrielSortant"("statut", "prochaineTentative");

-- CreateIndex : rate-limiting et historique par destinataire
CREATE INDEX "CourrielSortant_destinatairePrincipal_createdAt_idx" ON "CourrielSortant"("destinatairePrincipal", "createdAt");

-- CreateIndex : suivi par catégorie fonctionnelle
CREATE INDEX "CourrielSortant_categorie_idx" ON "CourrielSortant"("categorie");
