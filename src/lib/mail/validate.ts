/**
 * Service de messagerie centralisé — Module VALIDATION
 * ─────────────────────────────────────────────────────────
 * Valide et normalise les adresses e-mail AVANT toute mise en file :
 *   - syntaxe RFC 5322 (simplifiée, pragmatique)
 *   - longueur maximale (RFC : 64 octets partie locale, 254 au total)
 *   - interdiction des injections d'en-têtes (CRLF)
 *   - normalisation anti-contournement (Gmail ignore les points et les "+tags")
 *   - vérification DNS/MX optionnelle ( MAIL_MX_CHECK=true ) : le domaine du
 *     destinataire doit publier un enregistrement MX (ou A en secours) sinon
 *     le message ne part jamais — évite les bounces inutiles et les abus.
 */

import dns from 'dns';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const LONGUEUR_EMAIL_MAX = 254;   // RFC 5321 — chemin complet
export const LONGUEUR_LOCALE_MAX = 64;   // RFC 5321 — partie locale

/**
 * RFC 5322 simplifié et pragmatique :
 *  - partie locale : caractères courants autorisés (atext + points non consécutifs)
 *  - domaine : labels alphanumériques + tirets, au moins un point (TLD >= 2)
 */
const RE_EMAIL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// ─── Résultat de validation ──────────────────────────────────────────────────

export interface ResultatValidation {
  valide: boolean;
  /** Adresse normalisée (trim + minuscules) si syntaxe OK */
  normalisee?: string;
  /** Motif de rejet (FR, pour réponse API et logs) */
  motif?: string;
  /** true = problème structurel qui ne se corrigera pas tout seul (retry inutile) */
  permanent?: boolean;
}

// ─── Injection d'en-têtes ────────────────────────────────────────────────────

/**
 * Détecte une tentative d'injection d'en-tête SMTP (CRLF dans le sujet,
 * l'expéditeur, les adresses...). À tester sur TOUT champ construisant le
 * message, jamais sur le corps.
 */
export function detecterInjectionEnTete(valeur: string): boolean {
  if (typeof valeur !== 'string') return true;
  // CR, LF isolés, octet NULL
  return /[\r\n\u0000]/.test(valeur);
}

// ─── Validation d'une adresse ────────────────────────────────────────────────

export function validerAdresse(brute: unknown): ResultatValidation {
  if (typeof brute !== 'string') {
    return { valide: false, motif: 'Adresse e-mail manquante ou de type invalide.', permanent: true };
  }

  const adresse = brute.trim().toLowerCase();

  if (adresse.length === 0) {
    return { valide: false, motif: 'Adresse e-mail vide.', permanent: true };
  }
  if (detecterInjectionEnTete(adresse)) {
    return { valide: false, motif: 'Caractères interdits (retour à la ligne) dans l’adresse e-mail.', permanent: true };
  }
  if (adresse.length > LONGUEUR_EMAIL_MAX) {
    return { valide: false, motif: `Adresse e-mail trop longue (max ${LONGUEUR_EMAIL_MAX} caractères).`, permanent: true };
  }

  const at = adresse.lastIndexOf('@');
  if (at <= 0 || at === adresse.length - 1) {
    return { valide: false, motif: 'Adresse e-mail mal formée.', permanent: true };
  }

  const locale = adresse.slice(0, at);
  const domaine = adresse.slice(at + 1);

  if (locale.length > LONGUEUR_LOCALE_MAX) {
    return { valide: false, motif: 'Partie locale de l’adresse trop longue (max 64 caractères).', permanent: true };
  }
  if (!RE_EMAIL.test(adresse)) {
    return { valide: false, motif: 'Format d’adresse e-mail invalide.', permanent: true };
  }
  if (domaine.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) {
    return { valide: false, motif: 'Nom de domaine invalide.', permanent: true };
  }

  return { valide: true, normalisee: adresse };
}

// ─── Normalisation anti-contournement (rate-limit par destinataire) ──────────

/**
 * Clé de comptage par destinataire :
 *   - coupe le "+tag" (alias)
 *   - pour Gmail/Googlemail : supprime les points de la partie locale
 *     (user.nom+x1@gmail.com === usernom@gmail.com pour Google)
 * Cela empêche de contourner le plafond par destinataire avec des variantes.
 */
export function normaliserDestinataire(adresse: string): string {
  const a = adresse.trim().toLowerCase();
  const at = a.lastIndexOf('@');
  if (at <= 0) return a;
  let locale = a.slice(0, at);
  const domaine = a.slice(at + 1);

  const idxPlus = locale.indexOf('+');
  if (idxPlus > 0) locale = locale.slice(0, idxPlus);

  if (domaine === 'gmail.com' || domaine === 'googlemail.com') {
    locale = locale.replace(/\./g, '');
  }
  return `${locale}@${domaine}`;
}

// ─── Vérification DNS/MX du domaine (moteur de livraison) ────────────────────

export interface ResultatMX {
  /** Le domaine peut recevoir du courrier */
  livrable: boolean;
  /** true = défaillance DNS transitoire → le message peut être remis en file */
  temporaire?: boolean;
  /** Hôtes MX trouvés (ordre de priorité), pour logs */
  mx?: string[];
  motif?: string;
}

type ResolverMx = (domaine: string) => Promise<{ exchange: string; priority: number }[]>;

const resolverDns: ResolverMx = (domaine) => dns.promises.resolveMx(domaine);

const _cacheMX = new Map<string, { result: ResultatMX; expire: number }>();
const TTL_MX_OK = 10 * 60 * 1000;      // succès : 10 min
const TTL_MX_ERREUR = 3 * 60 * 1000;   // échec : 3 min (retry rapide)

/**
 * Vérifie que le domaine du destinataire déclare un serveur de messagerie.
 *  - MX présent                        → livrable
 *  - pas de MX mais enregistrement A   → livrable (RFC 5321 §5.1)
 *  - domaine inexistant (ENOTFOUND)    → non livrable, permanent
 *  - DNS en échec (timeout, SERVFAIL)  → temporaire, on réessaiera
 *
 * Résultats mis en cache (Map mémoire) pour ne pas marteler le DNS.
 * Un `resolver` peut être injecté (tests unitaires).
 */
export async function verifierDomaineLivraison(
  domaine: string,
  resolver: ResolverMx = resolverDns
): Promise<ResultatMX> {
  const cle = domaine.toLowerCase();
  const enCache = _cacheMX.get(cle);
  if (enCache && Date.now() < enCache.expire) return enCache.result;

  let result: ResultatMX;
  try {
    const mx = await resolver(cle);
    if (mx && mx.length > 0) {
      const triees = [...mx].sort((a, b) => a.priority - b.priority).map((m) => m.exchange);
      result = { livrable: true, mx: triees };
    } else {
      // Pas de MX : RFC 5321 autorise la remise vers l'enregistrement A/AAAA
      let aRecords: string[] = [];
      try {
        aRecords = await dns.promises.resolve4(cle);
      } catch {
        try {
          aRecords = await dns.promises.resolve6(cle);
        } catch {
          aRecords = [];
        }
      }
      if (aRecords.length > 0) {
        result = { livrable: true, mx: [], motif: 'Pas de MX, remise A/AAAA possible' };
      } else {
        result = { livrable: false, motif: `Aucun serveur de messagerie (MX/A) pour « ${cle} ».` };
      }
    }
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code || '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      result = { livrable: false, motif: `Domaine « ${cle} » inexistant ou sans messagerie.` };
    } else {
      // ETIMEDOUT, ESERVFAIL, EAI_AGAIN... défaillance transitoire
      result = { livrable: false, temporaire: true, motif: `Recherche DNS indisponible (${code || 'erreur'}).` };
    }
  }

  const ttl = result.livrable || result.temporaire ? TTL_MX_OK : TTL_MX_ERREUR;
  _cacheMX.set(cle, { result, expire: Date.now() + ttl });
  return result;
}

/** Réinitialise le cache MX (tests). */
export function viderCacheMX() {
  _cacheMX.clear();
}
