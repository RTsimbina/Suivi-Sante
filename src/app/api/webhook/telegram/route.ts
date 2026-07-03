import { NextRequest, NextResponse } from "next/server";
import { traiterMessageBot, sauvegarderMessage, envoyerTelegram } from "@/lib/bot-service";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// GET: Information sur le bot + configuration du webhook
export async function GET(request: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ status: 'not_configured', message: 'TELEGRAM_BOT_TOKEN non défini dans .env' });
  }

  // Si on demande de set le webhook
  const { searchParams } = new URL(request.url);
  const setWebhook = searchParams.get('set_webhook');
  const webhookUrl = searchParams.get('url');

  if (setWebhook === 'true' && webhookUrl) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const data = await res.json();
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: 'Erreur de configuration webhook' }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: 'active',
    bot: 'SmartFlow IA Telegram Bot',
    webhook_info: `Envoyez GET ?set_webhook=true&url=https://votre-domaine.com/api/webhook/telegram pour configurer`,
  });
}

// POST: Réception et traitement des messages Telegram
export async function POST(request: NextRequest) {
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

    // Traiter le message via le service bot
    const reponse = await traiterMessageBot({
      canal: 'TELEGRAM',
      expeditieurId: String(chatId),
      expeditieurNom: senderName,
      texte: text,
    });

    // Persister la conversation
    await sauvegarderMessage(
      { canal: 'TELEGRAM', expeditieurId: String(chatId), expeditieurNom: senderName, texte: text },
      reponse
    );

    // Envoyer la réponse via Telegram Bot API (async)
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