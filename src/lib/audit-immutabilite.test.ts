/**
 * audit-immutabilite.test.ts — Régression CI de l'immuabilité EN BASE du
 * journal d'audit (P1 « Durcir l'immuabilité du journal en base »,
 * cahier des charges chapitre 10).
 *
 * Le test RÉEL d'échec d'écriture directe (UPDATE / DELETE / TRUNCATE
 * refusés sur un Postgres embarqué) vit dans
 * scripts/test-audit-immutability.mjs — hors Vitest, comme les autres
 * tests SQL du dépôt (verrouillage atomique, rate limiting, bucketing
 * horaire). Ici, on verrouille le contenu des MIGRATIONS : une suppression
 * ou un refactor accidentel des déclencheurs ferait échouer la CI avant
 * tout déploiement.
 *
 * Déterminisme attendu après la migration 20261117090000 :
 *   - historiqueparametre_immutabilite   : BEFORE UPDATE OR DELETE (row) ;
 *   - historiqueparametre_truncate_interdit : BEFORE TRUNCATE (statement).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationsDir = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../prisma/migrations',
);

const MIG_LIGNE = path.join(migrationsDir, '20260924110000_prestataires_exception_doublons', 'migration.sql');
const MIG_TRUNCATE = path.join(migrationsDir, '20261117090000_audit_journal_immutabilite_truncate', 'migration.sql');

describe('Immuabilité du journal d\'audit en base (P1)', () => {
  it('migration 20260924110000 : trigger UPDATE/DELETE sur HistoriqueParametre', () => {
    expect(existsSync(MIG_LIGNE), 'fichier de migration présent').toBe(true);
    const sql = readFileSync(MIG_LIGNE, 'utf8');
    expect(sql).toContain('CREATE TRIGGER historiqueparametre_immutabilite');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "HistoriqueParametre"');
    expect(sql).toContain('EXECUTE FUNCTION interdire_modification_audit()');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('migration 20261117090000 : trigger TRUNCATE (FOR EACH STATEMENT)', () => {
    expect(existsSync(MIG_TRUNCATE), 'fichier de migration présent').toBe(true);
    const sql = readFileSync(MIG_TRUNCATE, 'utf8');
    expect(sql).toContain('CREATE TRIGGER historiqueparametre_truncate_interdit');
    expect(sql).toContain('BEFORE TRUNCATE ON "HistoriqueParametre"');
    expect(sql).toContain('FOR EACH STATEMENT');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_interdire_truncate()');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('migration 20261117090000 : ré-application défensive du trigger UPDATE/DELETE', () => {
    // L'état final après la dernière migration est DÉTERMINISTE : même si un
    // opérateur avait supprimé le trigger d'origine, la dernière migration
    // du journal le recrée (DROP IF EXISTS → CREATE TRIGGER).
    const sql = readFileSync(MIG_TRUNCATE, 'utf8');
    expect(sql).toContain('DROP TRIGGER IF EXISTS historiqueparametre_immutabilite');
    expect(sql).toContain('CREATE TRIGGER historiqueparametre_immutabilite');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "HistoriqueParametre"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS historiqueparametre_truncate_interdit');
  });

  it('aucune instruction UPDATE/DELETE/TRUNCATE légitime du journal dans le code applicatif', () => {
    // Garde-fou complémentaire : le schéma Prisma ne déclare aucune
    // suppression en cascade vers HistoriqueParametre (aucune relation),
    // et audit-log.ts n'écrit qu'en create. Si un jour une route tentait
    // update/delete, elle serait de toute façon refusée EN BASE — mais ce
    // test force à le faire consciemment.
    const auditLog = readFileSync(
      path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'audit-log.ts'),
      'utf8',
    );
    expect(auditLog).toContain('db.historiqueParametre.create(');
    expect(auditLog).not.toMatch(/historiqueParametre\.(update|delete|updateMany|deleteMany|upsert)/);
  });
});
