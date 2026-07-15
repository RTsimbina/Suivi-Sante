import nodemailer from 'nodemailer';

// ─── Vérifie si SMTP est configuré ──────────────────────────────────────────
export function smtpEstConfigure(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

// ─── Création paresseuse du transporter (uniquement quand SMTP est configuré) ─
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }
  return _transporter;
}

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function envoyerEmail(opts: {
  destinataires: string[];
  sujet: string;
  texte: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (opts.destinataires.length === 0) return;

  if (!smtpEstConfigure()) {
    throw new Error('SMTP non configure — ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans les variables d\'environnement');
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'suivi-sante@exemple.mg',
    to: opts.destinataires.join(', '),
    subject: opts.sujet,
    text: opts.texte,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'application/pdf',
    })),
  });
}

// ─── Vérification de la connexion SMTP ─────────────────────────────────────
export async function verifierSMTP(): Promise<{ ok: boolean; erreur?: string }> {
  if (!smtpEstConfigure()) {
    return {
      ok: false,
      erreur: 'SMTP non configure. Ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans les variables d\'environnement (.env).',
    };
  }

  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: `Erreur de connexion SMTP : ${msg}` };
  }
}