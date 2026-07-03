-- CreateTable
CREATE TABLE "MessageBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canal" TEXT NOT NULL,
    "expeditieurId" TEXT NOT NULL,
    "expeditieurNom" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reponse" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
