import { NextRequest, NextResponse } from "next/server";
import { traiterMessageBot, sauvegarderMessage, envoyerMessenger } from "@/lib/bot-service";

const MESSENGER_VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "suivisante_verify_token";

// GET: Vérification du webhook (configuration Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === MESSENGER_VERIFY_TOKEN && challenge) {
    console.log('[MESSENGER] Webhook vérifié avec succès');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Échec de la vérification' }, { status: 403 });
}

// POST: Réception et traitement des messages Messenger
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging?.message) {
      // Peut être un event de delivery ou autre — on acknowledge silencieusement
      return NextResponse.json({ status: 'event_acknowledged' });
    }

    const senderId = messaging.sender?.id;
    const text = messaging.message?.text || '';

    if (!text) {
      // Message non-texte (image, sticker, etc.) — on répond poliment
      if (process.env.MESSENGER_PAGE_ACCESS_TOKEN && senderId) {
        envoyerMessenger(senderId, 'Je ne traite que les messages texte pour le moment. Envoyez /aide pour voir les commandes disponibles.')
          .catch(() => {});
      }
      return NextResponse.json({ status: 'non_text_ignored' });
    }

    console.log(`[MESSENGER] Message de ${senderId}: ${text}`);

    // Traiter le message via le service bot
    const reponse = await traiterMessageBot({
      canal: 'MESSENGER',
      expeditieurId: senderId,
      expeditieurNom: `Utilisateur ${senderId}`,
      texte: text,
    });

    // Persister la conversation
    await sauvegarderMessage(
      { canal: 'MESSENGER', expeditieurId: senderId, expeditieurNom: `Utilisateur ${senderId}`, texte: text },
      reponse
    );

    // Envoyer la réponse via Messenger Graph API (async)
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
    return NextResponse.json({ error: 'Erreur de traitement' }, { status: 500 });
  }
}