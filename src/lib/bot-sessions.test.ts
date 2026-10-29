/**
 * Tests des sessions bot persistées en base (plan P3 Vague 1).
 * L'ancienne Map en mémoire du processus était perdue sur serverless
 * (instances multiples / redémarrages). Ces tests verrouillent le
 * comportement attendu : persistance, TTL 4h, purge, re-identification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  botSessionFindUnique: vi.fn(),
  botSessionUpsert: vi.fn(),
  botSessionDeleteMany: vi.fn(),
  assureFindFirst: vi.fn(),
  assureFindMany: vi.fn(),
  dossierFindFirst: vi.fn(),
  dossierFindMany: vi.fn(),
  messageBotCreate: vi.fn(),
  messageBotCount: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    botSession: {
      findUnique: dbMocks.botSessionFindUnique,
      upsert: dbMocks.botSessionUpsert,
      deleteMany: dbMocks.botSessionDeleteMany,
    },
    assure: { findFirst: dbMocks.assureFindFirst, findMany: dbMocks.assureFindMany },
    dossier: { findFirst: dbMocks.dossierFindFirst, findMany: dbMocks.dossierFindMany },
    messageBot: { create: dbMocks.messageBotCreate, count: dbMocks.messageBotCount },
  },
}));

vi.mock('./llm', () => ({
  callLLM: vi.fn().mockResolvedValue(null),
}));

vi.mock('./prestations', () => ({
  getPrestationLabel: (t: string) => t,
  getParentType: (t: string) => t,
}));

import { traiterMessageBot } from './bot-service';

const SESSION_VALIDE = {
  expeditieurId: '261340000001',
  canal: 'WHATSAPP',
  assureId: 'assure-1',
  assureNom: 'Rakoto Jean',
  societeId: 'soc-1',
  verifieA: new Date(Date.now() - 3600_000), // 1h
  expiresAt: new Date(Date.now() + 3 * 3600_000), // encore 3h
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.messageBotCreate.mockResolvedValue({});
  dbMocks.messageBotCount.mockResolvedValue(0);
  dbMocks.botSessionDeleteMany.mockResolvedValue({ count: 0 });
  dbMocks.botSessionUpsert.mockResolvedValue({});
  dbMocks.dossierFindMany.mockResolvedValue([]);
});

describe('sessions bot en base (plan P3)', () => {
  it('une session valide en base permet de consulter un dossier SANS re-vérification NSS', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue({ ...SESSION_VALIDE });
    dbMocks.dossierFindFirst.mockResolvedValue({
      numeroDossier: 'DOS-2026-000001',
      statut: 'PAYE',
      montantPaye: 25000,
      datePaiement: new Date('2026-06-15'),
      referencePaiement: 'REF-1',
      motifRejet: null,
    });

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000001',
      expeditieurNom: 'Jean',
      texte: '/dossier DOS-2026-000001',
    });

    expect(reponse).toContain('Dossier DOS-2026-000001');
    expect(reponse).toContain('Payé');
    // Session lue en base, PAS de re-résolution assuré, PAS de réécriture
    expect(dbMocks.botSessionFindUnique).toHaveBeenCalledWith({ where: { expeditieurId: '261340000001' } });
    expect(dbMocks.assureFindFirst).not.toHaveBeenCalled();
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
  });

  it('une session EXPIRÉE est supprimée puis l\'expéditeur doit se re-vérifier', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue({
      ...SESSION_VALIDE,
      verifieA: new Date(Date.now() - 5 * 3600_000),
      expiresAt: new Date(Date.now() - 3600_000), // expirée depuis 1h
    });

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000001',
      expeditieurNom: 'Jean',
      texte: '/dossier DOS-2026-000001',
    });

    expect(reponse).toContain('/verifier');
    expect(dbMocks.botSessionDeleteMany).toHaveBeenCalledWith({ where: { expeditieurId: '261340000001' } });
    expect(dbMocks.dossierFindFirst).not.toHaveBeenCalled();
  });

  it('une session ABSENTE en base (autre instance serverless) exige l\'identification', async () => {
    // Scénario clé du plan P3 : la requête tombe sur une nouvelle instance.
    // La session est cherchée en base partagée ; absente → tentative de
    // résolution par numéro de téléphone, puis sans succès → identification.
    dbMocks.botSessionFindUnique.mockResolvedValue(null);
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const reponse = await traiterMessageBot({
      canal: 'TELEGRAM',
      expeditieurId: 'chat-42',
      expeditieurNom: 'Jean',
      texte: '/mesdossiers',
    });

    expect(reponse).toContain('/verifier');
    // La session a bien été cherchée EN BASE d'abord (plus de Map en mémoire)
    expect(dbMocks.botSessionFindUnique).toHaveBeenCalledWith({ where: { expeditieurId: 'chat-42' } });
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
  });

  it('/verifier avec NSS valide PERSISTE la session en base via upsert (TTL 4h)', async () => {
    dbMocks.assureFindFirst.mockResolvedValue({
      id: 'assure-2',
      nom: 'Rabe',
      prenom: 'Marie',
      societeId: 'soc-2',
      actif: true,
      societe: { id: 'soc-2', nom: 'Société B' },
    });

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000002',
      expeditieurNom: 'Marie',
      texte: '/verifier 123456789',
    });

    expect(reponse).toContain('Identite confirmée');
    expect(dbMocks.botSessionUpsert).toHaveBeenCalledTimes(1);
    const appelUpsert = dbMocks.botSessionUpsert.mock.calls[0][0];
    expect(appelUpsert.where).toEqual({ expeditieurId: '261340000002' });
    expect(appelUpsert.create.canal).toBe('WHATSAPP');
    expect(appelUpsert.create.assureId).toBe('assure-2');
    expect(appelUpsert.create.assureNom).toBe('Marie Rabe');
    // TTL : expiresAt ≈ maintenant + 4h (tolérance 60s)
    const ttlMs = appelUpsert.create.expiresAt.getTime() - appelUpsert.create.verifieA.getTime();
    expect(ttlMs).toBe(4 * 60 * 60 * 1000);
    // Purge opportuniste déclenchée (fire-and-forget)
    expect(dbMocks.botSessionDeleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: expect.any(Date) } } });
  });

  it('/verifier avec NSS inconnu NE crée PAS de session', async () => {
    dbMocks.assureFindFirst.mockResolvedValue(null);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000003',
      expeditieurNom: 'X',
      texte: '/verifier 000000000',
    });

    expect(reponse).toContain('non reconnu');
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
  });

  // ─── F2 (audit Assistant IA) : identification téléphone sans ambiguïté ────

  it('F2 : un numéro UNIQUE correspondant par suffixe identifie l\'assuré et crée la session', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue(null);
    dbMocks.assureFindMany.mockResolvedValue([
      {
        id: 'assure-1', nom: 'Rakoto', prenom: 'Jean', telephone: '+261 34 12 345 67',
        societeId: 'soc-1', actif: true, societe: { id: 'soc-1', nom: 'Société A' },
      },
    ]);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261341234567',
      expeditieurNom: 'Jean',
      texte: '/mesdossiers',
    });

    // Session créée à partir de l'assuré trouvé
    expect(dbMocks.botSessionUpsert).toHaveBeenCalledTimes(1);
    expect(dbMocks.botSessionUpsert.mock.calls[0][0].create.assureId).toBe('assure-1');
    expect(reponse).toContain("vous n'avez aucun dossier");
  });

  it('F2 : deux assurés sur le même suffixe → refus fail-closed, AUCUN choix arbitraire', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue(null);
    dbMocks.assureFindMany.mockResolvedValue([
      {
        id: 'assure-1', nom: 'Rakoto', prenom: 'Jean', telephone: '0341234567',
        societeId: 'soc-1', actif: true, societe: { id: 'soc-1', nom: 'Société A' },
      },
      {
        id: 'assure-2', nom: 'Rabe', prenom: 'Marie', telephone: '+261341234567',
        societeId: 'soc-2', actif: true, societe: { id: 'soc-2', nom: 'Société B' },
      },
    ]);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261341234567',
      expeditieurNom: 'X',
      texte: '/mesdossiers',
    });

    // L'ancien code aurait choisi arbitrairement le premier (findFirst)
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
    expect(reponse).toContain('/verifier');
  });

  it('F2 : un identifiant de moins de 8 chiffres (chatId, senderId) ne touche même pas la base', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue(null);

    const reponse = await traiterMessageBot({
      canal: 'TELEGRAM',
      expeditieurId: 'chat-42',
      expeditieurNom: 'Jean',
      texte: '/mesdossiers',
    });

    expect(dbMocks.assureFindMany).not.toHaveBeenCalled();
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
    expect(reponse).toContain('/verifier');
  });

  it('F2 : une sous-chaîne contenue mais qui n\'est PAS un suffixe n\'identifie personne', async () => {
    dbMocks.botSessionFindUnique.mockResolvedValue(null);
    // L'ancien code (`contains` seul) aurait identifié cet assuré :
    // '0341234567' est CONTENU dans '034123456789' mais n'en est pas la fin.
    dbMocks.assureFindMany.mockResolvedValue([
      {
        id: 'assure-9', nom: 'Autre', prenom: 'Personne', telephone: '034123456789',
        societeId: 'soc-9', actif: true, societe: { id: 'soc-9', nom: 'Société 9' },
      },
    ]);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '0341234567',
      expeditieurNom: 'X',
      texte: '/mesdossiers',
    });

    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
    expect(reponse).toContain('/verifier');
  });

  // ─── F3 (audit Assistant IA) : rate limiting /verifier ───────────────────

  it('F3 : au-delà de 5 tentatives /verifier récentes, la suivante est refusée SANS interroger les assurés', async () => {
    dbMocks.messageBotCount.mockResolvedValue(5);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000099',
      expeditieurNom: 'X',
      texte: '/verifier 123456789',
    });

    // Réponse générique, aucun oracle sur la validité du NSS essayé
    expect(reponse).toContain('Trop de tentatives');
    expect(dbMocks.assureFindFirst).not.toHaveBeenCalled();
    expect(dbMocks.botSessionUpsert).not.toHaveBeenCalled();
  });

  it('F3 : sous le seuil, la vérification NSS reste possible', async () => {
    dbMocks.messageBotCount.mockResolvedValue(4);
    dbMocks.assureFindFirst.mockResolvedValue({
      id: 'assure-3',
      nom: 'Rasoa',
      prenom: 'Lala',
      societeId: 'soc-3',
      actif: true,
      societe: { id: 'soc-3', nom: 'Société C' },
    });

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: '261340000098',
      expeditieurNom: 'Lala',
      texte: '/verifier 555555555',
    });

    expect(reponse).toContain('Identite confirmée');
    expect(dbMocks.botSessionUpsert).toHaveBeenCalledTimes(1);
  });

  it('F3 : la fenêtre de comptage est expéditeur-scopée, /verifier (casse libre), bornée à 15 minutes', async () => {
    await traiterMessageBot({
      canal: 'TELEGRAM',
      expeditieurId: 'chat-9000',
      expeditieurNom: 'X',
      texte: '/verifier 111222333',
    });

    expect(dbMocks.messageBotCount).toHaveBeenCalledTimes(1);
    const appel = dbMocks.messageBotCount.mock.calls[0][0];
    expect(appel.where.expeditieurId).toBe('chat-9000');
    expect(appel.where.message).toEqual({ startsWith: '/verifier', mode: 'insensitive' });
    const gte = appel.where.createdAt.gte as Date;
    const ecartMs = Date.now() - gte.getTime();
    expect(ecartMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 2000);
    expect(ecartMs).toBeLessThanOrEqual(15 * 60 * 1000 + 2000);
  });

  it('la re-vérification NSS éCRASE l\'ancienne session (upsert, pas de doublon possible)', async () => {
    // La clé primaire est expeditieurId : un même expéditeur ne peut avoir
    // qu'une seule session, même après changement d'assuré.
    dbMocks.assureFindFirst.mockResolvedValue({
      id: 'assure-9',
      nom: 'Nouveau',
      prenom: null,
      societeId: 'soc-9',
      actif: true,
      societe: { id: 'soc-9', nom: 'Société 9' },
    });

    await traiterMessageBot({
      canal: 'MESSENGER',
      expeditieurId: 'sender-77',
      expeditieurNom: 'Nouveau',
      texte: '/verifier 987654321',
    });

    const appelUpsert = dbMocks.botSessionUpsert.mock.calls[0][0];
    expect(appelUpsert.create.canal).toBe('MESSENGER');
    expect(appelUpsert.create.assureId).toBe('assure-9');
    // update = même structure que create (re-vérification écrase le TTL)
    expect(appelUpsert.update.assureId).toBe('assure-9');
  });
});
