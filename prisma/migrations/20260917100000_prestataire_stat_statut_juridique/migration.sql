-- ─── Prestataires : Num STAT + Statut juridique ─────────────────────────────
-- Module GESTION → PRESTATAIRES : la fiche détaillée exige le Numéro
-- Statistique (Madagascar) et le statut juridique (SARL, SA, SUARL, ONG...).
-- Colonnes additives et NULL-safe : aucune donnée existante n'est modifiée.

ALTER TABLE "Prestataire" ADD COLUMN "stat" TEXT;
ALTER TABLE "Prestataire" ADD COLUMN "statutJuridique" TEXT;

-- ─── Journal d'Audit des Paramétrages : rôle de l'utilisateur ───────────────
-- Chaque opération du journal conserve le rôle de l'utilisateur TEL QU'il
-- était au moment de l'opération (immutabilité : on ne re-dérive pas le rôle
-- depuis la table Utilisateur, qui peut évoluer après coup).

ALTER TABLE "HistoriqueParametre" ADD COLUMN "roleUtilisateur" TEXT;
