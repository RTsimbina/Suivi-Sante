import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { smtpEstConfigureAsync } from '@/lib/email';
import { parseJsonBody } from '@/lib/validation/parse';
import { forgotPasswordSchema } from '@/lib/validation';
import { envoyerReinitialisationMdp } from '@/lib/mail';
import { limiterRouteSensible } from '@/lib/route-rate-limit';

// Durée de validité du token de réinitialisation : 30 minutes
const RESET_TOKEN_EXPIRY = '30m';

export async function POST(request: NextRequest) {
  try {
    // ─── P1 : limitation par adresse IP AVANT toute lecture du corps ──────
    // Les requêtes en rafale sont refusées 429 sans effet de bord (ni
    // service de messagerie, ni requête en base). Fenêtre FIXE partagée
    // entre toutes les instances (Redis → Postgres → mémoire).
    const limiteIp = await limiterRouteSensible(request.headers, {
      prefixe: 'forgot',
      ip: {
        envLimite: 'FORGOT_PASSWORD_IP_LIMIT',
        limiteDefaut: 10,
        envFenetre: 'FORGOT_PASSWORD_IP_WINDOW',
        fenetreDefaut: 900, // 15 minutes
      },
    });
    if (!limiteIp.ok) return limiteIp.reponse;

    // ─── Validation Zod centralisée (format email) ─────────────────────────
    const parsed = await parseJsonBody(request, forgotPasswordSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Adresse e-mail requise.' },
        { status: 400 }
      );
    }
    const emailTrimmed = parsed.data.email.toLowerCase();

    // ─── P1 : limitation par adresse e-mail DÉCLARÉE ────────────────────────
    // La clé est construite sur l'e-mail FOURNI (jamais sur son existence) :
    // compte réel ou inconnu → même réponse 429, aucune énumération.
    // 3 demandes / 10 min est très au-dessus de l'usage légitime et coupe
    // le spam de liens AVANT le service de messagerie — dont la chaîne
    // anti-abus existante est préservée à l'identique.
    const limiteEmail = await limiterRouteSensible(request.headers, {
      prefixe: 'forgot',
      identite: {
        envLimite: 'FORGOT_PASSWORD_EMAIL_LIMIT',
        limiteDefaut: 3,
        envFenetre: 'FORGOT_PASSWORD_EMAIL_WINDOW',
        fenetreDefaut: 600, // 10 minutes
        valeur: emailTrimmed,
      },
    });
    if (!limiteEmail.ok) return limiteEmail.reponse;

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

    // Construire le lien de réinitialisation. NEXTAUTH_URL doit être l'URL
    // publique exacte de l'environnement : le repli localhost n'est toléré
    // qu'en développement (valeur par défaut qui masquerait une mauvaise
    // configuration en production — liens morts envoyés aux utilisateurs).
    const baseUrl = process.env.NEXTAUTH_URL;
    if (!baseUrl && process.env.NODE_ENV === 'production') {
      console.error(
        '[AUTH] NEXTAUTH_URL absent en production : lien de réinitialisation non émis.',
      );
      return NextResponse.json(
        { message: 'Erreur de configuration du serveur.' },
        { status: 500 }
      );
    }
    if (!baseUrl) {
      console.warn('[AUTH] NEXTAUTH_URL absent — repli développement http://localhost:3000');
    }
    const resetLink = `${baseUrl ?? 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(resetToken)}`;

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
