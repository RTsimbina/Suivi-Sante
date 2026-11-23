-- R2 — Responsable de service : portée « son service uniquement ».
-- Le service géré borne côté serveur la consultation KPI du rôle
-- RESPONSABLE_SERVICE (performance, alertes, export). NULL pour les autres
-- rôles ; la résolution du périmètre échoue (fail-closed) si un
-- RESPONSABLE_SERVICE n'a pas de service associé.

ALTER TABLE "Utilisateur" ADD COLUMN "serviceResponsable" TEXT;
