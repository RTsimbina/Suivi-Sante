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

// GET: Information sur le bot + configuration du webhook
export async function GET(request: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ status: 'not_configured', message: 'TELEGRAM_BOT_TOKEN non défini' });
  }

  const { searchParams } = new URL(request.url);
  const setWebhook = searchParams.get('set_webhook');
  const webhookUrl = searchParams.get('url');

  if (setWebhook === 'true' && webhookUrl) {
    // Inclure le secret_token dans la configuration du webhook
    const secretToken = TELEGRAM_WEBHOOK_SECRET || undefined;
    const params = new URLSearchParams({ url: webhookUrl });
    if (secretToken) params.set('secret_token', secretToken);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?${params.toString()}`,
      );
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: 'Erreur de configuration webhook' }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: 'active',
    bot: 'Suivi Santé Telegram Bot',
    signature_enabled: !!TELEGRAM_WEBHOOK_SECRET,
    webhook_info: 'Envoyez GET ?set_webhook=true&url=https://votre-domaine.com/api/webhook/telegram pour configurer',
  });
}

// POST: Réception des messages Telegram (vérification de signature obligatoire)
export async function POST(request: NextRequest) {
  // ── Rate limit ──
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  // ── Vérification signature Telegram ──
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
    if (!verifyTelegram(secretHeader, TELEGRAM_WEBHOOK_SECRET)) {
      return webhookUnauthorized('Telegram secret token invalide');
    }
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
    return NextResponse.json({ error: 'Erreur de traitement' }, { status: 500 });
  }
}
