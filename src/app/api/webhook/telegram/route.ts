import { NextRequest, NextResponse } from 'next/server';
import {
  verifyTelegram,
  webhookUnauthorized,
  checkRateLimit,
  getClientIp,
} from '@/lib/webhook-verify';
import { traiterMessageBot, sauvegarderMessage, envoyerTelegram } from '@/lib/bot-service';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// GET: Désactivé — la configuration du webhook Telegram doit se faire
// en CLI ou via un endpoint admin dédié, jamais via GET public.
export async function GET() {
  return NextResponse.json({ erreur: 'Endpoint désactivé. Utilisez le CLI Telegram pour configurer le webhook.' },
    { status: 403 }
  );
}

// POST: Réception des messages Telegram (vérification de signature obligatoire)
export async function POST(request: NextRequest) {
  // ── Rate limit ──
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ erreur: 'Too Many Requests' }, { status: 429 });
  }

  // ── Vérification signature Telegram (obligatoire) ──
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[TELEGRAM] TELEGRAM_WEBHOOK_SECRET non configuré — message rejeté');
    return webhookUnauthorized('Webhook Telegram non configuré (TELEGRAM_WEBHOOK_SECRET manquant)');
  }
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (!verifyTelegram(secretHeader, TELEGRAM_WEBHOOK_SECRET)) {
    return webhookUnauthorized('Telegram secret token invalide');
  }

  try {
    const body = await request.json();
    const message = body.message;

    if (!message) {
      return NextResponse.json({ status: 'no_message' });
    }

    const chatId = message.chat.id;
    const text = message.text || '';
    const from = message.from;
    const senderName = from?.first_name
      ? `${from.first_name}${from.last_name ? ' ' + from.last_name : ''}`
      : 'Inconnu';

    console.log(`[TELEGRAM] Message de ${senderName} (${chatId}): ${text}`);

    const reponse = await traiterMessageBot({
      canal: 'TELEGRAM',
      expeditieurId: String(chatId),
      expeditieurNom: senderName,
      texte: text,
    });

    await sauvegarderMessage(
      { canal: 'TELEGRAM', expeditieurId: String(chatId), expeditieurNom: senderName, texte: text },
      reponse,
    );

    if (TELEGRAM_BOT_TOKEN) {
      envoyerTelegram(chatId, reponse)
        .then(ok => console.log(`[TELEGRAM] Réponse envoyée à ${chatId}: ${ok ? 'OK' : 'ÉCHEC'}`))
        .catch(e => console.error('[TELEGRAM] Erreur envoi réponse:', e));
    }

    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('[TELEGRAM] Erreur:', error);
    return NextResponse.json({ erreur: 'Erreur de traitement' }, { status: 500 });
  }
}
