/**
 * Service de messagerie centralisé — Module ANTI-ABUS
 * ─────────────────────────────────────────────────────────
 * Barrières applicatives contre le détournement de la plateforme
 * (spam, mail-bombing, exfiltration) :
 *   - liste noire de domaines jetables (fiables pour créer des boîtes éphémères)
 *   - liste noire personnalisée  : MAIL_BLOCKED_DOMAINS  (virgules)
 *   - liste blanche facultative  : MAIL_ALLOWED_DOMAINS  (si définie, seuls ces domaines partent)
 *   - plafond du nombre de destinataires par message
 *   - plafond de taille du corps (texte + html) et des pièces jointes
 * Le rate-limiting (volume par destinataire / global) est dans rate-limit.ts.
 */

import { validerAdresse, LONGUEUR_EMAIL_MAX } from './validate';

// ─── Configuration (variables d'environnement, valeurs par défaut sûres) ─────

const envInt = (nom: string, defaut: number): number => {
  const v = Number(process.env[nom]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : defaut;
};

export const LIMITES = {
  /** Nombre maximal de destinataires (to + cc + bcc) par message */
  get MAX_DESTINATAIRES_MESSAGE() { return envInt('MAIL_MAX_RECIPIENTS', 25); },
  /** Taille maximale du corps texte+html, en kilo-octets */
  get MAX_CORPS_KO() { return envInt('MAIL_MAX_BODY_KB', 512); },
  /** Taille maximale cumulée des pièces jointes (base64), en kilo-octets */
  get MAX_PIECES_JOINTES_KO() { return envInt('MAIL_MAX_ATTACHMENTS_KB', 8192); },
  /** Nombre maximal de pièces jointes par message */
  get MAX_PIECES_JOINTES() { return envInt('MAIL_MAX_ATTACHMENTS', 5); },
};

/** Domaines jetables bloqués par défaut (extensible via MAIL_BLOCKED_DOMAINS). */
export const DOMAINES_JETABLES = new Set<string>([
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'tempmailo.com',
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net',
  'trashmail.com', 'trashmail.de', 'maildrop.cc', 'dispostable.com',
  'throwawaymail.com', 'getnada.com', 'getairmail.com', 'fakeinbox.com',
  'sharklasers.com', 'grr.la', 'spam4.me', 'burnermail.io', 'mailnesia.com',
  'moakt.com', 'mohmal.com', 'emailondeck.com', 'mailcatch.com', 'inboxbear.com',
]);

function parseListeEnv(nom: string): string[] {
  const brut = (process.env[nom] || '').trim();
  if (!brut) return [];
  return brut
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

let _blacklistCache: Set<string> | null = null;
let _whitelistCache: Set<string> | null = null;
let _cacheExpire = 0;

function blacklist(): Set<string> {
  rafraichirListes();
  return _blacklistCache!;
}
function whitelist(): Set<string> {
  rafraichirListes();
  return _whitelistCache!;
}

function rafraichirListes() {
  if (_blacklistCache && _whitelistCache && Date.now() < _cacheExpire) return;
  _blacklistCache = new Set([...DOMAINES_JETABLES, ...parseListeEnv('MAIL_BLOCKED_DOMAINS')]);
  const wl = parseListeEnv('MAIL_ALLOWED_DOMAINS');
  _whitelistCache = wl.length > 0 ? new Set(wl) : null; // null = tout autorisé
  _cacheExpire = Date.now() + 60 * 1000; // re-lecture des env toutes les 60 s (tests)
}

/** Tests — force la relecture des variables d'environnement. */
export function viderCacheListes() {
  _blacklistCache = null;
  _whitelistCache = null;
  _cacheExpire = 0;
}

// ─── Contrôle d'un message complet ───────────────────────────────────────────

export interface ResultatAntiAbus {
  autorise: boolean;
  motif?: string;
  /** true = rejet définitif (pas de sens à retenter) */
  permanent?: boolean;
}

/**
 * Contrôles anti-abus applicables à UNE demande d'envoi.
 * Les adresses doivent être validées au préalable (validate.validerAdresse).
 */
export function controlerMessage(opts: {
  destinataires: string[];
  cc?: string[];
  bcc?: string[];
  sujet: string;
  texte?: string;
  html?: string;
  piecesJointes?: { nom: string; contenuBase64: string; contentType?: string }[];
}): ResultatAntiAbus {
  const to = opts.destinataires;
  const cc = opts.cc ?? [];
  const bcc = opts.bcc ?? [];
  const total = to.length + cc.length + bcc.length;

  // 1. Volume de destinataires
  if (total === 0) {
    return { autorise: false, motif: 'Aucun destinataire fourni.', permanent: true };
  }
  if (total > LIMITES.MAX_DESTINATAIRES_MESSAGE) {
    return {
      autorise: false,
      motif: `Trop de destinataires (${total}) — maximum ${LIMITES.MAX_DESTINATAIRES_MESSAGE} par message.`,
      permanent: true,
    };
  }

  // 2. Domaines interdits / liste blanche
  for (const adresse of [...to, ...cc, ...bcc]) {
    const domaine = adresse.slice(adresse.lastIndexOf('@') + 1);
    if (blacklist().has(domaine)) {
      return { autorise: false, motif: `Le domaine « ${domaine} » est bloqué (adresse jetable ou liste noire).`, permanent: true };
    }
    const wl = whitelist();
    if (wl && !wl.has(domaine)) {
      return { autorise: false, motif: `Le domaine « ${domaine} » n’est pas dans la liste des domaines autorisés.`, permanent: true };
    }
  }

  // 3. Taille du corps
  const corpsKo = ((opts.texte?.length ?? 0) + (opts.html?.length ?? 0)) / 1024;
  if (corpsKo > LIMITES.MAX_CORPS_KO) {
    return {
      autorise: false,
      motif: `Corps du message trop volumineux (${Math.ceil(corpsKo)} Ko) — maximum ${LIMITES.MAX_CORPS_KO} Ko.`,
      permanent: true,
    };
  }

  // 4. Pièces jointes
  if (opts.piecesJointes && opts.piecesJointes.length > 0) {
    if (opts.piecesJointes.length > LIMITES.MAX_PIECES_JOINTES) {
      return {
        autorise: false,
        motif: `Trop de pièces jointes (${opts.piecesJointes.length}) — maximum ${LIMITES.MAX_PIECES_JOINTES}.`,
        permanent: true,
      };
    }
    const totalPjKo = opts.piecesJointes.reduce((s, p) => s + (p.contenuBase64?.length ?? 0), 0) / 1024;
    if (totalPjKo > LIMITES.MAX_PIECES_JOINTES_KO) {
      return {
        autorise: false,
        motif: `Pièces jointes trop volumineuses (${Math.ceil(totalPjKo)} Ko) — maximum ${LIMITES.MAX_PIECES_JOINTES_KO} Ko.`,
        permanent: true,
      };
    }
  }

  return { autorise: true };
}

// ─── Contrôle de l'enveloppe d'expédition ────────────────────────────────────

/**
 * Vérifie l'expéditeur personnalisé et le Reply-To (formats + injection).
 * Formats acceptés : "adresse@domaine.tld" ou "Nom Complet <adresse@domaine.tld>".
 */
export function controlerExpediteur(fromPersonnalise?: string, replyTo?: string): ResultatAntiAbus {
  const extraireAdresse = (v: string): string | null => {
    const m = v.match(/<([^>]+)>/);
    return (m ? m[1] : v).trim();
  };

  if (fromPersonnalise !== undefined) {
    if (typeof fromPersonnalise !== 'string' || fromPersonnalise.length === 0 || fromPersonnalise.length > LONGUEUR_EMAIL_MAX + 100) {
      return { autorise: false, motif: 'Expéditeur personnalisé invalide.', permanent: true };
    }
    if (/[<>]/.test(fromPersonnalise) && !/^.{1,100}<[^\s<>]+@[^\s<>]+\.[^\s<>]+>$/.test(fromPersonnalise)) {
      return { autorise: false, motif: 'Format de l’expéditeur personnalisé invalide (attendu : "Nom <adresse@domaine>").', permanent: true };
    }
    const adresse = extraireAdresse(fromPersonnalise);
    if (!adresse || !validerAdresse(adresse).valide) {
      return { autorise: false, motif: 'Adresse de l’expéditeur personnalisé invalide.', permanent: true };
    }
  }

  if (replyTo !== undefined && replyTo !== null && replyTo !== '') {
    if (typeof replyTo !== 'string' || !validerAdresse(replyTo).valide) {
      return { autorise: false, motif: 'Adresse Reply-To invalide.', permanent: true };
    }
  }

  return { autorise: true };
}
