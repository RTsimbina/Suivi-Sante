/**
 * ARC-01 — La procédure d'installation n'exécute plus AUCUN DDL runtime.
 *
 * Ancien comportement : la route /api/setup créait les tables via
 * $executeRawUnsafe (CREATE_TABLES_SQL), posait les clés étrangères via
 * FOREIGN_KEYS_SQL et ajoutait des colonnes via ALTER TABLE — le schéma
 * existait en double (migrations Prisma + DDL runtime), avec des
 * comportements de suppression divergents.
 *
 * Nouveau comportement : le schéma a une source unique (migrations Prisma) ;
 * le module ne fait que du seed et une migration de DONNÉES idempotente
 * (budgetUtilise). Aucun $executeRawUnsafe, aucun CREATE/ALTER/DROP.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeRaw, executeRawUnsafe, modeles, dbMock } = vi.hoisted(() => {
  const executeRaw = vi.fn().mockResolvedValue(0);
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  // Modèles Prisma : stubs génériques créés à la demande (le seed touche une
  // douzaine de modèles ; seul `utilisateur` a des mocks spécifiques).
  const modeles = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const dbMock = new Proxy({}, {
    get(_cible, prop: string) {
      if (prop === '$executeRaw') return executeRaw;
      if (prop === '$executeRawUnsafe') return executeRawUnsafe;
      if (!modeles.has(prop)) {
        modeles.set(prop, {
          create: vi.fn().mockResolvedValue({ id: `id-${prop}-1` }),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
          upsert: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
        });
      }
      return modeles.get(prop);
    },
  });
  return { executeRaw, executeRawUnsafe, modeles, dbMock };
});

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { executerInstallation } from './installation';

function modele(nom: string) {
  // Lecture via le Proxy : crée les stubs à la première demande.
  return (dbMock as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[nom];
}

beforeEach(() => {
  vi.clearAllMocks();
  executeRaw.mockResolvedValue(0);
  executeRawUnsafe.mockResolvedValue(0);
  modeles.clear();
});

describe('ARC-01 — executerInstallation', () => {
  it('n\u2019exécute JAMAIS de DDL ($executeRawUnsafe absent du flux)', async () => {
    modele('utilisateur').count.mockResolvedValue(5); // base déjà initialisée

    const res = await executerInstallation();

    expect(res.success).toBe(true);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('$executeRaw n\u2019est utilisé QUE pour la migration de données budgetUtilise (UPDATE)', async () => {
    modele('utilisateur').count.mockResolvedValue(5);

    await executerInstallation();

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const sql = String(executeRaw.mock.calls[0][0]);
    expect(sql).toContain('UPDATE');
    expect(sql).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX/i);
  });

  it('base déjà initialisée (utilisateurs existants) → seed sauté, mots de passe intacts', async () => {
    modele('utilisateur').findMany.mockResolvedValue([
      { id: 'u-1', email: 'admin@smartflow.mg' },
    ]);
    modele('utilisateur').count.mockResolvedValue(5);

    const res = await executerInstallation();

    expect(res.success).toBe(true);
    expect(res.message).toContain('déjà initialisée');
    expect(res.users).toBe(5);
    expect(res.migrated).toBe(1);
    // migration email appliquée
    expect(modele('utilisateur').update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { email: 'admin@suivisante.mg' },
    });
    // aucun seed
    expect(modele('utilisateur').upsert).not.toHaveBeenCalled();
    expect(modele('societe').create).not.toHaveBeenCalled();
  });

  it('base vierge → seed complet (utilisateurs + sociétés) SANS DDL', async () => {
    const findMany = modele('utilisateur').findMany;
    findMany.mockResolvedValueOnce([]) // 1re lecture : aucun email @smartflow.mg
      .mockResolvedValue([
        { id: 'u-accueil', role: 'ACCUEIL' },
        { id: 'u-sante', role: 'SANTE' },
      ]);
    modele('utilisateur').count.mockResolvedValue(0);

    const res = await executerInstallation();

    expect(res.success).toBe(true);
    expect(res.message).toContain('avec succès');
    expect(modele('utilisateur').upsert).toHaveBeenCalledTimes(5);
    expect(modele('societe').create).toHaveBeenCalledTimes(15);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });
});
