import { describe, it, expect, vi } from 'vitest';
import {
  estValideALaDate,
  estEnVigueurPourCalcul,
  periodesSeChevauchent,
  detecterChevauchements,
  prochaineVersion,
  veilleDe,
  dedupliquerEnVigueur,
  trouverBaremeValide,
  chargerVersionsCombinaison,
  normaliserPrestation,
  filtreEnVigueur,
  type BaremeDated,
} from '@/lib/baremes-validite';

// ─── Tests P1 « Validité datée des barèmes » ─────────────────────────────────
// Couverture exigée : dates limites, anciens tarifs, chevauchements,
// modifications (versionnement), remboursements historiques.

const D = (iso: string) => new Date(iso);

/** Fabrique une version de barème de test. */
function bareme(overrides: Partial<BaremeDated> = {}): BaremeDated {
  return {
    id: 'b1',
    societeId: 's1',
    prestation: 'PHARMACIE',
    tauxCouverture: 80,
    plafond: 500_000,
    description: null,
    active: true,
    valideDu: D('2026-01-01T00:00:00Z'),
    valideAu: null,
    version: 1,
    supprime: false,
    ...overrides,
  };
}

// ─── 1. Dates limites (bornes inclusives) ────────────────────────────────────

describe('estValideALaDate — bornes', () => {
  const b = bareme({ valideDu: D('2026-01-01T00:00:00Z'), valideAu: D('2026-12-31T23:59:59Z') });

  it('accepte la date exacte de début (borne incluse)', () => {
    expect(estValideALaDate(b, D('2026-01-01T00:00:00Z'))).toBe(true);
  });

  it('accepte la date exacte de fin (borne incluse)', () => {
    expect(estValideALaDate(b, D('2026-12-31T23:59:59Z'))).toBe(true);
  });

  it('refuse avant le début et après la fin', () => {
    expect(estValideALaDate(b, D('2025-12-31T23:59:59Z'))).toBe(false);
    expect(estValideALaDate(b, D('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('valideAu null = période ouverte (version en cours)', () => {
    const ouvert = bareme({ valideDu: D('2026-01-01T00:00:00Z'), valideAu: null });
    expect(estValideALaDate(ouvert, D('2030-06-15T12:00:00Z'))).toBe(true);
  });

  it('une version soft-supprimée n\'est plus valide', () => {
    const retiré = bareme({ supprime: true });
    expect(estValideALaDate(retiré, new Date())).toBe(false);
  });
});

describe('estEnVigueurPourCalcul — distinction actif (administratif) / validité', () => {
  it('un barème VALIDE mais administrativement DÉSACTIVÉ n\'est pas en vigueur', () => {
    const suspendu = bareme({ active: false });
    expect(estValideALaDate(suspendu, new Date())).toBe(true);   // période OK
    expect(estEnVigueurPourCalcul(suspendu, new Date())).toBe(false); // admin KO
  });

  it('un barème ACTIF mais HORS PÉRIODE n\'est pas en vigueur', () => {
    const futur = bareme({ valideDu: D('2027-01-01T00:00:00Z') });
    expect(estEnVigueurPourCalcul(futur, D('2026-06-01T00:00:00Z'))).toBe(false);
  });
});

// ─── 2. Chevauchements (point 7) ─────────────────────────────────────────────

describe('periodesSeChevauchent', () => {
  it('détecte le chevauchement partiel et l\'inclusion', () => {
    expect(periodesSeChevauchent(D('2026-01-01'), D('2026-06-30'), D('2026-06-01'), D('2026-12-31'))).toBe(true);
    expect(periodesSeChevauchent(D('2026-01-01'), null, D('2026-06-01'), D('2026-12-31'))).toBe(true);
  });

  it('détecte le partage d\'un SEUL jour (bornes inclusives)', () => {
    expect(periodesSeChevauchent(D('2026-01-01'), D('2026-06-30'), D('2026-06-30'), D('2026-12-31'))).toBe(true);
  });

  it('tolère deux périodes disjointes', () => {
    expect(periodesSeChevauchent(D('2026-01-01'), D('2026-06-29'), D('2026-06-30'), D('2026-12-31'))).toBe(false);
  });

  it('NULL = infini (version en cours chevauche tout ce qui la touche)', () => {
    expect(periodesSeChevauchent(D('2026-01-01'), null, D('2030-01-01'), null)).toBe(true);
    expect(periodesSeChevauchent(D('2026-01-01'), D('2026-02-01'), D('2026-03-01'), null)).toBe(false);
  });
});

describe('detecterChevauchements — anti-chevauchement par combinaison', () => {
  const v1 = bareme({ id: 'b1', version: 1, valideDu: D('2026-01-01'), valideAu: D('2026-06-30') });

  it('signale un conflit pour une période qui chevauche v1', () => {
    const conflits = detecterChevauchements([v1], { valideDu: D('2026-05-01'), valideAu: null });
    expect(conflits).toHaveLength(1);
    expect(conflits[0].id).toBe('b1');
  });

  it('n\'en signale PAS pour une période postérieure disjointe', () => {
    const conflits = detecterChevauchements([v1], { valideDu: D('2026-07-01'), valideAu: null });
    expect(conflits).toHaveLength(0);
  });

  it('exclut la version en cours de modification (excludeId)', () => {
    const conflits = detecterChevauchements([v1], {
      valideDu: D('2026-05-01'), valideAu: null, excludeId: 'b1',
    });
    expect(conflits).toHaveLength(0);
  });

  it('ignore les versions soft-supprimées', () => {
    const retiré = bareme({ id: 'b0', supprime: true, valideDu: D('2026-01-01'), valideAu: null });
    const conflits = detecterChevauchements([retiré], { valideDu: D('2026-05-01'), valideAu: null });
    expect(conflits).toHaveLength(0);
  });
});

// ─── 3. Versionnement (points 2-3 : modifications sans écrasement) ──────────

describe('prochaineVersion / veilleDe — continuité des périodes', () => {
  it('calcule la version suivante (max + 1)', () => {
    expect(prochaineVersion([])).toBe(1);
    expect(prochaineVersion([bareme({ version: 1 }), bareme({ version: 3, id: 'b3' })])).toBe(4);
  });

  it('la veille assure la continuité sans chevauchement : [du, veille] + [du, …]', () => {
    const nouveau = D('2026-07-01T00:00:00Z');
    const cloture = veilleDe(nouveau);
    expect(cloture.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    // La version clôturée [2026-01-01, 2026-06-30] et la nouvelle [2026-07-01, …]
    // ne se chevauchent PAS et ne laissent aucun trou.
    expect(periodesSeChevauchent(D('2026-01-01'), cloture, nouveau, null)).toBe(false);
    expect(estValideALaDate(bareme({ valideAu: cloture }), cloture)).toBe(true);
    expect(estValideALaDate(bareme({ valideDu: nouveau }), nouveau)).toBe(true);
  });
});

// ─── 4. Remboursements historiques (points 6 et 8) ──────────────────────────

describe('dedupliquerEnVigueur — une seule version par combinaison', () => {
  const v1 = bareme({ id: 'v1', version: 1, tauxCouverture: 80, valideDu: D('2026-01-01'), valideAu: D('2026-06-30') });
  const v2 = bareme({ id: 'v2', version: 2, tauxCouverture: 70, valideDu: D('2026-07-01'), valideAu: null });
  const autreSociete = bareme({ id: 'w1', societeId: 's2', prestation: 'PHARMACIE', version: 1 });

  it('à la date passée (juin 2026) : l\'ANCIEN tarif v1 est sélectionné (80%)', () => {
    const enVigueur = dedupliquerEnVigueur([v1, v2], D('2026-06-15'));
    expect(enVigueur).toHaveLength(1);
    expect(enVigueur[0].id).toBe('v1');
    expect(enVigueur[0].tauxCouverture).toBe(80);
  });

  it('à la date courante (août 2026) : le NOUVEAU tarif v2 est sélectionné (70%)', () => {
    const enVigueur = dedupliquerEnVigueur([v1, v2], D('2026-08-15'));
    expect(enVigueur).toHaveLength(1);
    expect(enVigueur[0].id).toBe('v2');
    expect(enVigueur[0].tauxCouverture).toBe(70);
  });

  it('déduplique PAR COMBINAISON (société, prestation) — pas de double comptage', () => {
    const enVigueur = dedupliquerEnVigueur([v1, v2, autreSociete], D('2026-08-15'));
    expect(enVigueur).toHaveLength(2); // s1 (v2) + s2
  });

  it('exclut les combinaisons sans version en vigueur (période future)', () => {
    const futur = bareme({ id: 'f1', version: 1, valideDu: D('2027-01-01'), valideAu: null });
    expect(dedupliquerEnVigueur([futur], D('2026-08-15'))).toHaveLength(0);
  });

  it('en cas de chevauchement résiduel : retient la version la plus récente', () => {
    const a = bareme({ id: 'a', version: 1, valideDu: D('2026-01-01'), valideAu: null });
    const b = bareme({ id: 'b', version: 2, valideDu: D('2026-03-01'), valideAu: null });
    const enVigueur = dedupliquerEnVigueur([a, b], D('2026-08-15'));
    expect(enVigueur).toHaveLength(1);
    expect(enVigueur[0].id).toBe('b');
  });
});

describe('trouverBaremeValide — sélection datée (requête Prisma)', () => {
  it('construit une requête à la DATE DE PRESTATION avec tri version la plus récente', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { bareme: { findFirst } };
    const date = D('2026-06-15T10:00:00Z');
    await trouverBaremeValide(db, { societeId: 's1', prestation: ' pharmacie ', date });

    expect(findFirst).toHaveBeenCalledTimes(1);
    const args = findFirst.mock.calls[0][0];
    // prestation normalisée (trim + casse)
    expect(args.where.prestation).toBe('PHARMACIE');
    // filtres de validité temporelle + vivant + actif
    expect(args.where.supprime).toBe(false);
    expect(args.where.active).toBe(true);
    expect(args.where.valideDu).toEqual({ lte: date });
    expect(args.where.OR).toEqual([{ valideAu: null }, { valideAu: { gte: date } }]);
    // la version la plus récente couvrant la date gagne
    expect(args.orderBy).toEqual([{ valideDu: 'desc' }, { version: 'desc' }]);
    expect(args.take).toBe(1);
  });

  it('renvoie la version sélectionnée (justification du remboursement)', async () => {
    const v1 = bareme({ id: 'v1', version: 1, tauxCouverture: 80, valideAu: D('2026-06-30') });
    const db = { bareme: { findFirst: vi.fn().mockResolvedValue(v1) } };
    const result = await trouverBaremeValide(db, {
      societeId: 's1', prestation: 'PHARMACIE', date: D('2026-06-15'),
    });
    expect(result?.id).toBe('v1');
    expect(result?.tauxCouverture).toBe(80);
  });

  it('aucune version couvrante → null (fail-closed : acte non couvert)', async () => {
    const db = { bareme: { findFirst: vi.fn().mockResolvedValue(null) } };
    const result = await trouverBaremeValide(db, {
      societeId: 's1', prestation: 'PHARMACIE', date: D('2026-06-15'),
    });
    expect(result).toBeNull();
  });
});

describe('chargerVersionsCombinaison — toutes versions (y compris retirées)', () => {
  it('ne filtre PAS supprime : les numéros de version consommés sont préservés', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { bareme: { findMany } };
    await chargerVersionsCombinaison(db, { societeId: 's1', prestation: 'pharmacie' });
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ societeId: 's1', prestation: 'PHARMACIE' });
    expect(args.where.supprime).toBeUndefined();
  });
});

describe('filtreEnVigueur — clause where réutilisable', () => {
  it('combine vivant + actif + période couvrant la date', () => {
    const date = D('2026-08-15');
    const where = filtreEnVigueur(date);
    expect(where).toEqual({
      supprime: false,
      active: true,
      valideDu: { lte: date },
      OR: [{ valideAu: null }, { valideAu: { gte: date } }],
    });
  });

  it('défaut : la date courante', () => {
    const where = filtreEnVigueur();
    expect((where.valideDu as { lte: Date }).lte).toBeInstanceOf(Date);
  });
});

describe('normaliserPrestation', () => {
  it('trim + casse haute', () => {
    expect(normaliserPrestation(' pharmacie ')).toBe('PHARMACIE');
  });
});
