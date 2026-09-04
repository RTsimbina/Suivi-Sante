import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { smtpEstConfigureAsync } from '@/lib/email';
import { parseJsonBody } from '@/lib/validation/parse';
import { forgotPasswordSchema } from '@/lib/validation';
import { envoyerReinitialisationMdp } from '@/lib/mail';

// Durée de validité du token de réinitialisation : 30 minutes
const RESET_TOKEN_EXPIRY = '30m';

export async function POST(request: NextRequest) {
  try {
    // ─── Validation Zod centralisée (format email) ─────────────────────────
    const parsed = await parseJsonBody(request, forgotPasswordSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Adresse e-mail requise.' },
        { status: 400 }
      );
    }
    const emailTrimmed = parsed.data.email.toLowerCase();

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

    // Tenter l'envoi via le service de messagerie centralisé
    // (validation → anti-abus → rate-limiting → file d'attente → retry SMTP)
    if (await smtpEstConfigureAsync()) {
      try {
        const resultat = await envoyerReinitialisationMdp({
          destinataire: user.email,
          nom: user.nom,
          lien: resetLink,
          minutes: 30,
          sourceId: user.id,
        });
        if (!resultat.accepte) {
          console.error('[AUTH] Envoi refusé par le service de messagerie:', resultat.motif);
          console.log(`[RESET MDP FALLBACK] ${user.email} — ${resetLink}`);
        } else if (resultat.envoi?.livraison && !resultat.envoi.livraison.ok) {
          // Erreur SMTP : le message reste en file d'attente (retries automatiques)
          console.warn('[AUTH] Livraison différée:', resultat.envoi.livraison.erreur);
          console.log(`[RESET MDP FALLBACK] ${user.email} — ${resetLink}`);
        }
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
