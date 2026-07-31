import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { envoyerEmail, smtpEstConfigure } from '@/lib/email';

// Durée de validité du token de réinitialisation : 30 minutes
const RESET_TOKEN_EXPIRY = '30m';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { message: 'Adresse e-mail requise.' },
        { status: 400 }
      );
    }

    const emailTrimmed = email.toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return NextResponse.json(
        { message: 'Format d\'e-mail invalide.' },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur existe et est actif
    const user = await db.utilisateur.findUnique({
      where: { email: emailTrimmed },
      select: { id: true, email: true, actif: true, nom: true },
    });

    // Ne jamais révéler si l'e-mail existe ou non (anti-énumération)
    const genericResponse = {
      message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera envoyé par e-mail.',
    };

    if (!user || !user.actif) {
      return NextResponse.json(genericResponse);
    }

    // Générer un token JWT signé contenant l'email de l'utilisateur
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('[AUTH] NEXTAUTH_SECRET non configuré');
      return NextResponse.json(
        { message: 'Erreur de configuration du serveur.' },
        { status: 500 }
      );
    }

    const resetToken = jwt.sign(
      { email: user.email, userId: user.id, purpose: 'password_reset' },
      secret,
      { expiresIn: RESET_TOKEN_EXPIRY }
    );

    // Construire le lien de réinitialisation
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Tenter l'envoi d'un vrai e-mail via SMTP
    if (smtpEstConfigure()) {
      try {
        await envoyerEmail({
          destinataires: [user.email],
          sujet: 'Réinitialisation de votre mot de passe — Suivi Santé',
          texte: [
            `Bonjour ${user.nom},`,
            '',
            'Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme Suivi Santé.',
            '',
            `Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe (valide 30 minutes) :`,
            resetLink,
            '',
            'Si vous n\'avez pas fait cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.',
            '',
            'L\'équipe Suivi Santé',
          ].join('\n'),
          html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- En-tête -->
        <tr><td style="background:#059669;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Suivi Santé</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Réinitialisation de mot de passe</p>
        </td></tr>
        <!-- Corps -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#18181b;font-size:15px;">Bonjour <strong>${user.nom}</strong>,</p>
          <p style="margin:0 0 24px;color:#52525b;font-size:14px;line-height:1.6;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau. Ce lien est valable <strong>30 minutes</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${resetLink}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Réinitialiser mon mot de passe</a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.5;">Si vous n'avez pas fait cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.</p>
        </td></tr>
        <!-- Pied -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="margin:0;color:#a1a1aa;font-size:11px;">L'équipe Suivi Santé</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        });
      } catch (smtpError: unknown) {
        const msg = smtpError instanceof Error ? smtpError.message : String(smtpError);
        console.error('[AUTH] Erreur SMTP forgot-password:', msg);
        // Fallback : journaliser le lien pour que l'admin puisse le relayer manuellement
        console.log(`[RESET MDP FALLBACK] ${user.email} — ${resetLink}`);
      }
    } else {
      // SMTP non configuré : journaliser le lien (développement / pré-production)
      console.log(`[RESET MDP] SMTP non configuré — ${user.email} — ${resetLink}`);
    }

    return NextResponse.json(genericResponse);
  } catch (error) {
    console.error('[AUTH] Erreur forgot-password:', error);
    // Même réponse générique pour ne jamais exposer les détails
    return NextResponse.json(
      { message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera envoyé par e-mail.' },
      { status: 200 }
    );
  }
}
