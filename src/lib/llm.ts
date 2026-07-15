/**
 * ─── Module LLM unifié ────────────────────────────────────────────────────────
 *
 * Utilise le z-ai-web-dev-sdk avec 3 niveaux de fallback :
 *   1. ZAI.create() — lit .z-ai-config (dev local)
 *   2. new ZAI({ baseUrl, apiKey }) depuis env vars (Vercel / production)
 *   3. fetch direct OpenAI-compatible (dernier recours)
 *
 * Configuration requise sur Vercel (.env) :
 *   LLM_BASE_URL = https://internal-api.z.ai/v1
 *   LLM_API_KEY  = votre clé API
 *   LLM_MODEL    = modèle (optionnel, défaut : glm-4-flash)
 */

// ─── Cache de l'instance SDK (singleton) ──────────────────────────────────────
let sdkInstance: InstanceType<typeof import('z-ai-web-dev-sdk').default> | null = null;
let sdkInitFailed = false;

async function getSDK() {
  if (sdkInstance) return sdkInstance;
  if (sdkInitFailed) return null;

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;

    // Stratégie 1 : create() lit .z-ai-config (fonctionne en dev local)
    try {
      sdkInstance = await ZAI.create();
      return sdkInstance;
    } catch {
      // .z-ai-config introuvable → essayer les env vars
    }

    // Stratégie 2 : construire directement depuis les variables d'environnement
    const baseUrl = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;
    if (baseUrl && apiKey) {
      sdkInstance = new ZAI({ baseUrl, apiKey } as ConstructorParameters<typeof ZAI>[0]);
      console.log('[LLM] SDK initialisé depuis les variables d\'environnement');
      return sdkInstance;
    }

    // Aucune config disponible
    sdkInitFailed = true;
    console.warn('[LLM] z-ai-web-dev-sdk non configuré. Ajoutez LLM_BASE_URL et LLM_API_KEY dans .env');
    return null;
  } catch (err) {
    sdkInitFailed = true;
    console.error('[LLM] Erreur initialisation SDK:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Configuration fetch fallback (dernier recours) ──────────────────────────
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
    console.error('[LLM] Aucune configuration LLM disponible. Ajoutez LLM_BASE_URL et LLM_API_KEY dans .env');
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

/**
 * Vérifie si le LLM est configuré et fonctionnel.
 */
export async function verifierLLM(): Promise<{ ok: boolean; erreur?: string }> {
  const sdk = await getSDK();
  if (sdk) return { ok: true };

  if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY) {
    return {
      ok: false,
      erreur: 'LLM non configuré. Ajoutez LLM_BASE_URL et LLM_API_KEY dans les variables d\'environnement (.env).',
    };
  }

  return { ok: false, erreur: 'Erreur d\'initialisation du SDK LLM.' };
}