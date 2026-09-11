-- CreateTable
CREATE TABLE "BotSession" (
    "expeditieurId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "assureId" TEXT NOT NULL,
    "assureNom" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "verifieA" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("expeditieurId")
);

-- CreateIndex
CREATE INDEX "BotSession_expiresAt_idx" ON "BotSession"("expiresAt");

