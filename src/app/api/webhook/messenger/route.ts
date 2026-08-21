import { NextRequest, NextResponse } from 'next/server';
import {
  verifyMeta,
  webhookUnauthorized,
  checkRateLimit,
  getClientIp,
} from '@/lib/webhook-verify';
import { traiterMessageBot, sauvegarderMessage, envoyerMessenger } from '@/lib/bot-service';

const MESSENGER_VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || '';
const MESSENGER_APP_SECRET = process.env.MESSENGER_APP_SECRET || '';

// GET: Vérification du webhook (configuration Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!MESSENGER_VERIFY_TOKEN) {
    return NextResponse.json({ erreur: 'MESSENGER_VERIFY_TOKEN non configuré' }, { status: 500 });
  }

  if (mode === 'subscribe' && token === MESSENGER_VERIFY_TOKEN && challenge) {
    console.log('[MESSENGER] Webhook vérifié avec succès');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ erreur: 'Échec de la vérification' }, { status: 403 });
}

// POST: Réception des messages Messenger (HMAC-SHA256 obligatoire si secret configuré)
export async function POST(request: NextRequest) {
  // ── Rate limit ──
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ erreur: 'Too Many Requests' }, { status: 429 });
  }

  // ── Lire le body brut pour la vérification HMAC ──
  const rawBody = await request.arrayBuffer();

  // ── Vérification signature Meta (obligatoire) ──
  if (!MESSENGER_APP_SECRET) {
    console.warn('[MESSENGER] MESSENGER_APP_SECRET non configuré — message rejeté');
    return webhookUnauthorized('Webhook Messenger non configuré (MESSENGER_APP_SECRET manquant)');
  }
  const signature = request.headers.get('x-hub-signature-256');
  const valid = await verifyMeta(signature, MESSENGER_APP_SECRET, rawBody);
  if (!valid) {
    return webhookUnauthorized('Messenger HMAC-SHA256 signature invalide');
  }

  // ── Parser le JSON manuellement ──
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 });
  }

  try {
    const entry = (body.entry as Array<Record<string, unknown>> | undefined)?.[0];
    const messaging = (entry?.messaging as Array<Record<string, unknown>> | undefined)?.[0];
    const message = messaging?.message as Record<string, unknown> | undefined;

    if (!message) {
      return NextResponse.json({ status: 'event_acknowledged' });
    }

    const senderId = String((messaging?.sender as Record<string, unknown>)?.id || '');
    const text = String(message?.text || '');

    if (!text) {
      if (process.env.MESSENGER_PAGE_ACCESS_TOKEN && senderId) {
        envoyerMessenger(senderId, 'Je ne traite que les messages texte pour le moment. Envoyez /aide pour voir les commandes disponibles.')
          .catch(() => {});
      }
      return NextResponse.json({ status: 'non_text_ignored' });
    }

    console.log(`[MESSENGER] Message de ${senderId}: ${text}`);

    const reponse = await traiterMessageBot({
      canal: 'MESSENGER',
      expeditieurId: senderId,
      expeditieurNom: `Utilisateur ${senderId}`,
      texte: text,
    });

    await sauvegarderMessage(
      { canal: 'MESSENGER', expeditieurId: senderId, expeditieurNom: `Utilisateur ${senderId}`, texte: text },
      reponse,
    );

    if (process.env.MESSENGER_PAGE_ACCESS_TOKEN && senderId) {
      envoyerMessenger(senderId, reponse)
        .then(ok => console.log(`[MESSENGER] Réponse envoyée à ${senderId}: ${ok ? 'OK' : 'ÉCHEC'}`))
        .catch(e => console.error('[MESSENGER] Erreur envoi réponse:', e));
    } else {
      console.warn('[MESSENGER] MESSENGER_PAGE_ACCESS_TOKEN non configuré — réponse non envoyée');
    }

    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('[MESSENGER] Erreur:', error);
    return NextResponse.json({ erreur: 'Erreur de traitement' }, { status: 500 });
  }
}
