import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parseJsonBody } from '@/lib/validation/parse';
import { resetPasswordSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    // ─── Validation Zod centralisée (token requis, politique mot de passe) ──
    const parsed = await parseJsonBody(request, resetPasswordSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Token et nouveau mot de passe requis (min. 8 caractères, une lettre et un chiffre).' },
        { status: 400 }
      );
    }
    const { token, newPassword } = parsed.data;

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