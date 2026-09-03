import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import { invalidateCache, interpreterErreurSMTP } from '@/lib/email';
import { encrypt } from '@/lib/crypto';
import { parseJsonBody } from '@/lib/validation/parse';
import { emailConfigSchema, emailConfigTestSchema } from '@/lib/validation';

const ENCRYPTION_KEY = process.env.SERVER_ENCRYPTION_KEY || '';

// GET: Récupérer la configuration SMTP (masquer le mot de passe)
export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const config = await db.configurationEmail.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpFrom: true,
        emailRapportDestinataire: true,
        actif: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Indiquer si des env vars existent aussi
    const envFallback = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

    return NextResponse.json({ config, envFallback });
  } catch {
    // La table n'existe peut-être pas encore
    return NextResponse.json({ config: null, envFallback: !!(process.env.SMTP_HOST && process.env.SMTP_USER) });
  }
}

// PUT: Sauvegarder / mettre à jour la configuration SMTP
export async function PUT(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    // ─── Validation Zod centralisée (hôte/utilisateur/expéditeur requis, ────
    //     email expéditeur, port 1-65535) ─────────────────────────────────
    const parsed = await parseJsonBody(request, emailConfigSchema);
    if (!parsed.success) return parsed.response;
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, emailRapportDestinataire, actif } = parsed.data;

    // Chiffrer le mot de passe avant stockage (AES-256-GCM)
    const encryptedPass = encrypt(smtpPass, ENCRYPTION_KEY);

    // Upsert : chercher une config existante, sinon en créer une nouvelle
    const existante = await db.configurationEmail.findFirst({ orderBy: { createdAt: 'desc' } });

    let config;
    if (existante) {
      config = await db.configurationEmail.update({
        where: { id: existante.id },
        data: {
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass: encryptedPass, // chiffré — jamais en clair en BDD
          smtpFrom,
          emailRapportDestinataire: emailRapportDestinataire ?? null,
          actif: actif !== false,
        },
        select: { id: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true, emailRapportDestinataire: true, actif: true, updatedAt: true },
      });
    } else {
      config = await db.configurationEmail.create({
        data: { smtpHost, smtpPort, smtpUser, smtpPass: encryptedPass, smtpFrom, emailRapportDestinataire: emailRapportDestinataire ?? null },
        select: { id: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true, emailRapportDestinataire: true, actif: true, createdAt: true },
      });
    }

    // Invalider le cache pour forcer la relecture
    invalidateCache();

    return NextResponse.json({ message: 'Configuration SMTP sauvegardée avec succès', config });
  } catch (error) {
    console.error('[EMAIL CONFIG] Erreur sauvegarde:', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la sauvegarde de la configuration' },
      { status: 500 }
    );
  }
}

// DELETE: Supprimer la configuration SMTP (retour aux env vars)
export async function DELETE(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    await db.configurationEmail.deleteMany({});
    invalidateCache();
    return NextResponse.json({ message: 'Configuration SMTP supprimée. Utilisation des variables d\'environnement si disponibles.' });
  } catch {
    return NextResponse.json(
      { erreur: 'Erreur lors de la suppression de la configuration' },
      { status: 500 }
    );
  }
}

// POST: Tester une connexion SMTP avec les paramètres fournis
export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    // ─── Validation Zod centralisée (test SMTP) ─────────────────────────────
    const parsed = await parseJsonBody(request, emailConfigTestSchema);
    if (!parsed.success) return parsed.response;
    const { smtpHost, smtpPort, smtpUser, smtpPass } = parsed.data;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort === 587,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();

    return NextResponse.json({ ok: true, message: 'Connexion SMTP réussie !' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, erreur: interpreterErreurSMTP(msg) }, { status: 400 });
  }
}
