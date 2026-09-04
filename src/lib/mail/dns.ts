/**
 * Service de messagerie centralisé — Vérification DNS du domaine d'expédition
 * ────────────────────────────────────────────────────────────────────────────
 * Plan §18-20 : la page Configuration affiche le statut SPF / DKIM / DMARC
 * du domaine d'expédition. Pour que Gmail / Yahoo / Outlook acceptent les
 * e-mails, le domaine doit prouver que le relais est autorisé à écrire en
 * son nom :
 *
 *   SPF   (TXT @)                    — serveurs autorisés à émettre
 *   DKIM  (TXT <sélecteur>._domainkey) — signature cryptographique
 *   DMARC (TXT _dmarc)               — politique d'alignement + rapports
 *
 * La vérification interroge le DNS public (resolveTxt) — fonctionne en
 * local comme sur Vercel. Les évaluateurs d'enregistrements sont des
 * fonctions pures (testées unitairement) ; seule la résolution DNS est I/O.
 */

import { promises as dns } from 'dns';

// ─── Types ──────────────────────────────────────────────────────────────────

export type StatutVerification = 'PASS' | 'ABSENT' | 'ERREUR';

export interface DetailVerification {
  statut: StatutVerification;
  /** Enregistrement trouvé (tronqué pour l'affichage) */
  enregistrement?: string;
  erreur?: string;
  /** Avertissements de configuration (politique permissive, etc.) */
  avertissements?: string[];
}

export interface ResultatVerificationDns {
  domaine: string;
  selecteurDkim: string;
  spf: DetailVerification;
  dkim: DetailVerification;
  dmarc: DetailVerification;
  verifieLe: string;
  notes: string[];
}

// ─── Évaluateurs purs (testables sans réseau) ──────────────────────────────

/** Concatène les chaînes découpées d'un enregistrement TXT. */
export function concatenerTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(''));
}

/**
 * Évalue un enregistrement SPF trouvé (ou null).
 * SPF correct : commence par v=spf1, se termine par un mécanisme « all ».
 */
export function evaluerSpf(enregistrement: string | null): DetailVerification {
  if (!enregistrement) {
    return {
      statut: 'ABSENT',
      erreur:
        'Aucun enregistrement SPF (v=spf1) à la racine du domaine — publiez la valeur exacte fournie par votre relais (Brevo / SMTP2GO).',
    };
  }
  const avertissements: string[] = [];
  const bas = enregistrement.toLowerCase();
  if (!bas.includes('~all') && !bas.includes('-all') && !bas.includes('?all')) {
    avertissements.push(
      'SPF sans mécanisme « all » strict : ajoutez le suffixe recommandé par votre relais (~all ou -all).'
    );
  }
  if (enregistrement.length > 450) {
    avertissements.push(
      'SPF proche de la limite des 10 résolutions DNS — allégez les include: si la délivrabilité se dégrade.'
    );
  }
  return { statut: 'PASS', enregistrement, avertissements };
}

/**
 * Évalue un enregistrement DMARC trouvé (ou null).
 * Recommandation du plan : commencer en p=none (observation), puis
 * p=quarantine, enfin p=reject une fois tous les flux vérifiés.
 */
export function evaluerDmarc(enregistrement: string | null): DetailVerification {
  if (!enregistrement) {
    return {
      statut: 'ABSENT',
      erreur:
        'Aucun enregistrement DMARC trouvé. Point de départ recommandé : v=DMARC1; p=none; rua=mailto:dmarc@votre-domaine',
    };
  }
  const avertissements: string[] = [];
  const bas = enregistrement.toLowerCase();
  if (bas.includes('p=none')) {
    avertissements.push(
      'Politique p=none (observation) — passez à p=quarantine puis p=reject une fois SPF/DKIM vérifiés sur tous vos flux.'
    );
  }
  if (!bas.includes('rua=')) {
    avertissements.push(
      "Aucune adresse de rapport (rua=) : ajoutez rua=mailto:dmarc@votre-domaine pour recevoir les rapports d'alignement."
    );
  }
  return { statut: 'PASS', enregistrement, avertissements };
}

/** Évalue un enregistrement DKIM trouvé (ou null). */
export function evaluerDkim(enregistrement: string | null): DetailVerification {
  if (!enregistrement) {
    return {
      statut: 'ABSENT',
      erreur:
        'Aucune clé DKIM publiée pour ce sélecteur — publiez l\'enregistrement fourni par votre relais ou ajustez MAIL_DKIM_SELECTOR.',
    };
  }
  const avertissements: string[] = [];
  const bas = enregistrement.toLowerCase();
  if (!bas.includes('p=') || bas.includes('p=')) {
    // Clé présente — rien à signaler ; garde-fou si clé révoquée p=""
    if (/p=;/i.test(enregistrement)) {
      avertissements.push(
        'Clé DKIM révoquée (p= vide) — le relais signe-t-il toujours ? Vérifiez la configuration chez le fournisseur.'
      );
    }
  }
  return { statut: 'PASS', enregistrement, avertissements };
}

/** Extrait le domaine depuis un en-tête From (« Nom <a@b.com> » ou « a@b.com »). */
export function extraireDomaineFrom(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  const adresse = (match ? match[1] : from).trim().toLowerCase();
  const at = adresse.lastIndexOf('@');
  if (at <= 0 || at === adresse.length - 1) return null;
  return adresse.slice(at + 1);
}

// ─── Résolution DNS (I/O) ───────────────────────────────────────────────────

async function chercherTxt(fqdn: string): Promise<string[] | null> {
  try {
    return concatenerTxt(await dns.resolveTxt(fqdn));
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENODATA' || code === 'ENOTFOUND') return null;
    throw e;
  }
}

/** Vérifie SPF : TXT à la racine du domaine. */
async function verifierSpf(domaine: string): Promise<DetailVerification> {
  try {
    const records = await chercherTxt(domaine);
    const spf = records?.find((r) => r.toLowerCase().startsWith('v=spf1')) ?? null;
    return evaluerSpf(spf);
  } catch (e: unknown) {
    return { statut: 'ERREUR', erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Vérifie DKIM : TXT <sélecteur>._domainkey.<domaine>. */
async function verifierDkim(domaine: string, selecteur: string): Promise<DetailVerification> {
  const fqdn = `${selecteur}._domainkey.${domaine}`;
  try {
    const records = await chercherTxt(fqdn);
    return evaluerDkim(records?.[0] ?? null);
  } catch (e: unknown) {
    return { statut: 'ERREUR', erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Vérifie DMARC : TXT _dmarc.<domaine>. */
async function verifierDmarc(domaine: string): Promise<DetailVerification> {
  const fqdn = `_dmarc.${domaine}`;
  try {
    const records = await chercherTxt(fqdn);
    const dmarc = records?.find((r) => r.toLowerCase().startsWith('v=dmarc1')) ?? null;
    return evaluerDmarc(dmarc);
  } catch (e: unknown) {
    return { statut: 'ERREUR', erreur: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Vérifie SPF + DKIM + DMARC pour un domaine d'expédition.
 * @param selecteurDkim sélecteur DKIM fourni par le relais (brevo1, mail, s1…)
 */
export async function verifierDnsDomaine(
  domaine: string,
  selecteurDkim: string = process.env.MAIL_DKIM_SELECTOR || 'mail'
): Promise<ResultatVerificationDns> {
  const propre = domaine.trim().toLowerCase().replace(/\.$/, '');
  const [spf, dkim, dmarc] = await Promise.all([
    verifierSpf(propre),
    verifierDkim(propre, selecteurDkim),
    verifierDmarc(propre),
  ]);

  const notes: string[] = [];
  if (spf.statut === 'PASS' && dkim.statut === 'PASS' && dmarc.statut === 'PASS') {
    notes.push(
      'Domaine authentifié : SPF, DKIM et DMARC sont publiés. Testez la réception réelle avec un e-mail de test, puis dans Gmail : « Afficher l\'original » → SPF: PASS, DKIM: PASS, DMARC: PASS.'
    );
  } else {
    notes.push(
      'Publiez les enregistrements manquants dans le DNS du domaine (valeurs fournies par Brevo / SMTP2GO — ne copiez jamais un exemple générique), attendez la propagation puis relancez la vérification.'
    );
  }
  notes.push(
    'N\'utilisez jamais une adresse gmail.com personnelle comme expéditeur : préférez noreply@ / notifications@ sur VOTRE domaine, idéalement un sous-domaine dédié (ex. mail.votre-domaine.com).'
  );

  return {
    domaine: propre,
    selecteurDkim,
    spf,
    dkim,
    dmarc,
    verifieLe: new Date().toISOString(),
    notes,
  };
}
