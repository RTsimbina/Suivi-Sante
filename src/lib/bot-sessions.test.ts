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
  dossierFindFirst: vi.fn(),
  messageBotCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    botSession: {
      findUnique: dbMocks.botSessionFindUnique,
      upsert: dbMocks.botSessionUpsert,
      deleteMany: dbMocks.botSessionDeleteMany,
    },
    assure: { findFirst: dbMocks.assureFindFirst },
    dossier: { findFirst: dbMocks.dossierFindFirst },
    messageBot: { create: dbMocks.messageBotCreate },
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
  dbMocks.botSessionDeleteMany.mockResolvedValue({ count: 0 });
  dbMocks.botSessionUpsert.mockResolvedValue({});
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
