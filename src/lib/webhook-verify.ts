/**
 * webhook-verify.ts — Vérification cryptographique des webhooks entrants
 *
 * - Telegram  : comparaison du header X-Telegram-Bot-Api-Secret-Token
 * - WhatsApp   : HMAC-SHA256 du body brut via header X-Hub-Signature-256
 * - Messenger  : HMAC-SHA256 du body brut via header X-Hub-Signature-256
 *
 * Toute requête non signée ou mal signée est rejetée (401).
 */

import { NextResponse } from 'next/server';
import {
  checkRateLimit as checkSharedRateLimit,
  getClientIp,
  intFromEnv,
} from './rate-limit';

// ─── Helpers crypto ───────────────────────────────────────────────────────────

async function hmacSha256(secret: string, payload: ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, payload);
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const result = new Uint8Array(aBuf.length);
  for (let i = 0; i < aBuf.length; i++) {
    result[i] = aBuf[i] ^ bBuf[i];
  }
  return result.every(v => v === 0);
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

/**
 * Telegram Bot API 7.0+ envoie le header `X-Telegram-Bot-Api-Secret-Token`
 * défini au moment du setWebhook. On le compare directement.
 */
export function verifyTelegram(
  headerValue: string | null,
  secretToken: string,
): boolean {
  if (!secretToken) return false;
  if (!headerValue) return false;
  return timingSafeEqual(headerValue, secretToken);
}

// ─── Meta (WhatsApp / Messenger) ──────────────────────────────────────────────

/**
 * Meta envoie `X-Hub-Signature-256: sha256=<hex>`.
 * On recalcule le HMAC-SHA256 du body brut avec l'App Secret
 * et on compare en temps constant.
 */
export async function verifyMeta(
  headerValue: string | null,
  appSecret: string,
  rawBody: ArrayBuffer,
): Promise<boolean> {
  if (!appSecret) return false;
  if (!headerValue || !headerValue.startsWith('sha256=')) return false;

  const expectedHex = headerValue.slice(7);
  if (expectedHex.length !== 64 || !/^[0-9a-f]{64}$/.test(expectedHex)) {
    return false;
  }

  const computedHex = await hmacSha256(appSecret, rawBody);
  return timingSafeEqual(computedHex, expectedHex);
}

// ─── Réponses d'erreur standardisées ───────────────────────────────────────────

export function webhookUnauthorized(reason: string) {
  console.warn(`[WEBHOOK] Rejeté — ${reason}`);
  return NextResponse.json(
    { error: 'Unauthorized', reason },
    { status: 401 },
  );
}

// ─── Rate limiter (par IP, stockage partagé Redis) ────────────────────────────
// Remplace l'ancien Map en mémoire du processus : les compteurs sont désormais
// partagés entre toutes les instances serverless (opération atomique
// INCR + EXPIRE dans Redis). Sans Redis configuré, bascule automatique en
// mémoire locale (développement mono-instance).

const WEBHOOK_IP_LIMIT = intFromEnv('WEBHOOK_IP_LIMIT', 30);
const WEBHOOK_IP_WINDOW_SECONDS = intFromEnv('WEBHOOK_IP_WINDOW_SECONDS', 60);

export async function checkRateLimit(ip: string): Promise<boolean> {
  const result = await checkSharedRateLimit({
    key: `webhook:ip:${ip}`,
    limit: WEBHOOK_IP_LIMIT,
    windowSeconds: WEBHOOK_IP_WINDOW_SECONDS,
  });
  return result.allowed;
}

// getClientIp est désormais implémenté dans rate-limit.ts (accepte aussi bien
// des Headers fetch que le Record d'en-têtes NextAuth) ; on le ré-exporte ici
// pour ne pas casser les imports existants des routes webhook.
export { getClientIp };
