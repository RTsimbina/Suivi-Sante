/**
 * ─── Module LLM unifié ────────────────────────────────────────────────────────
 *
 * Supporte plusieurs fournisseurs LLM via fetch direct :
 *   - OpenAI-compatible (OpenAI, Groq, Together, etc.)
 *   - Eden AI (api.edenai.run)
 *
 * Le z-ai-web-dev-sdk est utilisé uniquement en dev local (.z-ai-config).
 *
 * Configuration sur Vercel (.env) :
 *   LLM_BASE_URL  = URL de base de l'API
 *   LLM_API_KEY   = votre clé API
 *   LLM_MODEL     = modèle (optionnel)
 *   LLM_PROVIDER  = "openai" (défaut) ou "edenai"
 */

// ─── Cache SDK (dev local uniquement) ─────────────────────────────────────────
let sdkInstance: unknown = null;
let sdkInitFailed = false;

async function getLocalSDK() {
  if (sdkInstance) return sdkInstance;
  if (sdkInitFailed) return null;

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    sdkInstance = await ZAI.create();
    return sdkInstance;
  } catch {
    sdkInitFailed = true;
    return null;
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────
function getConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    provider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(),
  };
}

// ─── Fonction principale ─────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'assistant' | 'user';
  content: string;
}

/**
 * Appelle le LLM et retourne le texte de la réponse.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string }
): Promise<string | null> {
  const { baseUrl, apiKey, model: envModel, provider } = getConfig();
  const model = options?.model || envModel;

  // 0. Essayer le SDK local (z-ai-web-dev-sdk avec .z-ai-config)
  const sdk = await getLocalSDK();
  if (sdk) {
    try {
      const result = await sdk.chat.completions.create({
        model: model || 'glm-4-flash',
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        thinking: { type: 'disabled' },
      });
      const content = result?.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      console.error('[LLM] Erreur SDK local:', err instanceof Error ? err.message : err);
    }
  }

  // Vérifier la configuration fetch
  if (!baseUrl || !apiKey) {
    console.error('[LLM] Aucune configuration LLM. Ajoutez LLM_BASE_URL et LLM_API_KEY dans .env');
    return null;
  }

  // 1. Eden AI
  if (provider === 'edenai') {
    return callEdenAI(baseUrl, apiKey, model || 'openai/gpt-4o-mini', systemPrompt, userMessage);
  }

  // 2. OpenAI-compatible (défaut)
  return callOpenAICompatible(baseUrl, apiKey, model || 'gpt-4o-mini', systemPrompt, userMessage);
}

// ─── OpenAI-compatible fetch ─────────────────────────────────────────────────
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  // Si l'URL se termine par /v1, on construit /chat/completions
  // Sinon on utilise l'URL telle quelle
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[LLM] Erreur API OpenAI-compatible:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[LLM] Erreur fetch OpenAI-compatible:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Eden AI fetch ───────────────────────────────────────────────────────────
async function callEdenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  // model format: "provider/model" (ex: "openai/gpt-4o-mini")
  const [provider, ...modelParts] = model.split('/');
  const modelName = modelParts.join('/') || 'gpt-4o-mini';

  const url = baseUrl.replace(/\/+$/, '') + '/v2/ai/text/chat';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        response_as_dict: true,
        attributes_as_list: false,
        show_original_response: false,
        providers: provider,
        text: userMessage,
        chatbot_global_action: systemPrompt,
        model: modelName,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[LLM] Erreur API Eden AI:', res.status, errText);
      return null;
    }

    const data = await res.json();

    // Réponse Eden AI : { "openai": { "status": "success", "generated_text": "..." } }
    const providerResult = data?.[provider];
    if (providerResult?.status === 'success' && providerResult?.generated_text) {
      return providerResult.generated_text;
    }

    console.error('[LLM] Réponse Eden AI inattendue:', JSON.stringify(data).slice(0, 300));
    return null;
  } catch (err) {
    console.error('[LLM] Erreur fetch Eden AI:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Vérifie si le LLM est configuré.
 */
export async function verifierLLM(): Promise<{ ok: boolean; erreur?: string }> {
  // Dev local : essayer le SDK
  const sdk = await getLocalSDK();
  if (sdk) return { ok: true };

  // Production : vérifier les env vars
  const { baseUrl, apiKey } = getConfig();
  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      erreur: 'LLM non configuré. Ajoutez LLM_BASE_URL et LLM_API_KEY dans les variables d\'environnement (.env).',
    };
  }

  return { ok: true };
}