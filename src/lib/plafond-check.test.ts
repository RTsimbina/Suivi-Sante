/**
 * BIZ-1 / BIZ-2 — Moteur de plafond annuel : fenêtre canonique et borne du
 * montant consommé.
 *
 * BIZ-2 (ancien comportement) : le moteur central bornait la consommation
 * sur l'année COURANTE tandis que les re-vérifications transactionnelles
 * utilisaient l'année de dateReception — un dossier traité l'année suivant
 * sa réception était jugé selon deux fenêtres différentes.
 *
 * BIZ-1 (ancien comportement) : la consommation cumule
 * montantPaye ?? montantValide ?? montantReclame, mais un montant VALIDÉ
 * supérieur au reliquat n'était pas bloqué (MONTANT_DEPASSE_RELIQUAT non
 * bloquant côté PATCH) — 150 000 Ar passaient sur un plafond de 100 000 Ar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  assureFindUnique: vi.fn(),
  baremeFindFirst: vi.fn(),
  baremeFindMany: vi.fn(),
  dossierFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    assure: { findUnique: dbMocks.assureFindUnique },
    bareme: { findFirst: dbMocks.baremeFindFirst, findMany: dbMocks.baremeFindMany },
    dossier: { findMany: dbMocks.dossierFindMany },
  },
}));

import { verifierPlafondAnnuel, fenetreAnnuelle } from './plafond-check';

const SOCIETE = 's-1';
const ASSURE = 'a-1';

function baremeValide(plafond = 100000) {
  return {
    id: 'b-1', societeId: SOCIETE, prestation: 'CONSULTATION', tauxCouverture: 70,
    plafond, description: null, active: true, valideDu: new Date('2025-01-01'),
    valideAu: null, version: 1, supprime: false,
    createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.assureFindUnique.mockResolvedValue({ id: ASSURE, actif: true, societeId: SOCIETE });
  dbMocks.baremeFindFirst.mockResolvedValue(baremeValide());
  dbMocks.baremeFindMany.mockResolvedValue([baremeValide()]); // toutesVersions → plafond global
  // dossiers consommés : aucune ligne par défaut (consommation nulle)
  dbMocks.dossierFindMany.mockResolvedValue([]);
});

describe('fenetreAnnuelle (BIZ-2 — source unique)', () => {
  it('borne l\u2019année sur la date de référence (début 1er janvier, fin 31 décembre)', () => {
    const f = fenetreAnnuelle(new Date(2025, 5, 15)); // 15 juin 2025
    expect(f.annee).toBe(2025);
    expect(f.debut.getFullYear()).toBe(2025);
    expect(f.debut.getMonth()).toBe(0);
    expect(f.debut.getDate()).toBe(1);
    expect(f.fin.getFullYear()).toBe(2025);
    expect(f.fin.getMonth()).toBe(11);
    expect(f.fin.getDate()).toBe(31);
  });
});

describe('verifierPlafondAnnuel — fenêtre de consommation (BIZ-2)', () => {
  it('la consommation est bornée sur l\u2019année de dateReception (PAS l\u2019année courante)', async () => {
    const dateReception = new Date(2025, 5, 15); // dossier reçu mi-2025
    await verifierPlafondAnnuel({
      assureId: ASSURE,
      societeId: SOCIETE,
      typeActe: 'CONSULTATION',
      montantDemande: 50000,
      datePrestation: new Date(), // traité en 2026
      dateReception,
    });

    // les DEUX requêtes de consommation (acte + global) utilisent 2025
    for (const call of dbMocks.dossierFindMany.mock.calls) {
      const where = call[0].where;
      expect(where.dateReception.gte.getFullYear()).toBe(2025);
      expect(where.dateReception.lte.getFullYear()).toBe(2025);
    }
  });

  it('sans dateReception, la fenêtre retombe sur l\u2019année de la prestation', async () => {
    const datePrestation = new Date(2024, 2, 1);
    await verifierPlafondAnnuel({
      assureId: ASSURE,
      societeId: SOCIETE,
      typeActe: 'CONSULTATION',
      montantDemande: 50000,
      datePrestation,
    });
    expect(dbMocks.dossierFindMany.mock.calls[0][0].where.dateReception.gte.getFullYear()).toBe(2024);
  });
});

describe('verifierPlafondAnnuel — consommation et blocages (BIZ-1)', () => {
  it('cascade de consommation montantPaye ?? montantValide ?? montantReclame', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      { montantPaye: 40000, montantValide: 50000, montantReclame: 60000 },
    ]);

    const res = await verifierPlafondAnnuel({
      assureId: ASSURE, societeId: SOCIETE, typeActe: 'CONSULTATION', montantDemande: 10000,
      datePrestation: new Date('2026-03-01'), dateReception: new Date('2026-03-01'),
    });

    expect(res.details.consommeActe).toBe(40000); // montantPaye gagne
  });

  it('montant demandé > reliquat → MONTANT_DEPASSE_RELIQUAT (bloquant côté PATCH)', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      { montantPaye: null, montantValide: 90000, montantReclame: 95000 },
    ]);

    const res = await verifierPlafondAnnuel({
      assureId: ASSURE, societeId: SOCIETE, typeActe: 'CONSULTATION',
      montantDemande: 150000, // plafond 100 000 — consommé 90 000 — reliquat 10 000
      datePrestation: new Date('2026-03-01'), dateReception: new Date('2026-03-01'),
    });

    expect(res.autorise).toBe(false);
    expect(res.raison).toBe('MONTANT_DEPASSE_RELIQUAT');
  });

  it('consommation ≥ plafond → PLAFOND_ACTE_ATTEINT, aucun reliquat', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      { montantPaye: null, montantValide: 100000, montantReclame: 100000 },
    ]);

    const res = await verifierPlafondAnnuel({
      assureId: ASSURE, societeId: SOCIETE, typeActe: 'CONSULTATION',
      montantDemande: 10000,
      datePrestation: new Date('2026-03-01'), dateReception: new Date('2026-03-01'),
    });

    expect(res.autorise).toBe(false);
    expect(res.raison).toBe('PLAFOND_ACTE_ATTEINT');
    expect(res.details.reliquatActe).toBe(0);
  });

  it('montant ≤ reliquat → OK avec montant couvert', async () => {
    dbMocks.dossierFindMany.mockResolvedValue([
      { montantPaye: null, montantValide: 50000, montantReclame: 50000 },
    ]);

    const res = await verifierPlafondAnnuel({
      assureId: ASSURE, societeId: SOCIETE, typeActe: 'CONSULTATION',
      montantDemande: 40000,
      datePrestation: new Date('2026-03-01'), dateReception: new Date('2026-03-01'),
    });

    expect(res.autorise).toBe(true);
    expect(res.raison).toBe('OK');
    expect(res.details.reliquatActe).toBe(50000);
  });
});
