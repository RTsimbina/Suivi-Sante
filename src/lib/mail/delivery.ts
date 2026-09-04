/**
 * Service de messagerie centralisé — Module MOTEUR DE LIVRAISON
 * ─────────────────────────────────────────────────────────────
 * Remet physiquement le message au serveur SMTP (le « MAIL SERVICE » de
 * l'architecture cible délègue la remise finale à ce moteur) :
 *
 *   file d'attente (queue.ts)
 *        │  réclame un message
 *        ▼
 *   ce module : SMTP + erreurs classées
 *        │
 *        ├─ succès        → messageId (traçabilité bout en bout)
 *        ├─ erreur tempo. → remise en file (retry + backoff, voir queue.ts)
 *        └─ erreur perm.  → abandon définitif (ECHEC), pas de spam de retries
 *
 * Remarque architecture : la plateforme ne parle JAMAIS directement aux
 * serveurs Gmail/Yahoo/Outlook. Elle parle à SON relais SMTP (fournisseur
 * spécialisé — Brevo, SMTP2GO, Mailgun, SES… — ou serveur de messagerie
 * maison), qui résout le DNS/MX du destinataire et fait la remise finale.
 * Les enregistrements SPF/DKIM/DMARC du domaine d'envoi valident cette remise.
 */

import nodemailer from 'nodemailer';
import { getTransporter, getSmtpConfig } from '../email';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PieceJointe {
  nom: string;
  contenuBase64: string;
  contentType?: string;
}

export interface MessageLivraison {
  id: string;                       // id CourrielSortant (pour les logs)
  destinataires: { to: string[]; cc?: string[]; bcc?: string[] };
  sujet: string;
  texte?: string | null;
  html?: string | null;
  piecesJointes?: { nom: string; contenuBase64: string; contentType?: string }[] | null;
  fromPersonnalise?: string | null;
  replyTo?: string | null;
}

export interface ResultatLivraison {
  ok: boolean;
  /** Message-ID renvoyé par le relais SMTP (si envoi réussi) */
  messageId?: string;
  erreur?: string;
  /** true = défaillance transitoire → remettre en file et réessayer */
  temporaire?: boolean;
}

// ─── Classification des erreurs SMTP ─────────────────────────────────────────

/**
 * Codes SMTP 4xx = erreur temporaire (grislisting, surcharge…).
 * 552 = « dépassement de quota de stockage » → temporaire aussi (RFC 5321).
 */
const CODES_TEMPORAIRES = new Set(['421', '450', '451', '452', '454', '458', '459', '552']);

/** Ports SMTP usuels — à exclure pour ne pas les confondre avec des codes SMTP. */
const PORTS_SMTP = /\b(25|465|587|2525|2465|9465)\b/g;

/**
 * Détermine si une erreur d'envoi est temporaire (→ retry avec backoff) ou
 * permanente (→ abandon immédiat : retry inutile).
 *
 * Ordre des heuristiques (de la plus fiable à la plus large) :
 *   1. codes système Node / libellés réseau       → temporaire
 *   2. libellés d'échec définitif (auth, relay…)  → permanent
 *   3. code étendu X.Y.Z (5.1.1, 4.7.0…) — format
 *      normalisé émis par Gmail/M365/relais       → classe du 1er chiffre
 *   4. code SMTP simple 4xx/5xx (hors ports)      → classe du 1er chiffre
 *   5. par défaut : temporaire (retries bornés par maxTentatives)
 */
export function classerErreurSMTP(messageBrut: string): { temporaire: boolean } {
  let m = (messageBrut || '').toLowerCase();

  // 1. Codes système / réseau — transitoires
  const reseau = [
    'econnrefused', 'econnreset', 'etimedout', 'timeout', 'timed out',
    'eai_again', 'esocket', 'ehostunreach', 'enetunreach', 'econnaborted',
    'connection closed', 'connection ended', 'upstream', 'bad gateway',
    'greylist', 'graylist', 'deferred', 'temporar', 'try again', 'try later',
    'server busy', 'throttl', 'tls handshake', 'dns',
  ];
  if (reseau.some((k) => m.includes(k))) return { temporaire: true };

  // 2. Échecs définitifs — retenter ne changerait rien
  const permanent = [
    'auth', 'authentication', 'invalid login', 'username and password not accepted',
    'unknown user', 'no such user', 'user not found',
    'recipient rejected', 'address rejected', 'invalid recipient',
    'mailbox unavailable', 'mailbox not found', 'no such domain', 'domain not found',
    'host unknown', 'relay access denied', 'relay denied', 'not our customer',
    'blocked using', 'blacklist', 'policy',
  ];
  if (permanent.some((k) => m.includes(k))) return { temporaire: false };

  // 3. Code SMTP simple 3 chiffres (ports exclus pour éviter 587/465…)
  //    — prioritaire sur le code étendu : l'exception 552 (boîte pleine =
  //    temporaire) doit l'emporter sur son code étendu 5.2.2.
  m = m.replace(PORTS_SMTP, ' ');
  const matchCode = m.match(/\b([45]\d{2})\b/);
  if (matchCode) {
    const code = matchCode[1];
    if (code.startsWith('4')) return { temporaire: true };
    return { temporaire: CODES_TEMPORAIRES.has(code) };
  }

  // 4. Code étendu X.Y.Z sans code simple — le 1er chiffre donne la classe
  const matchEtendu = m.match(/\b([45])\.\d{1,3}\.\d{1,3}\b/);
  if (matchEtendu) return { temporaire: matchEtendu[1] === '4' };

  // 5. Par défaut : temporaire (le nombre de retries reste borné)
  return { temporaire: true };
}

// ─── Livraison effective ─────────────────────────────────────────────────────

/**
 * Envoie UN message via le relais SMTP configuré (ConfigurationEmail ou env).
 * Ne décide PAS des retries : renvoie seulement le verdict au module file.
 */
export async function livrerMessage(msg: MessageLivraison): Promise<ResultatLivraison> {
  try {
    const config = await getSmtpConfig();
    if (!config) {
      // Configuration absente = transitoire : le message RESTE en file et sera
      // livré dès que le SMTP sera configuré (page Configuration ou env).
      return { ok: false, temporaire: true, erreur: 'SMTP non configuré — message conservé en file d\'attente.' };
    }
    const transporter = await getTransporter();

    const options: nodemailer.SendMailOptions = {
      from: msg.fromPersonnalise || config.from,
      to: msg.destinataires.to.join(', '),
      cc: msg.destinataires.cc?.length ? msg.destinataires.cc.join(', ') : undefined,
      bcc: msg.destinataires.bcc?.length ? msg.destinataires.bcc.join(', ') : undefined,
      subject: msg.sujet,
      text: msg.texte || undefined,
      html: msg.html || undefined,
      replyTo: msg.replyTo || undefined,
      attachments: msg.piecesJointes?.map((p) => ({
        filename: p.nom,
        content: Buffer.from(p.contenuBase64, 'base64'),
        contentType: p.contentType || 'application/octet-stream',
      })),
    };

    const info = await transporter.sendMail(options);
    return { ok: true, messageId: info.messageId };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const { temporaire } = classerErreurSMTP(message);
    return { ok: false, erreur: message.slice(0, 1000), temporaire };
  }
}

/**
 * Vérifie que le relais SMTP est joignable ( utilisé par la page Configuration ).
 * Délègue à email.ts pour la compatibilité, mais expose le verdict au service central.
 */
export async function verifierRelaisSMTP(): Promise<{ ok: boolean; erreur?: string }> {
  const { verifierSMTP } = await import('../email');
  return verifierSMTP();
}
