-- E-mail du contact principal (Societe) : liaison du compte portail
-- CONTACT_ENTREPRISE au représentant saisi dans « Modifier la société ».
ALTER TABLE "Societe" ADD COLUMN IF NOT EXISTS "emailContactPrincipal" TEXT;
