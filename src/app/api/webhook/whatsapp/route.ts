import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyMeta,
  webhookUnauthorized,
  checkRateLimit,
  getClientIp,
} from '@/lib/webhook-verify';
import { traiterMessageBot, sauvegarderMessage, envoyerWhatsApp } from '@/lib/bot-service';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

// GET: Vérification du webhook (configuration Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ erreur: 'WHATSAPP_VERIFY_TOKEN non configuré' }, { status: 500 });
  }

  if (mode === 'subscribe' && token && timingSafeEqual(Buffer.from(token), Buffer.from(WHATSAPP_VERIFY_TOKEN)) && challenge) {
    console.log('[WHATSAPP] Webhook vérifié avec succès');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ erreur: 'Échec de la vérification' }, { status: 403 });
}

// POST: Réception des messages WhatsApp (HMAC-SHA256 obligatoire si secret configuré)
export async function POST(request: NextRequest) {
  // ── Rate limit ──
  const ip = getClientIp(request.headers);
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ erreur: 'Too Many Requests' }, { status: 429 });
  }

  // ── Lire le body brut pour la vérification HMAC ──
  const rawBody = await request.arrayBuffer();

  // ── Vérification signature Meta (obligatoire) ──
  if (!WHATSAPP_APP_SECRET) {
    console.warn('[WHATSAPP] WHATSAPP_APP_SECRET non configuré — message rejeté');
    return webhookUnauthorized('Webhook WhatsApp non configuré (WHATSAPP_APP_SECRET manquant)');
  }
  const signature = request.headers.get('x-hub-signature-256');
  const valid = await verifyMeta(signature, WHATSAPP_APP_SECRET, rawBody);
  if (!valid) {
    return webhookUnauthorized('WhatsApp HMAC-SHA256 signature invalide');
  }

  // ── Parser le JSON manuellement (body déjà consommé par arrayBuffer) ──
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 });
  }

  try {
    // Vérifier si c'est une notification de statut (delivery/read)
    const entry = body.entry as Array<Record<string, unknown>> | undefined;
    const changes = (entry?.[0]?.changes as Array<Record<string, unknown>> | undefined)?.[0] as Record<string, unknown> | undefined;
    const value = changes?.value as Record<string, unknown> | undefined;
    const statuses = value?.statuses as Array<unknown> | undefined;

    if (statuses && statuses.length > 0) {
      return NextResponse.json({ status: 'status_acknowledged' });
    }

    // Extraire le message entrant
    const messages = (value?.messages as Array<Record<string, unknown>> | undefined)?.[0];
    const contacts = (value?.contacts as Array<Record<string, unknown>> | undefined)?.[0];
    const profile = contacts?.profile as Record<string, string> | undefined;

    if (!messages) {
      return NextResponse.json({ status: 'no_message' });
    }

    const from = String(messages.from);
    const textObj = messages.text as Record<string, string> | undefined;
    const text = textObj?.body || '';
    const contactName = profile?.name || 'Inconnu';

    console.log(`[WHATSAPP] Message de ${contactName} (${from}): ${text}`);

    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: from,
      expeditieurNom: contactName,
      texte: text,
    });

    await sauvegarderMessage(
      { canal: 'WHATSAPP', expeditieurId: from, expeditieurNom: contactName, texte: text },
      reponse,
    );

    if (WHATSAPP_PHONE_NUMBER_ID) {
      envoyerWhatsApp(WHATSAPP_PHONE_NUMBER_ID, from, reponse)
        .then(ok => console.log(`[WHATSAPP] Réponse envoyée à ${from}: ${ok ? 'OK' : 'ÉCHEC'}`))
        .catch(e => console.error('[WHATSAPP] Erreur envoi réponse:', e));
    } else {
      console.warn('[WHATSAPP] WHATSAPP_PHONE_NUMBER_ID non configuré — réponse non envoyée');
    }

    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('[WHATSAPP] Erreur:', error);
    return NextResponse.json({ erreur: 'Erreur de traitement' }, { status: 500 });
  }
}
