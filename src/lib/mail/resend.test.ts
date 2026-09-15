/**
 * Tests unitaires du transport Resend (API HTTPS native).
 * Couvre : sélection du fournisseur (fournisseurActif), classification des
 * erreurs Resend (temporaire vs permanente), envoi via le SDK mocké,
 * interprétation des erreurs et vérification de la clé/domaines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock du SDK officiel `resend` (hoisté) ──────────────────────────────────

const sdkMocks = vi.hoisted(() => ({
  send: vi.fn(),
  list: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sdkMocks.send };
    domains = { list: sdkMocks.list };
    constructor(_cle?: string) {
      void _cle;
    }
  },
}));

import {
  transportDemande,
  fournisseurActif,
  classerErreurResend,
  interpreterErreurResend,
  envoyerViaResend,
  verifierResend,
} from './resend';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CLE_ORIGINE = process.env.RESEND_API_KEY;
const TRANSPORT_ORIGINE = process.env.MAIL_TRANSPORT;

function messageBase() {
  return {
    id: 'courriel-1',
    from: 'noreply@suivisante.mg',
    destinataires: { to: ['client@exemple.mg'] },
    sujet: 'Test',
    texte: 'Bonjour',
    html: '<p>Bonjour</p>',
  };
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_TRANSPORT;
  sdkMocks.send.mockReset();
  sdkMocks.list.mockReset();
});

afterEach(() => {
  if (CLE_ORIGINE === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = CLE_ORIGINE;
  if (TRANSPORT_ORIGINE === undefined) delete process.env.MAIL_TRANSPORT;
  else process.env.MAIL_TRANSPORT = TRANSPORT_ORIGINE;
});

// ─── Sélection du fournisseur ────────────────────────────────────────────────

describe('transportDemande', () => {
  it('défaut auto, valeurs inconnues → auto', () => {
    expect(transportDemande()).toBe('auto');
    process.env.MAIL_TRANSPORT = 'RESSEND'; // faute de frappe → auto
    expect(transportDemande()).toBe('auto');
  });

  it('accepte resend et smtp (insensible à la casse)', () => {
    process.env.MAIL_TRANSPORT = 'Resend';
    expect(transportDemande()).toBe('resend');
    process.env.MAIL_TRANSPORT = 'SMTP';
    expect(transportDemande()).toBe('smtp');
  });
});

describe('fournisseurActif', () => {
  it('auto sans clé → SMTP (comportement historique conservé)', () => {
    expect(fournisseurActif()).toBe('smtp');
  });

  it('auto avec clé RESEND_API_KEY → Resend (voie par défaut)', () => {
    process.env.RESEND_API_KEY = 're_test';
    expect(fournisseurActif()).toBe('resend');
  });

  it('forçage smtp gagne même avec une clé Resend', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_TRANSPORT = 'smtp';
    expect(fournisseurActif()).toBe('smtp');
  });

  it('forçage resend sans clé reste sur Resend (erreur claire à l\u2019envoi)', () => {
    process.env.MAIL_TRANSPORT = 'resend';
    expect(fournisseurActif()).toBe('resend');
  });
});

// ─── Classification des erreurs ──────────────────────────────────────────────

describe('classerErreurResend', () => {
  it('erreurs de quota / débit → temporaires (la file retente)', () => {
    expect(classerErreurResend('rate_limit_exceeded : Too many requests').temporaire).toBe(true);
    expect(classerErreurResend('daily_quota_exceeded').temporaire).toBe(true);
    expect(classerErreurResend('monthly_quota_exceeded').temporaire).toBe(true);
    expect(classerErreurResend('429 Too Many Requests').temporaire).toBe(true);
  });

  it('pannes serveur et réseau → temporaires', () => {
    expect(classerErreurResend('internal_server_error').temporaire).toBe(true);
    expect(classerErreurResend('application_error').temporaire).toBe(true);
    expect(classerErreurResend('fetch failed').temporaire).toBe(true);
    expect(classerErreurResend('getaddrinfo ENOTFOUND api.resend.com').temporaire).toBe(true);
  });

  it('clé invalide / restreinte → permanentes (retenter ne changerait rien)', () => {
    expect(classerErreurResend('invalid_api_key').temporaire).toBe(false);
    expect(classerErreurResend('restricted_api_key').temporaire).toBe(false);
    expect(classerErreurResend('401 Unauthorized').temporaire).toBe(false);
  });

  it('requête invalide (validation, expéditeur, pièce jointe) → permanentes', () => {
    expect(classerErreurResend('validation_error : Invalid to field').temporaire).toBe(false);
    expect(classerErreurResend('invalid_from_address').temporaire).toBe(false);
    expect(classerErreurResend('invalid_attachment').temporaire).toBe(false);
    expect(classerErreurResend('403 domain not verified').temporaire).toBe(false);
  });

  it('erreur inconnue → temporaire par défaut (retries bornés)', () => {
    expect(classerErreurResend('panne cosmique inexpliquée').temporaire).toBe(true);
    expect(classerErreurResend('').temporaire).toBe(true);
  });
});

describe('interpreterErreurResend', () => {
  it('traduit les erreurs courantes en messages actionnables', () => {
    expect(interpreterErreurResend('invalid_api_key')).toContain('RESEND_API_KEY');
    expect(interpreterErreurResend('invalid_from_address')).toContain('vérifié');
    expect(interpreterErreurResend('daily_quota_exceeded')).toContain('100');
    expect(interpreterErreurResend('rate_limit_exceeded')).toContain('backoff');
  });

  it('garde le message brut pour les cas non reconnus', () => {
    expect(interpreterErreurResend('cas bizarre')).toContain('cas bizarre');
  });
});

// ─── Envoi via l'API (SDK mocké) ─────────────────────────────────────────────

describe('envoyerViaResend', () => {
  it('sans clé : erreur temporaire, message conservé en file, SDK jamais appelé', async () => {
    const r = await envoyerViaResend(messageBase());
    expect(r.ok).toBe(false);
    expect(r.temporaire).toBe(true);
    expect(r.erreur).toContain('RESEND_API_KEY');
    expect(sdkMocks.send).not.toHaveBeenCalled();
  });

  it('succès : ok + messageId Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.send.mockResolvedValueOnce({ data: { id: 'uuid-resend-123' }, error: null });
    const r = await envoyerViaResend(messageBase());
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe('uuid-resend-123');
    expect(sdkMocks.send).toHaveBeenCalledTimes(1);
    const payload = sdkMocks.send.mock.calls[0][0];
    expect(payload.from).toBe('noreply@suivisante.mg');
    expect(payload.to).toEqual(['client@exemple.mg']);
    expect(payload.subject).toBe('Test');
  });

  it('transmet cc/bcc/replyTo/pièces jointes base64', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.send.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
    await envoyerViaResend({
      ...messageBase(),
      destinataires: { to: ['a@b.mg'], cc: ['c@d.mg'], bcc: ['e@f.mg'] },
      replyTo: 'support@suivisante.mg',
      piecesJointes: [{ nom: 'rapport.pdf', contenuBase64: 'JVBERi0=', contentType: 'application/pdf' }],
    });
    const payload = sdkMocks.send.mock.calls[0][0];
    expect(payload.cc).toEqual(['c@d.mg']);
    expect(payload.bcc).toEqual(['e@f.mg']);
    expect(payload.replyTo).toBe('support@suivisante.mg');
    expect(payload.attachments).toEqual([
      { filename: 'rapport.pdf', content: 'JVBERi0=', contentType: 'application/pdf' },
    ]);
  });

  it('erreur 429 rate limit → temporaire avec message interprété', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.send.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });
    const r = await envoyerViaResend(messageBase());
    expect(r.ok).toBe(false);
    expect(r.temporaire).toBe(true);
    expect(r.erreur).toContain('débit');
  });

  it('erreur 403 domaine non vérifié → permanente', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.send.mockResolvedValueOnce({
      data: null,
      error: { name: 'invalid_from_address', message: 'domain not verified' },
    });
    const r = await envoyerViaResend(messageBase());
    expect(r.ok).toBe(false);
    expect(r.temporaire).toBe(false);
  });

  it('exception réseau levée par le SDK → temporaire', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.send.mockRejectedValueOnce(new Error('fetch failed'));
    const r = await envoyerViaResend(messageBase());
    expect(r.ok).toBe(false);
    expect(r.temporaire).toBe(true);
  });
});

// ─── Vérification de la configuration ────────────────────────────────────────

describe('verifierResend', () => {
  it('sans clé : échec avec consigne claire', async () => {
    const r = await verifierResend();
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('RESEND_API_KEY');
  });

  it('clé valide + domaine vérifié : ok + domaineVerifie', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.list.mockResolvedValueOnce({
      data: {
        data: [
          { name: 'mail.suivisante.mg', status: 'verified' },
          { name: 'autre.mg', status: 'pending' },
        ],
      },
      error: null,
    });
    const r = await verifierResend();
    expect(r.ok).toBe(true);
    expect(r.domaineVerifie).toBe('mail.suivisante.mg');
    expect(r.avertissement).toBeUndefined();
    expect(r.domaines).toHaveLength(2);
  });

  it('clé valide mais aucun domaine : ok avec avertissement mode test', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.list.mockResolvedValueOnce({ data: { data: [] }, error: null });
    const r = await verifierResend();
    expect(r.ok).toBe(true);
    expect(r.domaineVerifie).toBeUndefined();
    expect(r.avertissement).toContain('mode test');
  });

  it('clé valide mais domaines non vérifiés : ok avec avertissement DNS', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.list.mockResolvedValueOnce({
      data: { data: [{ name: 'mail.suivisante.mg', status: 'pending' }] },
      error: null,
    });
    const r = await verifierResend();
    expect(r.ok).toBe(true);
    expect(r.avertissement).toContain('Verify');
  });

  it('erreur API (clé invalide) : échec avec message interprété', async () => {
    process.env.RESEND_API_KEY = 're_test';
    sdkMocks.list.mockResolvedValueOnce({
      data: null,
      error: { name: 'invalid_api_key', message: 'Invalid API key' },
    });
    const r = await verifierResend();
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('RESEND_API_KEY');
  });

  it('exception réseau : échec sans fuite de clé', async () => {
    process.env.RESEND_API_KEY = 're_secret';
    sdkMocks.list.mockRejectedValueOnce(new Error('fetch failed'));
    const r = await verifierResend();
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("API Resend");
    expect(JSON.stringify(r)).not.toContain('re_secret');
  });
});
