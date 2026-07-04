import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';

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

    if (!user) {
      // Ne pas révéler si l'e-mail existe ou non (anti-énumération)
      return NextResponse.json({
        message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera généré.',
      });
    }

    if (!user.actif) {
      // Même réponse pour ne pas révéler le statut
      return NextResponse.json({
        message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera généré.',
      });
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
      {
        email: user.email,
        userId: user.id,
        purpose: 'password_reset',
      },
      secret,
      { expiresIn: RESET_TOKEN_EXPIRY }
    );

    // Construire le lien de réinitialisation
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // En développement : afficher le lien dans la console
    // En production : envoyer un e-mail via SMTP
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`[RESET MDP] Demande pour : ${user.email} (${user.nom})`);
    console.log(`[RESET MDP] Lien valable 30 min :`);
    console.log(`  ${resetLink}`);
    console.log('═══════════════════════════════════════════════════════════');

    // TODO: En production, remplacer le console.log par l'envoi d'un e-mail :
    // await sendResetEmail(user.email, resetLink, user.nom);

    return NextResponse.json({
      message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera généré.',
    });
  } catch (error) {
    console.error('[AUTH] Erreur forgot-password:', error);
    // Ne jamais exposer les détails de l'erreur
    return NextResponse.json(
      { message: 'Si un compte existe avec cette adresse, un lien de réinitialisation sera généré.' },
      { status: 200 }
    );
  }
}