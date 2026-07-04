import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { message: 'Token et nouveau mot de passe requis.' },
        { status: 400 }
      );
    }

    // Valider le nouveau mot de passe
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` },
        { status: 400 }
      );
    }

    // Vérifier la complexité minimale
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

    if (!hasLetter || !hasNumber) {
      return NextResponse.json(
        { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' },
        { status: 400 }
      );
    }

    // Vérifier et décoder le token JWT
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('[AUTH] NEXTAUTH_SECRET non configuré');
      return NextResponse.json(
        { message: 'Erreur de configuration du serveur.' },
        { status: 500 }
      );
    }

    let payload: { email: string; userId: string; purpose: string };
    try {
      payload = jwt.verify(token, secret) as typeof payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return NextResponse.json(
          { message: 'Le lien de réinitialisation a expiré. Veuillez demander un nouveau lien.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { message: 'Lien de réinitialisation invalide.' },
        { status: 400 }
      );
    }

    // Vérifier que le token est bien un token de réinitialisation
    if (payload.purpose !== 'password_reset') {
      console.warn(`[AUTH] Tentative d'utilisation d'un token invalide (purpose: ${payload.purpose})`);
      return NextResponse.json(
        { message: 'Lien de réinitialisation invalide.' },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur existe toujours et est actif
    const user = await db.utilisateur.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, actif: true },
    });

    if (!user || !user.actif) {
      return NextResponse.json(
        { message: 'Compte introuvable ou désactivé.' },
        { status: 400 }
      );
    }

    // Vérifier que l'email correspond (sécurité supplémentaire)
    if (user.email !== payload.email) {
      console.warn(`[AUTH] Incohérence email token: ${payload.email} vs ${user.email}`);
      return NextResponse.json(
        { message: 'Lien de réinitialisation invalide.' },
        { status: 400 }
      );
    }

    // Hacher le nouveau mot de passe (bcrypt cost 12, même que l'API de création)
    const newPasswordHash = await hash(newPassword, 12);

    // Mettre à jour le mot de passe
    await db.utilisateur.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });

    console.log(`[AUTH] Mot de passe réinitialisé avec succès pour : ${user.email}`);

    return NextResponse.json({
      message: 'Mot de passe modifié avec succès. Vous pouvez maintenant vous connecter.',
    });
  } catch (error) {
    console.error('[AUTH] Erreur reset-password:', error);
    return NextResponse.json(
      { message: 'Une erreur est survenue. Veuillez réessayer.' },
      { status: 500 }
    );
  }
}