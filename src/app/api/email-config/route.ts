import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import { invalidateCache } from '@/lib/email';

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
    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, emailRapportDestinataire, actif } = body;

    // Validations
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return NextResponse.json(
        { erreur: 'Les champs Hôte, Utilisateur, Mot de passe et Expéditeur sont obligatoires.' },
        { status: 400 }
      );
    }

    const port = Number(smtpPort) || 587;

    // Upsert : chercher une config existante, sinon en créer une nouvelle
    const existante = await db.configurationEmail.findFirst({ orderBy: { createdAt: 'desc' } });

    let config;
    if (existante) {
      config = await db.configurationEmail.update({
        where: { id: existante.id },
        data: {
          smtpHost,
          smtpPort: port,
          smtpUser,
          smtpPass, // nouveau mot de passe (ou le même)
          smtpFrom,
          emailRapportDestinataire: emailRapportDestinataire || null,
          actif: actif !== false,
        },
        select: { id: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true, emailRapportDestinataire: true, actif: true, updatedAt: true },
      });
    } else {
      config = await db.configurationEmail.create({
        data: { smtpHost, smtpPort: port, smtpUser, smtpPass, smtpFrom, emailRapportDestinataire: emailRapportDestinataire || null },
        select: { id: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true, emailRapportDestinataire: true, actif: true, updatedAt: true },
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
    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = body;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { erreur: 'Hôte, Utilisateur et Mot de passe sont requis pour le test.' },
        { status: 400 }
      );
    }

    const port = Number(smtpPort) || 587;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.verify();

    return NextResponse.json({ ok: true, message: 'Connexion SMTP réussie !' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, erreur: `Échec de la connexion : ${msg}` }, { status: 400 });
  }
}
