/**
 * SEC-1 — Confidentialité de la route de détail d'un dossier.
 *
 * Ancien comportement : la route renvoyait l'objet Prisma BRUT — le NSS du
 * dossier et de l'assuré partait en clair vers les rôles externes et les
 * commentaires privés n'étaient pas filtrés, contournant la politique
 * appliquée par la route de liste (P2-03) et la route commentaires.
 *
 * Nouveau comportement (serialisation-dossier.ts) :
 *   - rôles externes (périmètre restreint) : nSS dossier + assuré masqués,
 *     commentaires privés exclus, commentaires publics conservés ;
 *   - rôles internes : objet complet (politique P2-03 inchangée) ;
 *   - dossier d'une autre société → 404 (isolation, non testé ici :
 *     voir isolation-societe.test.ts).
 *
 * Les assertions portent sur le JSON réellement sérialisé, pas sur l'affichage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks (hoistés) ─────────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const dbMocks = vi.hoisted(() => ({
  dossierFindUnique: vi.fn(),
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: authMocks.checkAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    dossier: {
      findUnique: dbMocks.dossierFindUnique,
    },
  },
}));

import { GET as getDossierDetail } from './route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOC_A = 'cmu4y4295000442wt7hqtgtbg'; // SANLAM (jeu de test prod)
const SOC_B = 'cmu4y42b1000t42wtea0ncwc6'; // TELMA (jeu de test prod)

function requete(path: string, headers: Record<string, string> = {}): NextRequest {
  const r = new Request(`http://localhost${path}`, { headers });
  Object.defineProperty(r, 'nextUrl', { value: new URL(`http://localhost${path}`) });
  return r as unknown as NextRequest;
}

const EXTERNE_SOC_A = {
  'x-user-id': 'u-contact-a',
  'x-user-role': 'CONTACT_ENTREPRISE',
  'x-user-societeid': SOC_A,
};

const INTERNE = {
  'x-user-id': 'u-admin',
  'x-user-role': 'ADMINISTRATEUR',
};

/** Dossier complet tel que le renverrait Prisma (include assure + commentaires). */
function dossierComplet() {
  return {
    id: 'd-1',
    numeroDossier: 'DOS-2026-0001',
    societeId: SOC_A,
    nSS: '101350102631000123',
    assure: {
      id: 'a-1',
      nom: 'Rakoto',
      nSS: '201350102631000456',
      actif: true,
    },
    commentaires: [
      { id: 'c-1', contenu: 'Public : dossier complet', prive: false },
      { id: 'c-2', contenu: 'Privé : suspicion de fraude', prive: true },
      { id: 'c-3', contenu: 'Public 2 : relance client', prive: false },
    ],
    historique: JSON.stringify([{ date: '2026-11-01', statut: 'RECU', commentaire: 'Créé' }]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.checkAuth.mockResolvedValue(null);
});

// ─── Rôles externes : masquage ───────────────────────────────────────────────

describe('SEC-1 — GET /api/dossiers/[id]/detail — rôle externe', () => {
  it('CONTACT_ENTREPRISE : nSS du dossier et de l\u2019assuré MASQUÉS dans le JSON', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    const res = await getDossierDetail(requete('/api/dossiers/d-1/detail', EXTERNE_SOC_A), {
      params: Promise.resolve({ id: 'd-1' }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.nSS).not.toBe('101350102631000123');
    expect(json.assure.nSS).not.toBe('201350102631000456');
    // forme masquée (lib/nss.ts) : puces + 4 derniers chiffres conservés
    expect(json.nSS).toContain('•');
    expect(json.nSS).toContain('0123');
    expect(json.assure.nSS).toContain('•');
    expect(json.assure.nSS).toContain('0456');
  });

  it('CONTACT_ENTREPRISE : commentaires privés EXCLUS, publics conservés', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    const res = await getDossierDetail(requete('/api/dossiers/d-1/detail', EXTERNE_SOC_A), {
      params: Promise.resolve({ id: 'd-1' }),
    });
    const json = await res.json();

    const contenus = json.commentaires.map((c: { contenu: string }) => c.contenu);
    expect(contenus).not.toContain('Privé : suspicion de fraude');
    expect(contenus).toContain('Public : dossier complet');
    expect(contenus).toContain('Public 2 : relance client');
    expect(json.commentaires).toHaveLength(2);
  });

  it('PORTAIL_CLIENT (périmètre restreint) : même masquage', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    const res = await getDossierDetail(requete('/api/dossiers/d-1/detail', {
      'x-user-id': 'u-portail',
      'x-user-role': 'PORTAIL_CLIENT',
      'x-user-societeid': SOC_A,
    }), { params: Promise.resolve({ id: 'd-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.nSS).not.toBe('101350102631000123');
    expect(json.commentaires).toHaveLength(2);
  });

  it('PRESTATAIRE : route refusée par périmètre (403, portail dédié) — aucune donnée', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    const res = await getDossierDetail(requete('/api/dossiers/d-1/detail', {
      'x-user-id': 'u-presta',
      'x-user-role': 'PRESTATAIRE',
      'x-user-prestataireid': 'p-1',
    }), { params: Promise.resolve({ id: 'd-1' }) });

    expect(res.status).toBe(403);
    expect(dbMocks.dossierFindUnique).not.toHaveBeenCalled();
  });

  it('la re-vérification du périmètre est appliquée (where societeId imposé)', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    await getDossierDetail(requete('/api/dossiers/d-1/detail', EXTERNE_SOC_A), {
      params: Promise.resolve({ id: 'd-1' }),
    });

    expect(dbMocks.dossierFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd-1', societeId: SOC_A } })
    );
  });
});

// ─── Rôles internes : aucune dégradation ─────────────────────────────────────

describe('SEC-1 — GET /api/dossiers/[id]/detail — rôle interne', () => {
  it('ADMINISTRATEUR : NSS en clair et commentaires privés PRÉSENTS (politique P2-03)', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(dossierComplet());

    const res = await getDossierDetail(requete('/api/dossiers/d-1/detail', INTERNE), {
      params: Promise.resolve({ id: 'd-1' }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.nSS).toBe('101350102631000123');
    expect(json.assure.nSS).toBe('201350102631000456');
    expect(json.commentaires).toHaveLength(3);
  });
});

// ─── Isolation (rappel) ──────────────────────────────────────────────────────

describe('SEC-1 — isolation société inchangée', () => {
  it('dossier d\u2019une autre société → 404 sans révélation', async () => {
    dbMocks.dossierFindUnique.mockResolvedValue(null);

    const res = await getDossierDetail(requete('/api/dossiers/d-b/detail', EXTERNE_SOC_A), {
      params: Promise.resolve({ id: 'd-b' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).erreur).toBe('Dossier introuvable');
  });
});
