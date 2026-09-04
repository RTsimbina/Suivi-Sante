/**
 * Tests unitaires du service de messagerie centralisé.
 * Couvre : validation, anti-abus, templates (échappement), classification
 * des erreurs SMTP, backoff de retry, rate-limiting (DB mockée), file
 * d'attente (DB mockée) et la façade envoyerCourriel().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks de modules (hoistés) ──────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    courrielSortant: {
      count: dbMocks.count,
      create: dbMocks.create,
      update: dbMocks.update,
      updateMany: dbMocks.updateMany,
      findMany: dbMocks.findMany,
      findUnique: dbMocks.findUnique,
      deleteMany: dbMocks.deleteMany,
      groupBy: dbMocks.groupBy,
    },
    $queryRaw: dbMocks.queryRaw,
  },
}));

vi.mock('dns', () => {
  const promises = {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  };
  return { default: { promises }, promises };
});

vi.mock('../email', () => ({
  getTransporter: vi.fn(),
  getSmtpConfig: vi.fn(),
  verifierSMTP: vi.fn(),
  smtpEstConfigureAsync: vi.fn(),
  getEmailRapportDestinataire: vi.fn(),
  envoyerEmail: vi.fn(),
}));

vi.mock('./delivery', async (importOriginal) => ({
  // Mock partiel : on garde la VRAIE classerErreurSMTP, on mocke livrerMessage
  ...(await importOriginal<typeof import('./delivery')>()),
  livrerMessage: vi.fn(),
}));

// ─── Imports (après mocks) ───────────────────────────────────────────────────

import dns from 'dns';
import {
  validerAdresse, normaliserDestinataire, detecterInjectionEnTete,
  verifierDomaineLivraison, viderCacheMX,
} from './validate';
import {
  controlerMessage, controlerExpediteur, viderCacheListes, DOMAINES_JETABLES,
} from './anti-abuse';
import {
  echapperHTML, htmlVersTexte, templateReinitialisationMdp, templateNotification,
  templateTest, avecPrefixeSujet,
} from './templates';
import { classerErreurSMTP, livrerMessage } from './delivery';
import { calculerProchaineTentative, DELAIS_RETRY_S, traiterFile } from './queue';
import { verifierQuotas, plafondParDestinataire, plafondGlobal } from './rate-limit';
import { envoyerCourriel } from './index';

const dnsMx = vi.mocked(dns.promises.resolveMx);
const dnsA4 = vi.mocked(dns.promises.resolve4);

// ═════════════════════════════════════════════════════════════════════════════
// 1. VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('validate — validerAdresse', () => {
  it('accepte une adresse valide et normalise (trim + minuscules)', () => {
    const r = validerAdresse('  Jean.DUPONT@Exemple.Com ');
    expect(r.valide).toBe(true);
    expect(r.normalisee).toBe('jean.dupont@exemple.com');
  });

  it('refuse les adresses sans @, sans domaine, sans TLD', () => {
    for (const mauvaise of ['sansat', 'a@', '@exemple.com', 'a@exemple', 'a@exemple.']) {
      expect(validerAdresse(mauvaise).valide).toBe(false);
    }
  });

  it('refuse les adresses trop longues (254 / locale 64)', () => {
    const longue = 'a'.repeat(240) + '@exemple.com';
    expect(validerAdresse(longue).permanent).toBe(true);
    const localeLongue = 'a'.repeat(65) + '@exemple.com';
    expect(validerAdresse(localeLongue).valide).toBe(false);
  });

  it('refuse les injections d’en-têtes (CRLF / Bcc)', () => {
    expect(detecterInjectionEnTete('a@exemple.com\r\nBcc: v@ictime.com')).toBe(true);
    expect(detecterInjectionEnTete('a@exemple.com\n')).toBe(true);
    expect(validerAdresse('a@exemple.com\r\nBcc: x@y.z').valide).toBe(false);
  });

  it('refuse un type non-string et une adresse vide', () => {
    expect(validerAdresse(undefined).valide).toBe(false);
    expect(validerAdresse(42 as unknown as string).valide).toBe(false);
    expect(validerAdresse('   ').valide).toBe(false);
  });
});

describe('validate — normaliserDestinataire (anti-contournement)', () => {
  it('Gmail : supprime les points et coupe le +tag', () => {
    expect(normaliserDestinataire('Jean.Dupont+x1@Gmail.com')).toBe('jeandupont@gmail.com');
  });

  it('hors Gmail : coupe le +tag mais garde les points', () => {
    expect(normaliserDestinataire('jean.dupont+x9@exemple.com')).toBe('jean.dupont@exemple.com');
  });
});

describe('validate — verifierDomaineLivraison (DNS/MX)', () => {
  beforeEach(() => {
    viderCacheMX();
    vi.clearAllMocks();
  });

  it('MX publié → livrable, trié par priorité', async () => {
    dnsMx.mockResolvedValueOnce([
      { exchange: 'mx2.exemple.com', priority: 20 },
      { exchange: 'mx1.exemple.com', priority: 10 },
    ]);
    const r = await verifierDomaineLivraison('exemple.com');
    expect(r.livrable).toBe(true);
    expect(r.mx).toEqual(['mx1.exemple.com', 'mx2.exemple.com']);
  });

  it('domaine inexistant (ENOTFOUND) → non livrable, permanent', async () => {
    dnsMx.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
    const r = await verifierDomaineLivraison('inconnu.tld');
    expect(r.livrable).toBe(false);
    expect(r.temporaire).toBeFalsy();
  });

  it('DNS indisponible (ETIMEDOUT) → non livrable mais TEMPORAIRE', async () => {
    dnsMx.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    const r = await verifierDomaineLivraison('lent.tld');
    expect(r.livrable).toBe(false);
    expect(r.temporaire).toBe(true);
  });

  it('cache : la seconde requête ne reconsulte pas le DNS', async () => {
    dnsMx.mockResolvedValue([{ exchange: 'mx.exemple.com', priority: 10 }]);
    await verifierDomaineLivraison('cache.exemple.com');
    await verifierDomaineLivraison('cache.exemple.com');
    expect(dnsMx).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ANTI-ABUS
// ═════════════════════════════════════════════════════════════════════════════

describe('anti-abuse — controlerMessage', () => {
  beforeEach(viderCacheListes);
  afterEach(() => {
    delete process.env.MAIL_MAX_RECIPIENTS;
    delete process.env.MAIL_MAX_BODY_KB;
    delete process.env.MAIL_BLOCKED_DOMAINS;
    delete process.env.MAIL_ALLOWED_DOMAINS;
  });

  const base = { destinataires: ['a@exemple.com'], sujet: 'S', texte: 'corps' };

  it('refuse un message sans destinataire', () => {
    expect(controlerMessage({ ...base, destinataires: [] }).autorise).toBe(false);
  });

  it('refuse au-delà du plafond de destinataires par message', () => {
    process.env.MAIL_MAX_RECIPIENTS = '2';
    viderCacheListes();
    const r = controlerMessage({ ...base, destinataires: ['a@x.co', 'b@x.co', 'c@x.co'] });
    expect(r.autorise).toBe(false);
    expect(r.motif).toContain('Trop de destinataires');
  });

  it('bloque les domaines jetables (mailinator, yopmail…)', () => {
    expect(DOMAINES_JETABLES.size).toBeGreaterThan(20);
    const r = controlerMessage({ ...base, destinataires: ['spam@mailinator.com'] });
    expect(r.autorise).toBe(false);
    expect(r.permanent).toBe(true);
  });

  it('applique MAIL_BLOCKED_DOMAINS (liste noire personnalisée)', () => {
    process.env.MAIL_BLOCKED_DOMAINS = 'perdu.tld';
    viderCacheListes();
    expect(controlerMessage({ ...base, destinataires: ['x@perdu.tld'] }).autorise).toBe(false);
    expect(controlerMessage({ ...base }).autorise).toBe(true);
  });

  it('applique MAIL_ALLOWED_DOMAINS (liste blanche stricte)', () => {
    process.env.MAIL_ALLOWED_DOMAINS = 'partenaire.tld';
    viderCacheListes();
    expect(controlerMessage({ ...base, destinataires: ['x@partenaire.tld'] }).autorise).toBe(true);
    expect(controlerMessage({ ...base }).autorise).toBe(false);
  });

  it('refuse un corps trop volumineux', () => {
    process.env.MAIL_MAX_BODY_KB = '1';
    viderCacheListes();
    const r = controlerMessage({ ...base, texte: 'x'.repeat(2048) });
    expect(r.autorise).toBe(false);
  });

  it('refuse trop de pièces jointes', () => {
    const pj = Array.from({ length: 6 }, (_, i) => ({ nom: `f${i}.pdf`, contenuBase64: 'AAAA' }));
    const r = controlerMessage({ ...base, piecesJointes: pj });
    expect(r.autorise).toBe(false);
  });
});

describe('anti-abuse — controlerExpediteur', () => {
  it('accepte "Nom <adresse@domaine.tld>" et une adresse simple', () => {
    expect(controlerExpediteur('Comptabilité <compta@exemple.com>').autorise).toBe(true);
    expect(controlerExpediteur('compta@exemple.com').autorise).toBe(true);
  });

  it('refuse un format chevrons malformé et une adresse invalide', () => {
    expect(controlerExpediteur('<incomplet@').autorise).toBe(false);
    expect(controlerExpediteur('Pas Une Adresse').autorise).toBe(false);
  });

  it('refuse un Reply-To invalide', () => {
    expect(controlerExpediteur(undefined, 'bad-mail').autorise).toBe(false);
    expect(controlerExpediteur(undefined, 'ok@exemple.com').autorise).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. GÉNÉRATION DU MESSAGE (templates + échappement)
// ═════════════════════════════════════════════════════════════════════════════

describe('templates — échappement et génération', () => {
  afterEach(() => { delete process.env.MAIL_SUBJECT_PREFIX; });

  it('echapperHTML neutralise les caractères dangereux', () => {
    expect(echapperHTML('<script>&"\'</script>')).toBe('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
  });

  it('reinitialisation-mdp : le nom malveillant est échappé dans le HTML', () => {
    const c = templateReinitialisationMdp({
      nom: '<img src=x onerror=alert(1)>',
      lien: 'https://app.exemple.com/reset-password?token=abc',
      minutes: 30,
    });
    expect(c.html).not.toContain('<img src=x');
    expect(c.html).toContain('&lt;img src=x');
    expect(c.html).toContain('https://app.exemple.com/reset-password?token=abc');
    expect(c.texte).toContain('valide 30 minutes');
  });

  it('un lien non-HTTP est neutralisé (bouton sans href arbitraire)', () => {
    const c = templateNotification({
      titre: 'T',
      lignes: [],
      action: { lien: 'javascript:alert(1)', libelle: 'Go' },
    });
    expect(c.html).not.toContain('href="javascript:');
    expect(c.html).toContain('href="#"');
  });

  it('notification : libellés et valeurs échappés', () => {
    const c = templateNotification({
      titre: 'Rappel <urgent>',
      lignes: [{ libelle: 'Dossier', valeur: 'DOSS-<1>' }],
    });
    expect(c.html).toContain('Rappel &lt;urgent&gt;');
    expect(c.html).toContain('DOSS-&lt;1&gt;');
  });

  it('avecPrefixeSujet ajoute [Préfixe] sans doubler', () => {
    process.env.MAIL_SUBJECT_PREFIX = 'Suivi Santé';
    expect(avecPrefixeSujet('Bonjour')).toBe('[Suivi Santé] Bonjour');
    expect(avecPrefixeSujet('[Suivi Santé] Bonjour')).toBe('[Suivi Santé] Bonjour');
    // Le template fournit le sujet brut ; le préfixe est appliqué par la façade
    expect(templateTest({}).sujet).toBe('E-mail de test — Suivi Santé');
    expect(avecPrefixeSujet(templateTest({}).sujet)).toBe('[Suivi Santé] E-mail de test — Suivi Santé');
  });

  it('htmlVersTexte convertit un HTML simple', () => {
    expect(htmlVersTexte('<p>Bonjour</p><p>Monde</p>')).toBe('Bonjour\nMonde');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. MOTEUR DE LIVRAISON — classification des erreurs
// ═════════════════════════════════════════════════════════════════════════════

describe('delivery — classerErreurSMTP', () => {
  it('4xx = temporaire (grislisting, indisponibilité)', () => {
    expect(classerErreurSMTP('421 4.3.0 Service not available').temporaire).toBe(true);
    expect(classerErreurSMTP('450 4.1.2 greylisted, try again').temporaire).toBe(true);
  });

  it('5xx avec code étendu = permanent', () => {
    expect(classerErreurSMTP('550 5.1.1 The email account you tried does not exist').temporaire).toBe(false);
    expect(classerErreurSMTP('553 5.7.1 relay denied').temporaire).toBe(false);
  });

  it('552 (boîte pleine) = temporaire malgré le 5xx', () => {
    expect(classerErreurSMTP('552 5.2.2 Mailbox full').temporaire).toBe(true);
  });

  it('échec d’authentification = permanent', () => {
    expect(classerErreurSMTP('Invalid login: 535 5.7.8 Username and Password not accepted').temporaire).toBe(false);
  });

  it('codes réseau Node = temporaire, PORTS exclus du matching de code', () => {
    // Le port 587/465 ne doit PAS être pris pour un code SMTP 5xx/4xx
    expect(classerErreurSMTP('connect ECONNREFUSED 127.0.0.1:587').temporaire).toBe(true);
    expect(classerErreurSMTP('connect ETIMEDOUT smtp.gmail.com:465').temporaire).toBe(true);
    expect(classerErreurSMTP('TLS handshake failed').temporaire).toBe(true);
  });

  it('erreur inconnue = temporaire par défaut (retries bornés)', () => {
    expect(classerErreurSMTP('erreur exotique sans code').temporaire).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. FILE D'ATTENTE — backoff et traitement
// ═════════════════════════════════════════════════════════════════════════════

describe('queue — calculerProchaineTentative (backoff exponentiel)', () => {
  const base = new Date('2026-09-04T08:00:00Z');

  it('suit la table de délais : 1 min, 5 min, 30 min, 2 h, 6 h', () => {
    expect(DELAIS_RETRY_S).toEqual([60, 300, 1800, 7200, 21600]);
    for (let tentatives = 1; tentatives <= 5; tentatives++) {
      const attendu = new Date(base.getTime() + DELAIS_RETRY_S[tentatives - 1] * 1000);
      expect(calculerProchaineTentative(tentatives, base)).toEqual(attendu);
    }
  });

  it('au-delà du maximum de tentatives → null (échec définitif)', () => {
    expect(calculerProchaineTentative(0, base)).toBeNull();
    expect(calculerProchaineTentative(6, base)).toBeNull();
  });
});

describe('queue — traiterFile (DB et livraison mockées)', () => {
  const lmMock = vi.mocked(livrerMessage);
  const messageEnFile = {
    id: 'msg-1',
    destinataires: { to: ['a@exemple.com'] },
    sujet: 'Test',
    texte: 'corps',
    html: null,
    piecesJointes: null,
    fromPersonnalise: null,
    replyTo: null,
    tentatives: 0,
    maxTentatives: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.queryRaw.mockResolvedValue([{ id: 'msg-1' }]);
    dbMocks.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.findMany.mockResolvedValue([messageEnFile]);
    dbMocks.update.mockResolvedValue({});
  });

  it('succès SMTP → statut ENVOYE + messageId + date', async () => {
    lmMock.mockResolvedValueOnce({ ok: true, messageId: '<abc@relay>' });
    const r = await traiterFile({ limite: 1 });
    expect(r.envoyes).toBe(1);
    expect(dbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ statut: 'ENVOYE', messageId: '<abc@relay>' }),
      })
    );
  });

  it('erreur temporaire → remis en file avec backoff programmé', async () => {
    lmMock.mockResolvedValueOnce({ ok: false, temporaire: true, erreur: '421 busy' });
    const r = await traiterFile({ limite: 1 });
    expect(r.retriesProgrammes).toBe(1);
    expect(dbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: 'EN_ATTENTE', tentatives: 1, prochaineTentative: expect.any(Date) }),
      })
    );
  });

  it('erreur permanente → ECHEC sans retry', async () => {
    lmMock.mockResolvedValueOnce({ ok: false, temporaire: false, erreur: '550 5.1.1 user unknown' });
    const r = await traiterFile({ limite: 1 });
    expect(r.echecsDefinitifs).toBe(1);
    expect(dbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: 'ECHEC', tentatives: 1 }),
      })
    );
  });

  it('max retries atteint → ECHEC définitif', async () => {
    lmMock.mockResolvedValueOnce({ ok: false, temporaire: true, erreur: '421 busy' });
    dbMocks.findMany.mockResolvedValue([{ ...messageEnFile, tentatives: 5 }]);
    const r = await traiterFile({ limite: 1 });
    expect(r.echecsDefinitifs).toBe(1);
    expect(dbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: 'ECHEC', prochaineTentative: null }),
      })
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. RATE LIMITING (DB mockée)
// ═════════════════════════════════════════════════════════════════════════════

describe('rate-limit — verifierQuotas', () => {
  afterEach(() => {
    delete process.env.MAIL_MAX_PER_RECIPIENT_HOUR;
    delete process.env.MAIL_MAX_GLOBAL_HOUR;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAIL_MAX_PER_RECIPIENT_HOUR = '5';
    process.env.MAIL_MAX_GLOBAL_HOUR = '10';
  });

  it('sous les plafonds → autorisé', async () => {
    dbMocks.count.mockResolvedValue(0);
    const r = await verifierQuotas(['a@exemple.com']);
    expect(r.autorise).toBe(true);
  });

  it('plafond global atteint → refusé avec délai de réessai', async () => {
    dbMocks.count.mockResolvedValueOnce(10); // 1er appel = comptage global
    const r = await verifierQuotas(['a@exemple.com']);
    expect(r.autorise).toBe(false);
    expect(r.reessayerDans).toBeGreaterThan(0);
  });

  it('plafond par destinataire atteint (comptage normalisé) → refusé', async () => {
    dbMocks.count
      .mockResolvedValueOnce(0)  // global
      .mockResolvedValueOnce(5); // destinataire
    const r = await verifierQuotas(['a@exemple.com']);
    expect(r.autorise).toBe(false);
    expect(r.motif).toContain('a@exemple.com');
  });

  it('les plafonds restent lisibles via les helpers', () => {
    expect(plafondParDestinataire()).toBe(5);
    expect(plafondGlobal()).toBe(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. FAÇADE envoyerCourriel — chaîne complète (mocks)
// ═════════════════════════════════════════════════════════════════════════════

describe('facade — envoyerCourriel (chaîne validation → anti-abus → quota → file)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viderCacheListes();
    viderCacheMX();
    dbMocks.count.mockResolvedValue(0);
    dnsMx.mockResolvedValue([{ exchange: 'mx.exemple.com', priority: 10 }]);
  });

  afterEach(() => {
    delete process.env.MAIL_MX_CHECK;
    delete process.env.MAIL_BLOCKED_DOMAINS;
  });

  const demandeValide = {
    destinataires: ['dest@exemple.com'],
    sujet: 'Bonjour',
    texte: 'Contenu du message.',
  };

  it('envoi valide → mis en file (EN_ATTENTE) avec sujet préfixé', async () => {
    dbMocks.create.mockResolvedValueOnce({ id: 'cuid-1' });
    const r = await envoyerCourriel(demandeValide);
    expect(r.accepte).toBe(true);
    expect(r.code).toBe('OK');
    expect(r.envoi?.statut).toBe('EN_ATTENTE');
    const data = dbMocks.create.mock.calls[0][0].data;
    expect(data.sujet).toContain('Bonjour');
    expect(data.destinatairePrincipal).toBe('dest@exemple.com');
  });

  it('adresse malformée → INVALIDE, rien n’est inséré', async () => {
    const r = await envoyerCourriel({ ...demandeValide, destinataires: ['pas-un-mail'] });
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('INVALIDE');
    expect(dbMocks.create).not.toHaveBeenCalled();
  });

  it('injection d’en-têtes dans le sujet → REJETE', async () => {
    const r = await envoyerCourriel({ ...demandeValide, sujet: 'Sujet\r\nBcc: v@ictime.com' });
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('REJETE');
  });

  it('domaine jetable → REJETE', async () => {
    const r = await envoyerCourriel({ ...demandeValide, destinataires: ['x@mailinator.com'] });
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('REJETE');
  });

  it('quota atteint → QUOTA', async () => {
    dbMocks.count.mockResolvedValueOnce(999); // comptage global saturé
    const r = await envoyerCourriel(demandeValide);
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('QUOTA');
  });

  it('domaine sans MX (ENOTFOUND) → REJETE à l’admission', async () => {
    dnsMx.mockRejectedValueOnce(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }));
    const r = await envoyerCourriel(demandeValide);
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('REJETE');
  });

  it('DNS momentanément indisponible → ACCEPTÉ (le moteur retentera)', async () => {
    dnsMx.mockRejectedValueOnce(Object.assign(new Error('t/o'), { code: 'ETIMEDOUT' }));
    dbMocks.create.mockResolvedValueOnce({ id: 'cuid-2' });
    const r = await envoyerCourriel(demandeValide);
    expect(r.accepte).toBe(true);
  });

  it('template "test" → contenu généré, sans sujet/texte obligatoires', async () => {
    dbMocks.create.mockResolvedValueOnce({ id: 'cuid-3' });
    const r = await envoyerCourriel({
      destinataires: ['admin@exemple.com'],
      template: 'test',
      donnees: { nomExpediteur: 'L’admin' },
    });
    expect(r.accepte).toBe(true);
    const data = dbMocks.create.mock.calls[0][0].data;
    expect(data.texte).toContain('e-mail de test');
    expect(data.html).toContain('E-mail de test');
  });

  it('template sans contenu ni template ni corps → INVALIDE', async () => {
    const r = await envoyerCourriel({ destinataires: ['a@exemple.com'] });
    expect(r.accepte).toBe(false);
    expect(r.code).toBe('INVALIDE');
  });
});
