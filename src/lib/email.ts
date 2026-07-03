import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

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

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'smartflow@exemple.mg',
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
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: msg };
  }
}