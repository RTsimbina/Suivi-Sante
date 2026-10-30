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

const dbMocks = vi.hoisted(() => {
  const delegues = {
    utilisateurFindUnique: vi.fn(),
    utilisateurFindMany: vi.fn(),
    utilisateurCount: vi.fn(),
    utilisateurCreate: vi.fn(),
    utilisateurUpdate: vi.fn(),
    utilisateurDelete: vi.fn().mockResolvedValue({}),
    assureFindFirst: vi.fn(),
    assureFindMany: vi.fn(),
    contactFindFirst: vi.fn(),
    contactFindMany: vi.fn(),
    contactCreate: vi.fn(),
    societeFindUnique: vi.fn(),
    societeFindFirst: vi.fn(),
    societeFindMany: vi.fn(),
    prestataireFindFirst: vi.fn(),
    prestataireFindMany: vi.fn(),
  };
  // Client db mocké : $transaction exécute le callback avec le même objet
  // (le tx partage les délégués — comportement Prisma simplifié pour tests).
  // dbClient porte la STRUCTURE attendue par la route (db.utilisateur…).
  const dbClient: Record<string, unknown> = {
    utilisateur: {
      findUnique: delegues.utilisateurFindUnique,
      findMany: delegues.utilisateurFindMany,
      count: delegues.utilisateurCount,
      create: delegues.utilisateurCreate,
      update: delegues.utilisateurUpdate,
      delete: delegues.utilisateurDelete,
    },
    assure: {
      findFirst: delegues.assureFindFirst,
      findMany: delegues.assureFindMany,
    },
    entrepriseContact: {
      findFirst: delegues.contactFindFirst,
      findMany: delegues.contactFindMany,
      create: delegues.contactCreate,
    },
    societe: {
      findUnique: delegues.societeFindUnique,
      findFirst: delegues.societeFindFirst,
      findMany: delegues.societeFindMany,
    },
    prestataire: {
      findFirst: delegues.prestataireFindFirst,
      findMany: delegues.prestataireFindMany,
    },
  };
  dbClient.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(dbClient));
  return {
    ...delegues,
    $transaction: dbClient.$transaction,
    dbClient,
  };
});

vi.mock('@/lib/db', () => ({
  db: dbMocks.dbClient,
}));

vi.mock('@/lib/authorize', () => ({
  checkAuth: vi.fn().mockResolvedValue(null),
}));

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
  getUserInfoFromRequest: vi
    .fn()
    .mockResolvedValue({ nom: 'Admin', id: 'u-admin', role: 'ADMINISTRATEUR' }),
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
  getUserInfoFromRequest: auditMocks.getUserInfoFromRequest,
}));

// DELETE lit le JWT pour interdire l'auto-suppression
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue({ id: 'u-autre', role: 'ADMINISTRATEUR' }),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
  compare: vi.fn(),
}));

import { GET, POST, PUT, PATCH, DELETE } from './route';

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
  dbMocks.prestataireFindMany.mockResolvedValue([]); // enrichissement GET (comptes PRESTATAIRE)
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

describe('PRESTATAIRE — garde d ambiguïté de la liaison (miroir SPEC-6)', () => {
  const PAYLOAD_PRESTATAIRE = {
    email: 'groupe@presta.mg',
    nom: 'Clinique Groupe',
    password: 'motdepasse1',
    role: 'PRESTATAIRE',
  };

  it('POST 409 si l e-mail est partagé par plusieurs fiches prestataire', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    const res = await POST(requetePost(PAYLOAD_PRESTATAIRE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.erreur).toMatch(/ambigu/i);
    expect(dbMocks.utilisateurCreate).not.toHaveBeenCalled();
  });

  it('POST 201 si l e-mail ne porte que sur une seule fiche', async () => {
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: 'p1' }]);
    const res = await POST(requetePost(PAYLOAD_PRESTATAIRE));
    expect(res.status).toBe(201);
    expect(dbMocks.utilisateurCreate).toHaveBeenCalled();
  });

  it('PUT 409 si le nouvel e-mail d un compte PRESTATAIRE devient ambigu', async () => {
    dbMocks.utilisateurFindUnique.mockImplementation(
      async (args: { where: { id?: string; email?: string } }) => {
        if (args.where.id) {
          return { id: 'u-prest', email: 'ancien@presta.mg', nom: 'Clinique', role: 'PRESTATAIRE', actif: true };
        }
        return null; // unicité e-mail côté comptes : OK
      }
    );
    dbMocks.prestataireFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    dbMocks.utilisateurUpdate.mockResolvedValue({
      id: 'u-prest', email: 'groupe@presta.mg', nom: 'Clinique', role: 'PRESTATAIRE', actif: true,
      avatar: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await PUT(requetePut({ id: 'u-prest', email: 'groupe@presta.mg' }));
    expect(res.status).toBe(409);
    expect(dbMocks.utilisateurUpdate).not.toHaveBeenCalled();
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

  it('incident 2026-09 : enrichissement en erreur (migration non déployée) → liste renvoyée 200, badges null, JAMAIS de 500', async () => {
    // Reproduction : en production, le code référençait Societe.emailContactPrincipal
    // avant que la migration 20260916120000 ne soit appliquée → la requête SQL
    // « column does not exist » rejetait → 500 → « Aucun utilisateur trouvé »
    // pour TOUS les comptes. La liste doit survivre à l'échec du badge.
    dbMocks.utilisateurFindMany.mockResolvedValue([
      { id: 'u1', email: 'client@exemple.com', nom: 'Client', role: 'PORTAIL_CLIENT', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'u2', email: 'agent@exemple.com', nom: 'Agent', role: 'ACCUEIL', actif: true, avatar: null, dernierLogin: null, failedAttempts: 0, lockoutUntil: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    dbMocks.utilisateurCount.mockResolvedValue(2);
    dbMocks.assureFindMany.mockResolvedValue([]);
    dbMocks.contactFindMany.mockResolvedValue([]);
    dbMocks.societeFindMany.mockRejectedValue(
      new Error('La colonne « emailContactPrincipal » n\'existe pas dans « Societe ».')
    );

    const res = await GET(requeteGet());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.utilisateurs).toHaveLength(2);           // la liste survit
    expect(body.pagination.total).toBe(2);
    expect(body.utilisateurs[0].liaisonExterne).toBeNull(); // badge dégradé (inconnu)
    expect(body.utilisateurs[0].roleLabel).toBe('Portail Client');
  });
});

// ═══ Socle Gestion — pilier Audit : toute écriture sur les comptes est ═════
// tracée dans le journal (FON-002), avec l'auteur réel, jamais le mot de passe.
const UTILISATEUR_EXISTANT = {
  id: 'u-ex', email: 'agent@suivisante.mg', nom: 'Agent Test',
  role: 'ACCUEIL', actif: true, avatar: null, createdAt: new Date(),
};

function requetePatch(body: unknown): NextRequest {
  return new Request('http://localhost/api/utilisateurs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function requeteDelete(id: string): NextRequest {
  return new Request(`http://localhost/api/utilisateurs?id=${id}`, {
    method: 'DELETE',
  }) as unknown as NextRequest;
}

describe('Pilier Audit — /api/utilisateurs', () => {
  beforeEach(() => {
    auditMocks.logParametreChange.mockClear();
    auditMocks.getUserInfoFromRequest.mockResolvedValue({
      nom: 'Admin', id: 'u-admin', role: 'ADMINISTRATEUR',
    });
  });

  it('POST → audit CREATION avec auteur réel, sans mot de passe', async () => {
    dbMocks.assureFindFirst.mockResolvedValue({ id: 'assure-1' });

    await POST(requetePost(PAYLOAD_PORTAIL));

    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    const appel = auditMocks.logParametreChange.mock.calls[0][0];
    expect(appel).toMatchObject({
      entite: 'Utilisateur',
      entiteId: 'u1',
      champ: 'CREATION',
      modifiePar: 'Admin',
      modifieParId: 'u-admin',
      objet: 'client@exemple.com',
    });
    const journalise = JSON.stringify(appel);
    expect(journalise).not.toContain('motdepasse1');
    expect(journalise).not.toContain('$2a$12$hashed');
  });

  it('PATCH (désactivation) → audit champ actif true → false avec auteur réel', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue(UTILISATEUR_EXISTANT);
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: false });

    const res = await PATCH(requetePatch({ id: 'u-ex', actif: false }));
    expect(res.status).toBe(200);

    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Utilisateur',
        entiteId: 'u-ex',
        champ: 'actif',
        ancienneValeur: true,
        nouvelleValeur: false,
        modifiePar: 'Admin',
      })
    );
  });

  it('DELETE → audit SUPPRESSION avec l\'auteur RÉEL (plus jamais « SYSTEM »)', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue(UTILISATEUR_EXISTANT);

    await DELETE(requeteDelete('u-ex'));

    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entite: 'Utilisateur',
        champ: 'SUPPRESSION',
        modifiePar: 'Admin',
        modifieParId: 'u-admin',
        objet: 'agent@suivisante.mg',
      })
    );
    expect(auditMocks.logParametreChange.mock.calls[0][0].ancienneValeur).toContain('Agent Test');
  });

  it('PUT (changement de rôle + mot de passe) → audit par champ, mot de passe jamais journalisé', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue(UTILISATEUR_EXISTANT);
    dbMocks.utilisateurUpdate.mockResolvedValue({
      ...UTILISATEUR_EXISTANT, role: 'TECHNIQUE',
    });

    await PUT(requetePut({ id: 'u-ex', role: 'TECHNIQUE', password: 'nouveaumdp1' }));

    const champs = auditMocks.logParametreChange.mock.calls.map((c) => c[0]);
    expect(champs.map((a) => a.champ).sort()).toEqual(['password', 'role']);
    const role = champs.find((a) => a.champ === 'role');
    expect(role).toMatchObject({ ancienneValeur: 'ACCUEIL', nouvelleValeur: 'TECHNIQUE' });
    const pwd = champs.find((a) => a.champ === 'password');
    expect(pwd).toMatchObject({ ancienneValeur: '(hash existant)', nouvelleValeur: '(modifié)' });
    const tout = JSON.stringify(champs);
    expect(tout).not.toContain('nouveaumdp1');
    expect(tout).not.toContain('$2a$12$hashed');
  });
});

// ─── P1 « Révocation des sessions » — PATCH actif (travaux 3 et 5) ──────────
describe('P1 Révocation des sessions — PATCH /api/utilisateurs', () => {
  beforeEach(() => {
    auditMocks.logParametreChange.mockClear();
    auditMocks.getUserInfoFromRequest.mockResolvedValue({
      nom: 'Admin', id: 'u-admin', role: 'ADMINISTRATEUR',
    });
  });

  it('désactivation → sessionVersion incrémentée DANS la même transaction', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: true, sessionVersion: 1 });
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: false, sessionVersion: 2 });

    const res = await PATCH(requetePatch({ id: 'u-ex', actif: false }));

    expect(res.status).toBe(200);
    expect(dbMocks.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.utilisateurUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-ex' },
        data: { actif: false, sessionVersion: { increment: 1 } },
      })
    );
  });

  it('réactivation → incrément AUSSI (un jeton volé avant désactivation reste invalide)', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: false, sessionVersion: 2 });
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: true, sessionVersion: 3 });

    const res = await PATCH(requetePatch({ id: 'u-ex', actif: true }));

    expect(res.status).toBe(200);
    expect(dbMocks.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.utilisateurUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { actif: true, sessionVersion: { increment: 1 } },
      })
    );
  });

  it('PATCH sans changement de statut → PAS d incrément ni d audit de révocation', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: true, sessionVersion: 1 });
    dbMocks.utilisateurUpdate.mockResolvedValue(UTILISATEUR_EXISTANT);

    const res = await PATCH(requetePatch({ id: 'u-ex', actif: true }));

    expect(res.status).toBe(200);
    expect(dbMocks.$transaction).not.toHaveBeenCalled();
    expect(dbMocks.utilisateurUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { actif: true } })
    );
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('audit de désactivation : auteur réel + révocation tracée (version), AUCUN secret', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: true, sessionVersion: 1 });
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: false, sessionVersion: 2 });

    await PATCH(requetePatch({ id: 'u-ex', actif: false }));

    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    const appel = auditMocks.logParametreChange.mock.calls[0][0];
    expect(appel).toMatchObject({
      entite: 'Utilisateur',
      entiteId: 'u-ex',
      champ: 'actif',
      ancienneValeur: true,
      nouvelleValeur: false,
      modifiePar: 'Admin',
      modifieParId: 'u-admin',
    });
    const metadonnees = JSON.parse(appel.metadonnees);
    expect(metadonnees.sessionsRevoquees).toBe(true);
    expect(metadonnees.sessionVersion).toBe(2);
    const tout = JSON.stringify(appel);
    // Jamais de mot de passe, cookie ou jeton de session dans le journal :
    expect(tout).not.toContain('session-token');
    expect(tout).not.toContain('Bearer');
  });

  it('audit DE réactivation : traçée comme désactivation (critère journalisation)', async () => {
    dbMocks.utilisateurFindUnique.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: false, sessionVersion: 2 });
    dbMocks.utilisateurUpdate.mockResolvedValue({ ...UTILISATEUR_EXISTANT, actif: true, sessionVersion: 3 });

    await PATCH(requetePatch({ id: 'u-ex', actif: true }));

    expect(auditMocks.logParametreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        champ: 'actif',
        ancienneValeur: false,
        nouvelleValeur: true,
        modifiePar: 'Admin',
      })
    );
  });
});
