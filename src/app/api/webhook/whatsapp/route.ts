import { NextRequest, NextResponse } from "next/server";
import { traiterMessageBot, sauvegarderMessage, envoyerWhatsApp } from "@/lib/bot-service";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "smartflow_verify_token";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

// GET: Vérification du webhook (configuration Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN && challenge) {
    console.log('[WHATSAPP] Webhook vérifié avec succès');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Échec de la vérification' }, { status: 403 });
}

// POST: Réception et traitement des messages WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Vérifier si c'est une notification de statut (delivery/read)
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const statuses = value?.statuses?.[0];

    if (statuses) {
      // Accusé de réception de Meta — on ignore, pas besoin de répondre
      return NextResponse.json({ status: 'status_acknowledged' });
    }

    // Extraire le message entrant
    const messages = value?.messages?.[0];
    const contacts = value?.contacts?.[0];

    if (!messages) {
      return NextResponse.json({ status: 'no_message' });
    }

    const from = messages.from;
    const text = messages.text?.body || '';
    const contactName = contacts?.profile?.name || 'Inconnu';

    console.log(`[WHATSAPP] Message de ${contactName} (${from}): ${text}`);

    // Traiter le message via le service bot
    const reponse = await traiterMessageBot({
      canal: 'WHATSAPP',
      expeditieurId: from,
      expeditieurNom: contactName,
      texte: text,
    });

    // Persister la conversation
    await sauvegarderMessage(
      { canal: 'WHATSAPP', expeditieurId: from, expeditieurNom: contactName, texte: text },
      reponse
    );

    // Envoyer la réponse via WhatsApp Cloud API (async, ne bloque pas le webhook)
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
    return NextResponse.json({ error: 'Erreur de traitement' }, { status: 500 });
  }
}