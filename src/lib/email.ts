import nodemailer from 'nodemailer';
import { db } from './db';
import { decrypt } from './crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  emailRapportDestinataire?: string | null;
}

// ─── Cache en mémoire (TTL 5 min) pour éviter de query la DB à chaque email ──

let _cachedConfig: SmtpConfig | null = null;
let _cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function invalidateCache() {
  _cachedConfig = null;
  _cacheExpiry = 0;
  _transporter = null;
}

// ─── Lecture de la configuration (DB d'abord, puis env vars) ─────────────────

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // 1. Vérifier le cache
  if (_cachedConfig && Date.now() < _cacheExpiry) {
    return _cachedConfig;
  }

  // 2. Essayer la base de données
  try {
    const config = await db.configurationEmail.findFirst({ where: { actif: true } });
    if (config) {
      const ENCRYPTION_KEY = process.env.SERVER_ENCRYPTION_KEY || '';
      _cachedConfig = {
        host: config.smtpHost,
        port: config.smtpPort,
        user: config.smtpUser,
        pass: decrypt(config.smtpPass, ENCRYPTION_KEY), // déchiffré
        from: config.smtpFrom,
        emailRapportDestinataire: config.emailRapportDestinataire,
      };
      _cacheExpiry = Date.now() + CACHE_TTL;
      return _cachedConfig;
    }
  } catch {
    // La table n'existe pas encore (premier déploiement) — on continue avec les env vars
  }

  // 3. Fallback sur les variables d'environnement
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    _cachedConfig = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'suivi-sante@exemple.mg',
      emailRapportDestinataire: process.env.EMAIL_RAPPORT_DESTINATAIRE || null,
    };
    _cacheExpiry = Date.now() + CACHE_TTL;
    return _cachedConfig;
  }

  return null;
}

// ─── Vérifie si SMTP est configuré ──────────────────────────────────────────

export function smtpEstConfigure(): boolean {
  // Check synchrone rapide sur les env vars (pour les cas où la DB n'est pas encore dispo)
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return true;
  // Si on a un cache valide, c'est configuré
  if (_cachedConfig) return true;
  // Sinon, on ne sait pas — la version async smtpEstConfigureAsync() est plus fiable
  return false;
}

/** Version async qui vérifie aussi la DB */
export async function smtpEstConfigureAsync(): Promise<boolean> {
  const config = await getSmtpConfig();
  return !!config;
}

/** Retourne la config SMTP (sans le mot de passe en clair) pour l'UI */
export async function getSmtpConfigForUI(): Promise<{
  configure: boolean;
  source: 'db' | 'env' | 'aucune';
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  emailRapportDestinataire?: string | null;
  actif?: boolean;
} | null> {
  try {
    const dbConfig = await db.configurationEmail.findFirst({
      where: { actif: true },
      select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true, emailRapportDestinataire: true, actif: true },
    });
    if (dbConfig) {
      return {
        configure: true,
        source: 'db',
        host: dbConfig.smtpHost,
        port: dbConfig.smtpPort,
        user: dbConfig.smtpUser,
        from: dbConfig.smtpFrom,
        emailRapportDestinataire: dbConfig.emailRapportDestinataire,
        actif: dbConfig.actif,
      };
    }
  } catch {
    // Table n'existe pas encore
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      configure: true,
      source: 'env',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      from: process.env.SMTP_FROM || 'suivi-sante@exemple.mg',
      emailRapportDestinataire: process.env.EMAIL_RAPPORT_DESTINATAIRE || null,
    };
  }

  return null;
}

// ─── Création paresseuse du transporter ─────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

/** Options TLS optimisées pour Microsoft 365, Gmail, et autres fournisseurs modernes */
function getTlsOptions(port: number) {
  if (port === 465) return { rejectUnauthorized: false };
  // Port 587 (STARTTLS) — compatible Microsoft 365
  return { rejectUnauthorized: false };
}

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (!_transporter) {
    const config = await getSmtpConfig();
    if (!config) throw new Error('SMTP non configure');
    _transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth: { user: config.user, pass: config.pass },
      tls: getTlsOptions(config.port),
    });
  }
  return _transporter;
}

// ─── Récupérer le destinataire des rapports ──────────────────────────────────

export async function getEmailRapportDestinataire(): Promise<string | null> {
  const config = await getSmtpConfig();
  return config?.emailRapportDestinataire || process.env.EMAIL_RAPPORT_DESTINATAIRE || null;
}

// ─── Interface EmailAttachment ───────────────────────────────────────────────

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

// ─── Envoi d'email ──────────────────────────────────────────────────────────

export async function envoyerEmail(opts: {
  destinataires: string[];
  sujet: string;
  texte: string;
  html?: string;
  attachments?: EmailAttachment[];
  /** Expéditeur personnalisé : "Nom Comptable <email@exemple.com>". Utilise smtpFrom par défaut. */
  fromPersonnalise?: string;
  /** Adresse de réponse (Reply-To) */
  replyTo?: string;
  /** Destinataire(s) en copie cachée (BCC) — ex: email admin pour copie des rapports */
  bcc?: string[];
}): Promise<void> {
  if (opts.destinataires.length === 0) return;

  const config = await getSmtpConfig();
  if (!config) {
    throw new Error('SMTP non configure — configurez-le depuis la page Configuration ou ajoutez les variables d\'environnement');
  }

  const transporter = await getTransporter();

  // Si un expéditeur personnalisé est fourni (ex: email d'un comptable),
  // on l'utilise comme FROM tout en gardant l'auth SMTP configuré.
  const from = opts.fromPersonnalise || config.from;

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to: opts.destinataires.join(', '),
    subject: opts.sujet,
    text: opts.texte,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'application/pdf',
    })),
  };

  // Ajouter BCC si fourni (copie admin des rapports)
  if (opts.bcc && opts.bcc.length > 0) {
    mailOptions.bcc = opts.bcc.join(', ');
  }

  // Ajouter Reply-To si fourni et différent du from
  if (opts.replyTo && opts.replyTo !== from) {
    mailOptions.replyTo = opts.replyTo;
  }

  await transporter.sendMail(mailOptions);
}

// ─── Vérification de la connexion SMTP ─────────────────────────────────────

export async function verifierSMTP(): Promise<{ ok: boolean; erreur?: string }> {
  const config = await getSmtpConfig();
  if (!config) {
    return {
      ok: false,
      erreur: 'SMTP non configure. Configurez-le depuis la page Configuration ou ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans .env.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth: { user: config.user, pass: config.pass },
      tls: getTlsOptions(config.port),
    });
    await transporter.verify();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: interpreterErreurSMTP(msg) };
  }
}

// ─── Interprétation intelligente des erreurs SMTP ────────────────────────────

/** Détecte le fournisseur et retourne un message d'aide en français */
export function interpreterErreurSMTP(rawMsg: string): string {
  const msg = rawMsg.toLowerCase();

  // Microsoft 365 / Outlook
  if (msg.includes('535') && (msg.includes('outlook') || msg.includes('office365') || msg.includes('microsoft') || msg.includes('namprd'))) {
    return [
      'Authentification Microsoft 365 échouée.',
      '',
      'Si votre compte a l\'authentification à 2 facteurs (MFA) activée, le mot de passe habituel ne fonctionnera pas.',
      'Vous devez créer un Mot de passe d\'application :',
      '  1. Allez sur https://myaccount.microsoft.com/security-info',
      '  2. Ajoutez une méthode "Mot de passe d\'application"',
      '  3. Copiez le mot de passe généré et collez-le dans le champ Mot de passe ci-dessus',
      '',
      'Assurez-vous aussi que :',
      '  - Hôte : smtp.office365.com',
      '  - Port : 587',
      '  - L\'authentification SMTP est activée dans l\'admin Microsoft 365',
    ].join('\n');
  }

  // Gmail
  if (msg.includes('535') && (msg.includes('gmail') || msg.includes('google'))) {
    return [
      'Authentification Gmail échouée.',
      '',
      'Pour Gmail, vous devez utiliser un Mot de passe d\'application :',
      '  1. Allez sur https://myaccount.google.com/security',
      '  2. Activez la validation en 2 étapes si ce n\'est pas fait',
      '  3. Créez un Mot de passe d\'application (catégorie \"Courrier\")',
      '  4. Utilisez ce mot de passe (16 caractères) dans le champ ci-dessus',
    ].join('\n');
  }

  // Erreur d'authentification générique (535)
  if (msg.includes('535') || msg.includes('invalid login') || msg.includes('authentication unsuccessful')) {
    return [
      'Authentification échouée : identifiants incorrects.',
      '',
      'Vérifiez votre nom d\'utilisateur et mot de passe.',
      'Si vous utilisez Microsoft 365 ou Gmail avec la double authentification,',
      'vous devez utiliser un Mot de passe d\'application (voir la documentation de votre fournisseur).',
    ].join('\n');
  }

  // Connexion refusée / timeout
  if (msg.includes('econnrefused') || msg.includes('connect etimedout')) {
    return [
      'Impossible de se connecter au serveur SMTP.',
      '',
      'Vérifiez :',
      '  - L\'hôte et le port sont corrects',
      '  - Le port 587 ou 465 est autorisé par votre pare-feu',
      '  - Pour Microsoft 365 : utilisez smtp.office365.com:587',
      '  - Pour Gmail : utilisez smtp.gmail.com:587',
    ].join('\n');
  }

  // Certificat SSL/TLS
  if (msg.includes('self signed certificate') || msg.includes('unable to verify')) {
    return 'Erreur de certificat SSL/TLS. Le serveur SMTP utilise un certificat auto-signé. Contactez votre administrateur réseau.';
  }

  // Erreur générique
  return `Erreur de connexion SMTP : ${rawMsg}`;
}

// ─── Export pour invalidate le cache après modification ─────────────────────

export { invalidateCache, getSmtpConfig };
