/**
 * Tests de la route /api/utilisateurs — validation de la liaison des rôles externes.
 * Correctif « Aucun assuré lié à votre compte » : créer un compte
 * PORTAIL_CLIENT / CONTACT_ENTREPRISE dont l'e-mail ne correspond à aucun
 * assuré / contact d'entreprise produisait un compte cassé découvrable
 * seulement au login. Désormais : 422 explicite à la création/modification
 * + GET enrichi avec l'état de liaison (visibilité admin).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  utilisateurFindUnique: vi.fn(),
  utilisateurFindMany: vi.fn(),
  utilisateurCount: vi.fn(),
  utilisateurCreate: vi.fn(),
  utilisateurUpdate: vi.fn(),
  assureFindFirst: vi.fn(),
  assureFindMany: vi.fn(),
  contactFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  contactCreate: vi.fn(),
  societeFindUnique: vi.fn(),
  societeFindFirst: vi.fn(),
  societeFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    utilisateur: {
      findUnique: dbMocks.utilisateurFindUnique,
      findMany: dbMocks.utilisateurFindMany,
      count: dbMocks.utilisateurCount,
      create: dbMocks.utilisateurCreate,
      update: dbMocks.utilisateurUpdate,
    },
    assure: {
      findFirst: dbMocks.assureFindFirst,
      findMany: dbMocks.assureFindMany,
    },
    entrepriseContact: {
      findFirst: dbMocks.contactFindFirst,
      findMany: dbMocks.contactFindMany,
      create: dbMocks.contactCreate,
    },
    societe: {
      findUnique: dbMocks.societeFindUnique,
      findFirst: dbMocks.societeFindFirst,
      findMany: dbMocks.societeFindMany,
    },
  },
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
  compare: vi.fn(),
}));

import { GET, POST, PUT } from './route';

function requetePost(body: unknown): NextRequest {
  return new Request('http://localhost/api/utilisateurs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requetePut(body: unknown): NextRequest {
  return new Request('http://localhost/api/utilisateurs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requeteGet(): NextRequest {
  return new Request('http://localhost/api/utilisateurs') as unknown as NextRequest;
}

const PAYLOAD_PORTAIL = {
  email: 'client@exemple.com',
  nom: 'Client Test',
  password: 'motdepasse1',
  role: 'PORTAIL_CLIENT',
};

const UTILISATEUR_CREE = {
  id: 'u1', email: 'client@exemple.com', nom: 'Client Test',
  role: 'PORTAIL_CLIENT', actif: true, avatar: null, createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.utilisateurFindUnique.mockResolvedValue(null); // e-mail disponible
  dbMocks.utilisateurCreate.mockResolvedValue(UTILISATEUR_CREE);
  dbMocks.societeFindUnique.mockResolvedValue({ id: 's1' }); // société existante
  dbMocks.societeFindFirst.mockResolvedValue(null); // aucune liaison par e-mail société
  dbMocks.societeFindMany.mockResolvedValue([]); // enrichissement GET
  dbMocks.contactCreate.mockResolvedValue({ id: 'c1' });
});

describe('POST /api/utilisateurs — liaison des rôles externes', () => {
  it('422 si aucun assuré ne porte l\'e-mail d\'un compte PORTAIL_CLIENT (avant : compte cassé)', async () => {
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const res = await POST(requetePost(PAYLOAD_PORTAIL));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('client@exemple.com');
    expect(body.erreur).toContain('assuré');
    expect(dbMocks.utilisateurCreate).not.toHaveBeenCalled();
  });

  it('201 quand un assuré existe avec cet e-mail', async () => {
    dbMocks.assureFindFirst.mockResolvedValue({ id: 'assure-1' });

    const res = await POST(requetePost(PAYLOAD_PORTAIL));

    expect(res.status).toBe(201);
    expect(dbMocks.utilisateurCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'PORTAIL_CLIENT' }),
      })
    );
  });

  it('422 pour un CONTACT_ENTREPRISE sans contact d\'entreprise lié', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);

    const res = await POST(requetePost({ ...PAYLOAD_PORTAIL, email: 'contact@entreprise.mg', role: 'CONTACT_ENTREPRISE' }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('contact d\'entreprise');
    expect(dbMocks.utilisateurCreate).not.toHaveBeenCalled();
  });

  it('201 en une étape : CONTACT_ENTREPRISE sans contact + societeId → contact créé puis compte créé', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);

    const res = await POST(requetePost({
      ...PAYLOAD_PORTAIL,
      email: 'rep@societe.mg',
      role: 'CONTACT_ENTREPRISE',
      societeId: 's1',
    }));

    expect(res.status).toBe(201);
    expect(dbMocks.contactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ societeId: 's1', email: 'rep@societe.mg' }),
      })
    );
    expect(dbMocks.utilisateurCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'CONTACT_ENTREPRISE' }) })
    );
  });

  it('422 en une étape si la société fournie est introuvable (aucun compte créé)', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);
    dbMocks.societeFindUnique.mockResolvedValue(null);

    const res = await POST(requetePost({
      ...PAYLOAD_PORTAIL,
      email: 'rep@societe.mg',
      role: 'CONTACT_ENTREPRISE',
      societeId: 's-inexistante',
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('société');
    expect(dbMocks.contactCreate).not.toHaveBeenCalled();
    expect(dbMocks.utilisateurCreate).not.toHaveBeenCalled();
  });

  it('societeId ignoré quand le contact existe déjà (comportement inchangé)', async () => {
    // Le select réel renvoie societeId (cf. liaison-externe.ts)
    dbMocks.contactFindFirst.mockResolvedValue({ id: 'c-existant', societeId: 's1' });

    const res = await POST(requetePost({
      ...PAYLOAD_PORTAIL,
      email: 'contact@entreprise.mg',
      role: 'CONTACT_ENTREPRISE',
      societeId: 's1',
    }));

    expect(res.status).toBe(201);
    expect(dbMocks.contactCreate).not.toHaveBeenCalled();
    expect(dbMocks.utilisateurCreate).toHaveBeenCalled();
  });

  it('201 sans fiche contact quand l\'e-mail est celui du contact principal de la société (Modifier la société)', async () => {
    dbMocks.contactFindFirst.mockResolvedValue(null);
    dbMocks.societeFindFirst.mockResolvedValueOnce({ id: 's1' }); // emailContactPrincipal correspond

    const res = await POST(requetePost({
      ...PAYLOAD_PORTAIL,
      email: 'principal@societe.mg',
      role: 'CONTACT_ENTREPRISE',
    }));

    expect(res.status).toBe(201);
    expect(dbMocks.contactCreate).not.toHaveBeenCalled();
    expect(dbMocks.utilisateurCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'CONTACT_ENTREPRISE' }) })
    );
  });

  it('201 pour un rôle interne : aucune liaison exigée', async () => {
    const res = await POST(requetePost({ ...PAYLOAD_PORTAIL, role: 'ACCUEIL' }));

    expect(res.status).toBe(201);
    expect(dbMocks.assureFindFirst).not.toHaveBeenCalled();
    expect(dbMocks.contactFindFirst).not.toHaveBeenCalled();
  });
});

describe('PUT /api/utilisateurs — liaison des rôles externes', () => {
  const EXISTANT_INTERNE = { id: 'u1', email: 'agent@exemple.com', nom: 'Agent', role: 'ACCUEIL', actif: true };
  const EXISTANT_PORTAIL = { id: 'u2', email: 'client@exemple.com', nom: 'Client', role: 'PORTAIL_CLIENT', actif: true };

  it('422 si l\'e-mail d\'un compte externe change vers un e-mail sans assuré', async () => {
    dbMocks.utilisateurFindUnique
      .mockResolvedValueOnce(EXISTANT_PORTAIL)   // compte existant
      .mockResolvedValueOnce(null);              // unicité du nouvel e-mail
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const res = await PUT(requetePut({ id: 'u2', email: 'nouveau@exemple.com' }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('nouveau@exemple.com');
    expect(dbMocks.utilisateurUpdate).not.toHaveBeenCalled();
  });

  it('422 si le rôle bascule vers PORTAIL_CLIENT sans assuré sur l\'e-mail existant', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue(EXISTANT_INTERNE);
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const res = await PUT(requetePut({ id: 'u1', role: 'PORTAIL_CLIENT' }));

    expect(res.status).toBe(422);
    expect(dbMocks.utilisateurUpdate).not.toHaveBeenCalled();
  });

  it('bascule vers CONTACT_ENTREPRISE + societeId → contact créé en une étape, compte mis à jour', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue(EXISTANT_INTERNE);
    dbMocks.contactFindFirst.mockResolvedValue(null); // aucun contact avec cet e-mail
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...EXISTANT_INTERNE, role: 'CONTACT_ENTREPRISE' });

    const res = await PUT(requetePut({ id: 'u1', role: 'CONTACT_ENTREPRISE', societeId: 's1' }));

    expect(res.status).toBe(200);
    expect(dbMocks.contactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ societeId: 's1', email: 'agent@exemple.com', nom: 'Agent' }),
      })
    );
    expect(dbMocks.utilisateurUpdate).toHaveBeenCalled();
  });

  it('201-compatible : modification sans rapport sur un compte externe non re-bloquée', async () => {
    // Rôle déjà externe, e-mail inchangé → pas de re-validation (l'admin peut
    // renommer le compte sans être bloqué par une liaison gérée côté assuré).
    dbMocks.utilisateurFindUnique.mockResolvedValue(EXISTANT_PORTAIL);
    dbMocks.utilisateurUpdate.mockResolvedValue(EXISTANT_PORTAIL);

    const res = await PUT(requetePut({ id: 'u2', nom: 'Nouveau Nom' }));

    expect(res.status).toBe(200);
    expect(dbMocks.assureFindFirst).not.toHaveBeenCalled();
  });
});

describe('GET /api/utilisateurs — visibilité de la liaison', () => {
  it('enrichit liaisonExterne : true (assuré trouvé), false (orphelin), null (interne)', async () => {
    dbMocks.utilisateurFindMany.mockResolvedValue([
      { id: 'u1', email: 'Client@Exemple.com', nom: 'Lié', role: 'PORTAIL_CLIENT', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'u2', email: 'orphelin@exemple.com', nom: 'Orphelin', role: 'PORTAIL_CLIENT', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'u3', email: 'agent@exemple.com', nom: 'Agent', role: 'ACCUEIL', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'u4', email: 'contact@entreprise.mg', nom: 'Contact', role: 'CONTACT_ENTREPRISE', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    dbMocks.utilisateurCount.mockResolvedValue(4);
    dbMocks.assureFindMany.mockResolvedValue([{ email: 'client@exemple.com' }]); // correspondance insensible à la casse
    dbMocks.contactFindMany.mockResolvedValue([]); // contact orphelin

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.utilisateurs).toHaveLength(4);
    expect(body.utilisateurs[0].liaisonExterne).toBe(true);   // casse ignorée
    expect(body.utilisateurs[1].liaisonExterne).toBe(false);  // orphelin → badge
    expect(body.utilisateurs[2].liaisonExterne).toBeNull();   // rôle interne
    expect(body.utilisateurs[3].liaisonExterne).toBe(false);  // contact absent
  });
});
