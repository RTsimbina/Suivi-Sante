/**
 * Service de messagerie centralisé — Transport RESEND (API HTTPS native)
 * ───────────────────────────────────────────────────────────────────────
 * Resend est le fournisseur qui gère le mail de la plateforme. Ce module
 * implémente la voie PRIORITAIRE du moteur de livraison : l'API HTTPS
 * officielle (SDK `resend`) — aucun port SMTP requis, idéale sur Vercel
 * où le port 25 est bloqué et où les connexions sortantes longues sont
 * découragées.
 *
 * Sélection du transport (voir fournisseurActif()) :
 *   - RESEND_API_KEY définie            → API Resend (défaut)
 *   - MAIL_TRANSPORT=smtp (forçage)     → SMTP nodemailer (relais générique)
 *   - MAIL_TRANSPORT=resend (forçage)   → API Resend obligatoire (erreur
 *     claire si la clé manque)
 *
 * L'SMTP (smtp.resend.com:587, utilisateur littéral « resend », mot de
 * passe = clé API) reste disponible comme fallback — voir docs/MESSAGERIE.md.
 *
 * Sécurité : la clé RESEND_API_KEY ne quitte JAMAIS ce module (jamais
 * journalisée, jamais renvoyée à l'UI — seuls le statut et les domaines
 * vérifiés sont exposés).
 */

import { Resend } from 'resend';
import type { MessageLivraison, ResultatLivraison } from './delivery';

// ─── Sélection du fournisseur ────────────────────────────────────────────────

export type FournisseurMail = 'resend' | 'smtp';

/** Valeur normalisée de MAIL_TRANSPORT (auto | resend | smtp). */
export function transportDemande(): 'auto' | 'resend' | 'smtp' {
  const brut = (process.env.MAIL_TRANSPORT || 'auto').trim().toLowerCase();
  return brut === 'resend' || brut === 'smtp' ? brut : 'auto';
}

/**
 * Fournisseur effectivement utilisé par le moteur de livraison :
 *   - MAIL_TRANSPORT force explicitement (resend gagne si la clé existe) ;
 *   - en auto : Resend dès que RESEND_API_KEY est définie, sinon SMTP.
 */
export function fournisseurActif(): FournisseurMail {
  const demande = transportDemande();
  const clePresente = !!process.env.RESEND_API_KEY;
  if (demande === 'smtp') return 'smtp';
  if (demande === 'resend') return 'resend'; // clé manquante → erreur claire à l'envoi
  // Auto : Resend dès que la clé existe, sinon SMTP (comportement historique)
  return clePresente ? 'resend' : 'smtp';
}

// ─── Client SDK (singleton par clé) ──────────────────────────────────────────

let _client: Resend | null = null;
let _cleUtilisee = '';

function clientResend(): Resend {
  const cle = process.env.RESEND_API_KEY || '';
  if (!_client || _cleUtilisee !== cle) {
    _client = new Resend(cle);
    _cleUtilisee = cle;
  }
  return _client;
}

// ─── Classification des erreurs Resend (fonction pure, testée) ───────────────

/** Codes SDK dont l'échec est DÉFINITIF — retenter ne changerait rien. */
const ERREURS_PERMANENTES = [
  'invalid_api_key', 'restricted_api_key', 'missing_api_key', // clé
  'validation_error', 'invalid_parameter', 'missing_required_field', // requête
  'invalid_attachment', 'invalid_from_address', // contenu
  'invalid_access', 'security_error', 'invalid_region', // autorisations
  'not_found', 'method_not_allowed', // API
  'invalid_idempotency_key', 'invalid_idempotent_request', 'concurrent_idempotent_requests',
] as const;

/** Codes SDK TRANSITOIRES — la file doit réessayer (backoff). */
const ERREURS_TEMPORAIRES = [
  'rate_limit_exceeded', // 429 — ralentir puis retenter
  'daily_quota_exceeded', 'monthly_quota_exceeded', // quota : capacité, pas faute du message
  'internal_server_error', 'application_error', // 5xx côté Resend
] as const;

/**
 * Détermine si une erreur Resend est temporaire (→ retry avec backoff) ou
 * permanente (→ abandon immédiat). Analyse le message brut (name + message
 * concaténés) pour rester testable sans dépendre du type SDK exact.
 */
export function classerErreurResend(messageBrut: string): { temporaire: boolean } {
  const m = (messageBrut || '').toLowerCase();

  for (const code of ERREURS_TEMPORAIRES) {
    if (m.includes(code)) return { temporaire: true };
  }
  // Variantes textuelles des erreurs réseau / HTTP transitoires
  if (
    m.includes('429') || m.includes('rate limit') || m.includes('too many requests') ||
    m.includes('quota') ||
    m.includes('500') || m.includes('502') || m.includes('503') || m.includes('504') ||
    m.includes('internal server error') || m.includes('bad gateway') || m.includes('service unavailable') ||
    m.includes('econnrefused') || m.includes('econnreset') || m.includes('etimedout') ||
    m.includes('timeout') || m.includes('network') || m.includes('fetch failed') ||
    m.includes('enotfound') || m.includes('eai_again')
  ) {
    return { temporaire: true };
  }

  for (const code of ERREURS_PERMANENTES) {
    if (m.includes(code)) return { temporaire: false };
  }
  if (
    m.includes('401') || m.includes('unauthorized') || m.includes('api key') ||
    m.includes('403') || m.includes('forbidden') || m.includes('not verified') ||
    m.includes('422') || m.includes('validation')
  ) {
    return { temporaire: false };
  }

  // Par défaut : temporaire (les retries restent bornés par maxTentatives)
  return { temporaire: true };
}

/** Message d'aide en français pour une erreur Resend. */
export function interpreterErreurResend(messageBrut: string): string {
  const m = (messageBrut || '').toLowerCase();

  if (m.includes('invalid_api_key') || m.includes('missing_api_key') || m.includes('unauthorized')) {
    return 'Clé API Resend invalide ou absente — vérifiez RESEND_API_KEY dans les variables d\'environnement (Dashboard Resend → API Keys, format re_…).';
  }
  if (m.includes('restricted_api_key') || m.includes('invalid_access')) {
    return 'Clé API Resend restreinte — la clé n\'a pas l\'accès d\'envoi complet requis. Créez une clé « full access » ou ajustez ses permissions.';
  }
  if (m.includes('invalid_from_address') || m.includes('not verified') || m.includes('domain')) {
    return 'Expéditeur refusé par Resend — le domaine du From doit être vérifié dans le dashboard Resend (Domains → Verify), ou utilisez l\'expéditeur de test onboarding@resend.dev en mode test.';
  }
  if (m.includes('daily_quota_exceeded') || m.includes('monthly_quota_exceeded')) {
    return 'Quota Resend atteint (plan gratuit : 100 e-mails/jour, 3 000/mois) — la file d\'attente réessaiera automatiquement ; surveillez le dashboard Resend.';
  }
  if (m.includes('rate_limit_exceeded') || m.includes('429')) {
    return 'Limite de débit Resend atteinte — nouvelle tentative automatique avec backoff.';
  }
  if (m.includes('validation_error') || m.includes('422')) {
    return `Requête refusée par Resend : ${messageBrut}`;
  }
  return `Erreur Resend : ${messageBrut}`;
}

// ─── Envoi via l'API Resend ──────────────────────────────────────────────────

/**
 * Envoie UN message via l'API HTTPS Resend. Ne décide PAS des retries :
 * renvoie seulement le verdict au module file (comme livrerMessage SMTP).
 * L'expéditeur (`from`) est résolu par l'appelant (delivery.ts / email.ts).
 */
export async function envoyerViaResend(
  msg: MessageLivraison & { from: string }
): Promise<ResultatLivraison> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      temporaire: true,
      erreur: 'RESEND_API_KEY absente — message conservé en file d\'attente.',
    };
  }

  try {
    // Contenu discriminé : l'union CreateEmailOptions du SDK exige au moins
    // un corps (html, texte ou template) — html+texte = corps alterné.
    const base = {
      from: msg.from,
      to: msg.destinataires.to,
      cc: msg.destinataires.cc?.length ? msg.destinataires.cc : undefined,
      bcc: msg.destinataires.bcc?.length ? msg.destinataires.bcc : undefined,
      subject: msg.sujet,
      replyTo: msg.replyTo || undefined,
      attachments: msg.piecesJointes?.length
        ? msg.piecesJointes.map((p) => ({
            filename: p.nom,
            // Le SDK accepte une chaîne base64 telle quelle (Buffer aussi)
            content: p.contenuBase64,
            contentType: p.contentType || undefined,
          }))
        : undefined,
    };
    const chargeUtile = msg.html
      ? { ...base, html: msg.html, text: msg.texte || undefined }
      : msg.texte
        ? { ...base, text: msg.texte }
        : null;
    if (!chargeUtile) {
      return {
        ok: false,
        temporaire: false,
        erreur: 'Aucun contenu (texte ou html) — envoi impossible via Resend.',
      };
    }

    const { data, error } = await clientResend().emails.send(chargeUtile);

    if (error) {
      const brut = [error.name, error.message].filter(Boolean).join(' : ');
      const { temporaire } = classerErreurResend(brut);
      return {
        ok: false,
        temporaire,
        erreur: interpreterErreurResend(brut).slice(0, 1000),
      };
    }

    return { ok: true, messageId: data?.id };
  } catch (e: unknown) {
    // Exceptions réseau / SDK non converties en { error }
    const message = e instanceof Error ? e.message : String(e);
    const { temporaire } = classerErreurResend(message);
    return { ok: false, temporaire, erreur: message.slice(0, 1000) };
  }
}

// ─── Vérification de la configuration Resend ─────────────────────────────────

export interface ResultatVerificationResend {
  ok: boolean;
  erreur?: string;
  /** Premier domaine vérifié trouvé (mode production possible) */
  domaineVerifie?: string;
  /** Inventaire des domaines du compte Resend (aucune donnée sensible) */
  domaines?: { nom: string; statut: string }[];
  /** Avertissement de configuration (mode test, domaine absent…) */
  avertissement?: string;
}

/**
 * Vérifie que la clé Resend est valide et qu'au moins un domaine est vérifié.
 * Utilisée par verifierSMTP() (page Configuration) quand Resend est actif —
 * un appel HTTPS à l'API remplace le handshake SMTP.
 */
export async function verifierResend(): Promise<ResultatVerificationResend> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      erreur:
        'RESEND_API_KEY absente — ajoutez la clé API Resend (re_…) dans les variables d\'environnement Vercel, puis redéployez.',
    };
  }

  try {
    const { data, error } = await clientResend().domains.list();
    if (error) {
      const brut = [error.name, error.message].filter(Boolean).join(' : ');
      return { ok: false, erreur: interpreterErreurResend(brut) };
    }

    const domaines = (data?.data ?? []).map((d) => ({ nom: d.name, statut: d.status }));
    const verifie = domaines.find((d) => d.statut === 'verified');

    if (!verifie) {
      return {
        ok: true,
        domaines,
        avertissement:
          domaines.length === 0
            ? 'Aucun domaine enregistré dans Resend : le compte reste en mode test (envoi uniquement vers l\'adresse du compte). Ajoutez le domaine d\'expédition dans Resend → Domains et publiez ses enregistrements DNS.'
            : 'Aucun domaine vérifié dans Resend : publication DNS à finaliser puis « Verify » dans le dashboard (mode test tant que non vérifié).',
      };
    }

    return { ok: true, domaineVerifie: verifie.nom, domaines };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: `Erreur de connexion à l'API Resend : ${message}` };
  }
}
