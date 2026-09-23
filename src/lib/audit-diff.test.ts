// ─── Tests — Utilitaires d'audit purs ───────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { diffFields, serialiserValeurAudit, buildOperationId, AUDIT_VALEUR_MAX } from './audit-diff';

describe('diffFields', () => {
  it('détecte les champs réellement modifiés', () => {
    const old = { nom: 'A', ville: 'Tana', actif: true };
    const diff = diffFields(old, { nom: 'B', ville: 'Tana', actif: false });
    expect(diff).toEqual([
      { champ: 'nom', ancienneValeur: 'A', nouvelleValeur: 'B' },
      { champ: 'actif', ancienneValeur: true, nouvelleValeur: false },
    ]);
  });

  it('ignore les valeurs undefined (non envoyées)', () => {
    const diff = diffFields({ a: 1, b: 2 }, { a: 1, b: undefined });
    expect(diff).toHaveLength(0);
  });

  it('null ↔ "" équivalents (les deux "vides") — pas de faux positif', () => {
    const diff = diffFields({ x: null }, { x: '' });
    expect(diff).toHaveLength(0);
    const diff2 = diffFields({ x: null }, { x: null });
    expect(diff2).toHaveLength(0);
    const diff3 = diffFields({ x: null }, { x: 'texte' });
    expect(diff3).toHaveLength(1);
  });

  it('comparaison Date identique = pas de diff (conversion préalable côté route)', () => {
    const d = new Date('2026-01-15T00:00:00.000Z');
    const diff = diffFields({ dateSoins: d }, { dateSoins: new Date('2026-01-15T00:00:00.000Z') });
    expect(diff).toHaveLength(0);
  });
});

describe('serialiserValeurAudit', () => {
  it('null/undefined → null', () => {
    expect(serialiserValeurAudit(null)).toBeNull();
    expect(serialiserValeurAudit(undefined)).toBeNull();
  });

  it('objets → JSON, dates → ISO', () => {
    expect(serialiserValeurAudit({ a: 1 })).toBe('{"a":1}');
    expect(serialiserValeurAudit(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z');
  });

  it('tronque les valeurs trop longues', () => {
    const long = 'x'.repeat(AUDIT_VALEUR_MAX + 500);
    const out = serialiserValeurAudit(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(AUDIT_VALEUR_MAX);
    expect(out!.endsWith('...')).toBe(true);
  });
});

describe('buildOperationId', () => {
  it('génère des identifiants uniques de format UUID', () => {
    const a = buildOperationId();
    const b = buildOperationId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
