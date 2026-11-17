-- ═══════════════════════════════════════════════════════════════════════════
-- P1 « Durcir l'immuabilité du journal d'audit en base » — couverture TRUNCATE
-- Migration ADDITIVE et NON DESTRUCTIVE
-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAT ANTÉRIEUR (migration 20260924110000_prestataires_exception_doublons) :
--   le déclencheur historiqueparametre_immutabilite interdit UPDATE et DELETE
--   ligne à ligne sur "HistoriqueParametre" (le journal d'audit).
--
-- LACUNE COUVERTE ICI :
--   un TRUNCATE "HistoriqueParametre" ne déclenche AUCUN trigger FOR EACH
--   ROW : un accès direct à la base pouvait vider tout le journal d'une
--   seule instruction, sans erreur — contournement complet de l'immuabilité.
--
-- SOLUTION :
--   1. ré-application défensive (DROP IF EXISTS → CREATE) de la fonction et
--      du trigger UPDATE/DELETE existants : l'état final après cette
--      migration est DÉTERMINISTE même si un opérateur les avait supprimés ;
--   2. nouvelle fonction audit_interdire_truncate() + trigger BEFORE
--      TRUNCATE FOR EACH STATEMENT : toute instruction TRUNCATE échoue
--      immédiatement, quel que soit le client connecté (y compris le
--      propriétaire de la base — les triggers s'exécutent toujours).
--
-- TEST : scripts/test-audit-immutability.mjs (Postgres embarqué) applique
--   cette migration puis vérifie le critère « test d'échec d'écriture
--   directe » du cahier des charges : INSERT autorisé, UPDATE / DELETE /
--   TRUNCATE refusés avec l'erreur attendue. Un test Vitest
--   (src/lib/audit-immutabilite.test.ts) verrouille en CI la présence des
--   déclencheurs dans les migrations.
--
-- ROLLBACK :
--     DROP TRIGGER IF EXISTS historiqueparametre_truncate_interdit ON "HistoriqueParametre";
--     DROP FUNCTION IF EXISTS audit_interdire_truncate();
--   (retour à l'état 20260924 : UPDATE et DELETE restent toujours interdits)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Fonction des triggers ligne à ligne — ré-application défensive (corps
--    identique à la migration 20260924110000)
CREATE OR REPLACE FUNCTION interdire_modification_audit()
RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'Journal d''audit immuable : % interdit sur HistoriqueParametre (entrée %)', TG_OP, OLD."id";
END;
$fn$ LANGUAGE plpgsql;

-- 2. Trigger UPDATE/DELETE — ré-application défensive
DROP TRIGGER IF EXISTS historiqueparametre_immutabilite ON "HistoriqueParametre";
CREATE TRIGGER historiqueparametre_immutabilite
  BEFORE UPDATE OR DELETE ON "HistoriqueParametre"
  FOR EACH ROW
  EXECUTE FUNCTION interdire_modification_audit();

-- 3. TRUNCATE interdit — FOR EACH STATEMENT : TRUNCATE ne passe jamais par
--    les triggers FOR EACH ROW, il lui faut son propre déclencheur
CREATE OR REPLACE FUNCTION audit_interdire_truncate()
RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'Journal d''audit immuable : TRUNCATE interdit sur HistoriqueParametre';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS historiqueparametre_truncate_interdit ON "HistoriqueParametre";
CREATE TRIGGER historiqueparametre_truncate_interdit
  BEFORE TRUNCATE ON "HistoriqueParametre"
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_interdire_truncate();
