/**
 * ─── Module LLM unifié ────────────────────────────────────────────────────────
 *
 * Utilise le z-ai-web-dev-sdk (disponible dans l'environnement de développement)
 * avec un fallback fetch direct vers l'API interne Z.ai.
 *
 * Le SDK lit le fichier .z-ai-config pour obtenir baseUrl + apiKey.
 * Si le fichier n'existe pas (ex: Vercel), il faut configurer :
 *   LLM_API_KEY  = la clé API
 *   LLM_BASE_URL = l'URL de base de l'API (ex: https://internal-api.z.ai/v1)
 *   LLM_MODEL    = le modèle (optionnel, défaut: glm-4-flash)
 */

// ─── Cache de l'instance SDK (singleton) ──────────────────────────────────────
let sdkInstance: InstanceType<typeof import('z-ai-web-dev-sdk').default> | null = null;
let sdkInitFailed = false;

async function getSDK() {
  if (sdkInstance) return sdkInstance;
  if (sdkInitFailed) return null;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    sdkInstance = await ZAI.create();
    return sdkInstance;
  } catch {
    sdkInitFailed = true;
    console.warn('[LLM] z-ai-web-dev-sdk non disponible (fichier .z-ai-config manquant). Fallback sur env vars.');
    return null;
  }
}

// ─── Configuration fallback (env vars) ────────────────────────────────────────
const FALLBACK_API_KEY = process.env.LLM_API_KEY;
const FALLBACK_BASE_URL = process.env.LLM_BASE_URL;
const FALLBACK_MODEL = process.env.LLM_MODEL;

// ─── Fonction principale ─────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'assistant' | 'user';
  content: string;
}

/**
 * Appelle le LLM et retourne le texte de la réponse.
 * Utilise le SDK z-ai-web-dev-sdk si disponible, sinon fetch direct.
 *
 * Note : le SDK utilise le rôle "assistant" pour les system prompts.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string }
): Promise<string | null> {
  const model = options?.model || FALLBACK_MODEL;

  // 1. Essayer le SDK z-ai-web-dev-sdk
  const sdk = await getSDK();
  if (sdk) {
    try {
      const result = await sdk.chat.completions.create({
        model,
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        thinking: { type: 'disabled' },
      });
      const content = result?.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      console.error('[LLM] Erreur SDK:', err instanceof Error ? err.message : err);
      // Ne pas bloquer, essayer le fallback
    }
  }

  // 2. Fallback : fetch direct vers l'API (OpenAI-compatible)
  if (!FALLBACK_API_KEY || !FALLBACK_BASE_URL) {
    console.error('[LLM] Aucune configuration LLM disponible. SDK indisponible et env vars (LLM_API_KEY / LLM_BASE_URL) non configurées.');
    return null;
  }

  try {
    const url = `${FALLBACK_BASE_URL}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FALLBACK_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'glm-4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[LLM] Erreur API fallback:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[LLM] Erreur fetch fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}