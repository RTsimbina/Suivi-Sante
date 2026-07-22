-- AlterTable: ajouter les colonnes de lockout anti brute-force sur Utilisateur
-- Remplace le Map en mémoire qui était vulnérable en environnement serverless.

ALTER TABLE "Utilisateur" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Utilisateur" ADD COLUMN "lockoutUntil" TIMESTAMP;