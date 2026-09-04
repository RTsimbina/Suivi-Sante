/**
 * Service de messagerie centralisé — Module GÉNÉRATION DU MESSAGE
 * ───────────────────────────────────────────────────────────────
 * Fabrique le contenu final des e-mails :
 *   - échappement HTML systématique de TOUTES les données injectées
 *     (jamais d'HTML produit à partir de données brutes)
 *   - layout commun (en-tête plateforme, corps, pied avec explication de
 *     la réception + adresse de contact)
 *   - version texte alternée générée depuis les données (accessibilité,
 *     clients sans HTML)
 *   - templates typés : réinitialisation de mot de passe, notification,
 *     test SMTP
 * Le préfixe de sujet est configurable : MAIL_SUBJECT_PREFIX (défaut "Suivi Santé").
 */

// ─── Échappement ─────────────────────────────────────────────────────────────

/** Échappe les caractères sensibles du HTML (& < > " ') — défense en profondeur. */
export function echapperHTML(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convertit un HTML simple en texte lisible (pour la version texte alternée). */
export function htmlVersTexte(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const PREFIXE_SUJET = (): string => process.env.MAIL_SUBJECT_PREFIX || 'Suivi Santé';

// ─── Layout commun ───────────────────────────────────────────────────────────

const COULEUR_PRIMAIRE = '#059669'; // vert Suivi Santé (cohérent avec l'UI)

export function layoutHtml(titre: string, corpsHtml: string, piedLigne?: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:${COULEUR_PRIMAIRE};padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Suivi Santé</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${echapperHTML(titre)}</p>
        </td></tr>
        <tr><td style="padding:32px;font-size:14px;line-height:1.6;color:#18181b;">
          ${corpsHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="margin:0;color:#a1a1aa;font-size:11px;line-height:1.5;">${piedLigne ? echapperHTML(piedLigne) + '<br>' : ''}Vous recevez cet e-mail car une action vous concernant a été effectuée sur la plateforme Suivi Santé.<br>Pour toute question : ${CONTACT()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function CONTACT(): string {
  return echapperHTML(process.env.MAIL_CONTACT || 'support@suivisante.mg');
}

/** Bouton d'action HTML (lien sécurisé, données échappées). */
function bouton(lien: string, libelle: string): string {
  const lienSur = /^https?:\/\//i.test(lien) ? lien : '#';
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <a href="${echapperHTML(lienSur)}" style="display:inline-block;background:${COULEUR_PRIMAIRE};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">${echapperHTML(libelle)}</a>
  </td></tr></table>`;
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface ContenuGenere {
  sujet: string;
  texte: string;
  html: string;
}

/**
 * Réinitialisation de mot de passe — lien à usage unique, courte durée.
 * Les données utilisateur sont TOUJOURS échappées.
 */
export function templateReinitialisationMdp(donnees: {
  nom: string;
  lien: string;
  minutes: number;
}): ContenuGenere {
  const nom = echapperHTML(donnees.nom);
  const sujet = 'Réinitialisation de votre mot de passe';
  const corps = `
    <p style="margin:0 0 16px;">Bonjour <strong>${nom}</strong>,</p>
    <p style="margin:0 0 24px;">Vous avez demandé la réinitialisation de votre mot de passe.
    Cliquez sur le bouton ci-dessous pour en définir un nouveau. Ce lien est valable
    <strong>${echapperHTML(String(donnees.minutes))} minutes</strong>.</p>
    ${bouton(donnees.lien, 'Réinitialiser mon mot de passe')}
    <p style="margin:24px 0 0;color:#52525b;font-size:13px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#059669;">${echapperHTML(/^https?:\/\//i.test(donnees.lien) ? donnees.lien : '(lien indisponible)')}</span></p>
    <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;">Si vous n'avez pas fait cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.</p>`;
  return {
    sujet,
    html: layoutHtml('Réinitialisation de mot de passe', corps),
    texte: [
      `Bonjour ${donnees.nom},`,
      '',
      'Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme Suivi Santé.',
      '',
      `Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe (valide ${donnees.minutes} minutes) :`,
      donnees.lien,
      '',
      'Si vous n\'avez pas fait cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.',
      '',
      'L\'équipe Suivi Santé',
    ].join('\n'),
  };
}

/** Notification générique (titre + lignes de contenu). */
export function templateNotification(donnees: {
  titre: string;
  lignes: { libelle: string; valeur: string }[];
  message?: string;
  action?: { lien: string; libelle: string };
}): ContenuGenere {
  const titre = echapperHTML(donnees.titre);
  const lignesHtml = donnees.lignes
    .map((l) => `<tr><td style="padding:6px 0;color:#52525b;">${echapperHTML(l.libelle)} :</td><td style="padding:6px 0;text-align:right;font-weight:600;">${echapperHTML(l.valeur)}</td></tr>`)
    .join('');
  const corps = `
    ${donnees.message ? `<p style="margin:0 0 16px;">${echapperHTML(donnees.message)}</p>` : ''}
    ${lignesHtml ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:8px 0 20px;">${lignesHtml}</table>` : ''}
    ${donnees.action ? bouton(donnees.action.lien, donnees.action.libelle) : ''}`;
  return {
    sujet: donnees.titre,
    html: layoutHtml(donnees.titre, corps),
    texte: [
      donnees.message || '',
      ...donnees.lignes.map((l) => `${l.libelle} : ${l.valeur}`),
      donnees.action ? `\n${donnees.action.libelle} : ${donnees.action.lien}` : '',
    ].filter(Boolean).join('\n').trim(),
  };
}

/** E-mail de test (vérification de la configuration SMTP). */
export function templateTest(donnees: { nomExpediteur?: string }): ContenuGenere {
  const exp = donnees.nomExpediteur ? echapperHTML(donnees.nomExpediteur) : 'la plateforme';
  const corps = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">Ceci est un <strong>e-mail de test</strong> envoyé par ${exp} depuis la plateforme Suivi Santé.</p>
    <p style="margin:0;color:#52525b;">Si vous le lisez dans votre boîte de réception, la chaîne d'envoi
    (file d'attente → moteur de livraison SMTP) fonctionne correctement.</p>`;
  return {
    sujet: 'E-mail de test — Suivi Santé',
    html: layoutHtml('E-mail de test', corps),
    texte: `Bonjour,\n\nCeci est un e-mail de test envoyé depuis la plateforme Suivi Santé.\nSi vous le lisez dans votre boîte de réception, la chaîne d'envoi fonctionne correctement.\n\nL'équipe Suivi Santé`,
  };
}

/** Applique le préfixe de sujet : "[Suivi Santé] sujet". */
export function avecPrefixeSujet(sujet: string): string {
  const prefixe = PREFIXE_SUJET();
  if (!prefixe || sujet.startsWith(`[${prefixe}]`)) return sujet;
  return `[${prefixe}] ${sujet}`;
}
