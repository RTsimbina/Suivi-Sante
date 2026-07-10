/**
 * ─── Assistant IA multicanal ────────────────────────────────────────────
 * 
 * Module partagé pour les webhooks WhatsApp, Telegram et Messenger.
 * Utilise le z-ai-web-dev-sdk (glm-4-flash) pour répondre aux questions
 * des utilisateurs sur leurs dossiers de santé.
 * 
 * Prêt pour une migration vers Gemini ou un autre modèle LLM.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { db } from '@/lib/db';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

/**
 * Système prompt pour le chatbot multicanal.
 * Se concentre sur les informations accessibles au public (pas de données sensibles).
 */
const CHATBOT_SYSTEM_PROMPT = `Tu es l'assistant virtuel de Suivi Santé, une plateforme de gestion des dossiers de soins de santé à Madagascar.

Tu aides les utilisateurs à :
- Vérifier le statut d'un dossier (ils doivent fournir le numéro de dossier)
- Comprendre les étapes de traitement d'un dossier
- Expliquer les motifs de rejet possibles
- Donner des informations générales sur les délais de traitement

RÈGLES STRICTES DE CONFIDENTIALITÉ :
- Ne JAMAIS révéler le nom d'un bénéficiaire, le nom d'une société, ou tout montant financier
- Ne JAMAIS révéler de données médicales, de numéros de sécurité sociale ou d'adresses
- Si on te demande le statut d'un dossier, demande le numéro de dossier au format DOS-2026-XXXXXX
- Tu peux uniquement communiquer : le numéro de dossier, le statut de traitement, et les dates de réception/paiement
- Pour TOUTE demande d'informations détaillées, oriente vers le portail Suivi Santé ou le service RH
- Réponds TOUJOURS en français
- Sois concis et professionnel
- Si tu n'as pas l'information, dis-le honnêtement
- Ne fais jamais de diagnostic médical`;

/**
 * Recherche un dossier par numéro et retourne un résumé anonymisé.
 */
async function findDossierSummary(numeroDossier: string): Promise<string | null> {
  try {
    const dossier = await db.dossier.findUnique({
      where: { numeroDossier },
      include: { societe: { select: { nom: true } } },
    });

    if (!dossier) return null;

    const statutLabels: Record<string, string> = {
      RECU: 'Reçu',
      EN_ANALYSE: 'En cours d\'analyse',
      VALIDE: 'Validé',
      EN_COMPTABILITE: 'En cours de comptabilité',
      EN_PAIEMENT: 'En cours de paiement',
      PAYE: 'Payé',
      REJETE: 'Rejeté',
    };

    const statutLabel = statutLabels[dossier.statut] || dossier.statut;

    // ── C-03 : Ne jamais exposer de données personnelles dans les canaux publics ──
    // Seuls le numéro de dossier et le statut sont publics.
    // Le bénéficiaire, la société, les montants et le motif de rejet sont privés.
    let summary = `Dossier ${dossier.numeroDossier} : ${statutLabel}`;
    summary += `\nDate de réception : ${dossier.dateReception.toLocaleDateString('fr-FR')}`;

    if (dossier.statut === 'PAYE' && dossier.datePaiement) {
      summary += `\nDate de paiement : ${dossier.datePaiement.toLocaleDateString('fr-FR')}`;
    }

    // Informations sensibles : indiquer leur présence sans révéler le contenu
    if (dossier.motifRejet) {
      summary += `\nUn motif de rejet a été enregistré. Pour plus de détails, veuillez contacter votre service RH ou vous connecter au portail Suivi Santé.`;
    }

    return summary;
  } catch {
    return null;
  }
}

/**
 * Génère une réponse IA pour un message utilisateur donné.
 * Détecte automatiquement si le message contient un numéro de dossier
 * et enrichit le contexte avec les informations du dossier.
 */
export async function generateChatbotResponse(
  userMessage: string,
  channel: 'whatsapp' | 'telegram' | 'messenger'
): Promise<string> {
  try {
    // Détecter un numéro de dossier dans le message
    const dossierMatch = userMessage.match(/DOS-2026-\d{6}/i);
    let contextEnrichment = '';

    if (dossierMatch) {
      const summary = await findDossierSummary(dossierMatch[0].toUpperCase());
      if (summary) {
        contextEnrichment = `\n\n[INFORMATIONS DOSSIER TROUVÉ]\n${summary}\n[FIN INFORMATIONS]`;
      }
    }

    const systemPrompt = `${CHATBOT_SYSTEM_PROMPT}${contextEnrichment}\n\nCanal de communication : ${channel}. Adapte brièvement ton style (plus concis pour WhatsApp, plus détaillé pour Messenger).`;

    if (!LLM_API_KEY) {
      return 'Le service IA est temporairement indisponible. Veuillez réessayer plus tard.';
    }

    const completion = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!completion.ok) {
      const errText = await completion.text();
      console.error(`[CHATBOT:${channel}] API error:`, completion.status, errText);
      return 'Désolé, une erreur est survenue lors du traitement de votre demande. Veuillez réessayer.';
    }

    const data = await completion.json();
    const response = data?.choices?.[0]?.message?.content || 'Désolé, je n\'ai pas pu générer de réponse.';

    // Limiter la longueur pour les canaux SMS/messagerie
    if (channel === 'whatsapp' && response.length > 1600) {
      return response.substring(0, 1550) + '...\n\n(Pour plus de détails, connectez-vous à Suivi Santé)';
    }

    return response;
  } catch (error) {
    console.error(`[CHATBOT:${channel}] Erreur IA:`, error);
    return 'Désolé, une erreur est survenue lors du traitement de votre demande. Veuillez réessayer.';
  }
}

/**
 * Envoie un message via l'API WhatsApp Business (Meta Cloud API).
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('[WHATSAPP] WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_ID non configuré');
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('[WHATSAPP] Erreur envoi:', error);
    return false;
  }
}

/**
 * Envoie un message via l'API Telegram Bot.
 */
export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TELEGRAM] TELEGRAM_BOT_TOKEN non configuré');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('[TELEGRAM] Erreur envoi:', error);
    return false;
  }
}

/**
 * Envoie un message via l'API Messenger (Meta Platform).
 */
export async function sendMessengerMessage(senderId: string, text: string): Promise<boolean> {
  const MESSENGER_PAGE_TOKEN = process.env.MESSENGER_PAGE_TOKEN;

  if (!MESSENGER_PAGE_TOKEN) {
    console.warn('[MESSENGER] MESSENGER_PAGE_TOKEN non configuré');
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MESSENGER_PAGE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text },
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('[MESSENGER] Erreur envoi:', error);
    return false;
  }
}