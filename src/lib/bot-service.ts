import { db } from './db';
import { callLLM } from './llm';

// ─── Types ───────────────────────────────────────────────────────────────────
export type CanalBot = 'WHATSAPP' | 'TELEGRAM' | 'MESSENGER';

export interface MessageBotIncoming {
  canal: CanalBot;
  expeditieurId: string;  // numéro tel / chatId / senderId
  expeditieurNom: string;
  texte: string;
}

// ─── Persistance des messages ────────────────────────────────────────────────
export async function sauvegarderMessage(msg: MessageBotIncoming, reponse: string) {
  try {
    await db.messageBot.create({
      data: {
        canal: msg.canal,
        expeditieurId: msg.expeditieurId,
        expeditieurNom: msg.expeditieurNom,
        message: msg.texte,
        reponse,
        lu: false,
      },
    });
  } catch (e) {
    console.error('[BOT] Erreur sauvegarde message:', e);
  }
}

// ─── Identification et sessions ─────────────────────────────────────────────

// En mémoire : association ID expéditeur (téléphone/chatId) → assure vérifié
const botSessions = new Map<string, { assureId: string; assureNom: string; societeId: string; verifieA: Date }>();
const SESSION_TTL = 4 * 60 * 60 * 1000; // 4h

async function identifierExpediteur(msg: MessageBotIncoming): Promise<{ assureId: string; assureNom: string; societeId: string } | null> {
  const cached = botSessions.get(msg.expeditieurId);
  if (cached && (Date.now() - cached.verifieA.getTime()) < SESSION_TTL) {
    return { assureId: cached.assureId, assureNom: cached.assureNom, societeId: cached.societeId };
  }
  const assure = await db.assure.findFirst({
    where: { telephone: { contains: msg.expeditieurId.replace(/[^\d+]/g, '') }, actif: true },
    include: { societe: { select: { id: true, nom: true } } },
  });
  if (assure) {
    const session = { assureId: assure.id, assureNom: assure.prenom ? `${assure.prenom} ${assure.nom}` : assure.nom, societeId: assure.societeId, verifieA: new Date() };
    botSessions.set(msg.expeditieurId, session);
    return session;
  }
  return null;
}

async function verifierNSS(nss: string, expediteurId: string): Promise<string> {
  const assure = await db.assure.findFirst({
    where: { nSS: nss.trim(), actif: true },
    include: { societe: { select: { id: true, nom: true } } },
  });
  if (!assure) return 'Numero de securite sociale non reconnu. Verifiez et reessayez.';
  botSessions.set(expediteurId, { assureId: assure.id, assureNom: assure.prenom ? `${assure.prenom} ${assure.nom}` : assure.nom, societeId: assure.societeId, verifieA: new Date() });
  return `Identite confirmée. Bienvenue ${assure.prenom || ''} ${assure.nom} (${assure.societe.nom}).\n\nVous pouvez maintenant consulter la situation de vos dossiers avec :\n• /mesdossiers — Voir tous vos dossiers\n• /dossier [numéro] — Suivre un dossier précis`;
}

// ─── Consultation des dossiers d'un assuré (STATUT UNIQUEMENT) ───────────────

const STATUT_LABELS: Record<string, string> = {
  RECU: 'Reçu', EN_ANALYSE: 'En analyse', VALIDE: 'Validé',
  EN_COMPTABILITE: 'En comptabilité', EN_PAIEMENT: 'En cours de paiement',
  PAYE: 'Payé', REJETE: 'Rejeté',
};

async function mesDossiers(assureId: string, assureNom: string): Promise<string> {
  const dossiers = await db.dossier.findMany({
    where: { assureId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { numeroDossier: true, statut: true, montantReclame: true, montantPaye: true, datePaiement: true, motifRejet: true },
  });

  if (dossiers.length === 0) {
    return `${assureNom}, vous n'avez aucun dossier enregistré dans notre système.`;
  }

  const lignes = dossiers.map(d => {
    let ligne = `- ${d.numeroDossier} : ${STATUT_LABELS[d.statut] || d.statut}`;
    if (d.statut === 'PAYE' && d.montantPaye && d.datePaiement) {
      ligne += ` — Payé ${d.montantPaye.toLocaleString('fr-FR')} Ar le ${d.datePaiement.toLocaleDateString('fr-FR')}`;
    } else if (d.statut === 'REJETE' && d.motifRejet) {
      ligne += ` — Motif : ${d.motifRejet}`;
    } else if (d.statut === 'EN_PAIEMENT') {
      ligne += ` — En attente de paiement`;
    }
    return ligne;
  });

  return `${assureNom}, voici la situation de vos ${dossiers.length} dernier(s) dossier(s) :\n\n${lignes.join('\n')}`;
}

// ─── Suivi d'un dossier par numéro (avec contrôle de propriété STRICT) ─────
async function suiviDossier(numero: string, expediteurId: string): Promise<string> {
  const q = numero.trim().toUpperCase();

  // L'expéditeur DOIT être identifié pour consulter un dossier
  const session = botSessions.get(expediteurId);
  if (!session) {
    return 'Vous devez d\'abord vous identifier pour consulter un dossier.\nEnvoyez : /verifier [votre numéro de sécurité sociale]';
  }

  // Vérifier que le dossier appartient à l'assuré identifié
  const dossier = await db.dossier.findFirst({
    where: { assureId: session.assureId, numeroDossier: { contains: q } },
    select: { numeroDossier: true, statut: true, montantPaye: true, datePaiement: true, referencePaiement: true, motifRejet: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (!dossier) {
    return `Aucun dossier "${numero}" ne vous est associé. Vous ne pouvez consulter que vos propres dossiers.`;
  }

  let reponse = `Dossier ${dossier.numeroDossier}\n`;
  reponse += `Statut : ${STATUT_LABELS[dossier.statut] || dossier.statut}\n`;

  if (dossier.statut === 'PAYE' && dossier.montantPaye) {
    reponse += `Montant payé : ${dossier.montantPaye.toLocaleString('fr-FR')} Ar\n`;
    if (dossier.datePaiement) {
      reponse += `Date de paiement : ${dossier.datePaiement.toLocaleDateString('fr-FR')}\n`;
    }
    if (dossier.referencePaiement) {
      reponse += `Référence de paiement : ${dossier.referencePaiement}\n`;
    }
  } else if (dossier.statut === 'EN_PAIEMENT') {
    reponse += `Votre dossier est en cours de traitement pour le paiement.\n`;
  } else if (dossier.statut === 'EN_COMPTABILITE') {
    reponse += `Votre dossier est en cours de vérification comptable.\n`;
  } else if (dossier.statut === 'EN_ANALYSE') {
    reponse += `Votre dossier est en cours d'analyse technique.\n`;
  } else if (dossier.statut === 'VALIDE') {
    reponse += `Votre dossier a été validé et sera transmis à la comptabilité.\n`;
  } else if (dossier.statut === 'REJETE' && dossier.motifRejet) {
    reponse += `Motif de rejet : ${dossier.motifRejet}\n`;
  }

  return reponse;
}

// ─── Réponse IA restrictive (uniquement consultation de statut) ─────────────
async function reponseIA(question: string, expediteurId: string): Promise<string> {
  try {
    const ident = await identifierExpediteur({ canal: 'WHATSAPP', expeditieurId: expediteurId, expeditieurNom: '', texte: '' });

    const systemPrompt = `Tu es le bot Suivi Santé. Tu réponds UNIQUEMENT aux questions concernant le suivi de dossiers de remboursement ou de règlement.

Règles strictes :
- Tu ne peux PAS créer de dossier, ni initier de demande de remboursement ou de règlement.
- Tu ne peux PAS rechercher un assuré ou un prestataire par nom.
- Tu ne peux PAS calculer de montant de remboursement ou de ticket modérateur.
- Tu peux uniquement indiquer comment consulter l'état d'un dossier existant.

Si l'utilisateur n'est pas identifié, invite-le à envoyer : /verifier [numéro de sécurité sociale]
Si l'utilisateur veut consulter ses dossiers, indique-lui les commandes :
- /mesdossiers — Voir la situation de tous vos dossiers
- /dossier [numéro] — Suivre un dossier précis
${ident ? `\nL'utilisateur est identifié en tant que ${ident.assureNom}.` : '\nL\'utilisateur n\'est pas encore identifié.'}

Si la question ne concerne pas le suivi d'un dossier existant, réponds poliment que vous ne pouvez que consulter l'état des dossiers de remboursement ou de règlement déjà enregistrés.`;

    const result = await callLLM(systemPrompt, question);
    if (result) return result;

    return 'Le service est temporairement indisponible. Veuillez réessayer plus tard ou utilisez /mesdossiers pour consulter vos dossiers.';
  } catch (e) {
    console.error('[BOT] Erreur LLM:', e);
    return 'Désolé, une erreur est survenue. Veuillez réessayer plus tard.';
  }
}

// ─── Router principal des messages bots ──────────────────────────────────────
export async function traiterMessageBot(msg: MessageBotIncoming): Promise<string> {
  const texte = msg.texte.trim();

  // Message vide
  if (!texte) {
    return 'Bonjour ! Je suis le bot Suivi Santé. Envoyez /aide pour voir les commandes disponibles.';
  }

  const lowerText = texte.toLowerCase();

  // ─── Commande /aide ────────────────────────────────────────────────────
  if (lowerText === '/aide' || lowerText === '/help' || lowerText === 'aide' || lowerText === 'help') {
    return [
      'Suivi Santé — Consultation de vos dossiers',
      '',
      'Ce bot vous permet UNIQUEMENT de consulter la situation de vos demandes de remboursement ou de règlement déjà enregistrées.',
      '',
      'Commandes disponibles :',
      '/verifier [NSS] — Vous identifier avec votre numéro de sécurité sociale',
      '/mesdossiers — Voir la situation de tous vos dossiers',
      '/dossier [numéro] — Suivre un dossier précis',
      '/aide — Afficher ce message',
      '',
      'Exemple :',
      '/verifier 123456789',
      '/dossier DOS-2026-000001',
      '',
      'Vous pouvez aussi poser votre question en langage naturel.',
    ].join('\n');
  }

  // ─── Commande /verifier [NSS] ─────────────────────────────────────────
  if (lowerText.startsWith('/verifier ')) {
    const nss = texte.slice('/verifier '.length).trim();
    return await verifierNSS(nss, msg.expeditieurId);
  }

  // ─── Commande /mesdossiers ────────────────────────────────────────────
  if (lowerText === '/mesdossiers' || lowerText === '/mes dossiers') {
    const ident = await identifierExpediteur(msg);
    if (!ident) return 'Vous devez d\'abord vous identifier.\nEnvoyez : /verifier [votre numéro de sécurité sociale]';
    return await mesDossiers(ident.assureId, ident.assureNom);
  }

  // ─── Commande /dossier (avec contrôle de propriété STRICT) ────────────
  if (lowerText.startsWith('/dossier ')) {
    const numero = texte.slice('/dossier '.length);
    return await suiviDossier(numero, msg.expeditieurId);
  }

  // ─── Commandes supprimées : informer l'utilisateur ────────────────────
  if (lowerText.startsWith('/assure ') || lowerText.startsWith('/prestataire ') || lowerText.startsWith('/calcul ')) {
    return 'Cette commande n\'est plus disponible via ce bot. Ce canal permet uniquement de consulter la situation de vos dossiers de remboursement ou de règlement existants.\n\nUtilisez /mesdossiers ou /dossier [numéro] pour suivre vos demandes.';
  }

  // ─── Détection intelligente : suivi de dossier ────────────────────────
  if (lowerText.includes('dossier') && (
    lowerText.includes('statut') || lowerText.includes('suivi') || lowerText.includes('où') ||
    lowerText.includes('etat') || lowerText.includes('avancement') || lowerText.includes('situation') ||
    lowerText.includes('paiement') || lowerText.includes('remboursement') || lowerText.includes('règlement') ||
    lowerText.includes('reglement')
  )) {
    const match = texte.match(/DOS-\d{4}-\d{3,}/i) || texte.match(/\d{6,}/);
    if (match) {
      return await suiviDossier(match[0], msg.expeditieurId);
    }
    // Pas de numéro de dossier fourni → proposer /mesdossiers
    const ident = await identifierExpediteur(msg);
    if (!ident) {
      return 'Pour consulter la situation de vos dossiers, vous devez d\'abord vous identifier.\nEnvoyez : /verifier [votre numéro de sécurité sociale]';
    }
    return await mesDossiers(ident.assureId, ident.assureNom);
  }

  // ─── Détection : demande de création / recherche non autorisée ────────
  if (
    lowerText.includes('créer') || lowerText.includes('creer') || lowerText.includes('nouveau') ||
    lowerText.includes('nouvelle') || lowerText.includes('enregistrer') || lowerText.includes('déposer') ||
    lowerText.includes('deposer') || lowerText.includes('initier') || lowerText.includes('ajouter') ||
    lowerText.includes('chercher') || lowerText.includes('rechercher') || lowerText.includes('trouver') ||
    lowerText.includes('calcul') || lowerText.includes('combien') || lowerText.includes('montant') ||
    lowerText.includes('ticket') || lowerText.includes('simuler')
  ) {
    return 'Ce bot permet uniquement de consulter la situation de vos demandes de remboursement ou de règlement déjà enregistrées.\n\nIl n\'est pas possible de créer une nouvelle demande, de rechercher un assuré/prestataire ou de calculer un montant via ce canal.\n\nPour suivre vos dossiers :\n• /mesdossiers\n• /dossier [numéro]';
  }

  // ─── Fallback IA restrictif ───────────────────────────────────────────
  return await reponseIA(texte, msg.expeditieurId);
}

// ─── Envoi de réponse WhatsApp (Meta Cloud API) ─────────────────────────────
export async function envoyerWhatsApp(phoneNumberId: string, to: string, message: string): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[WHATSAPP] WHATSAPP_ACCESS_TOKEN non configuré');
    return false;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('[WHATSAPP] Erreur envoi:', data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[WHATSAPP] Erreur réseau:', e);
    return false;
  }
}

// ─── Envoi de réponse Telegram ──────────────────────────────────────────────
export async function envoyerTelegram(chatId: string | number, message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[TELEGRAM] TELEGRAM_BOT_TOKEN non configuré');
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error('[TELEGRAM] Erreur envoi:', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[TELEGRAM] Erreur réseau:', e);
    return false;
  }
}

// ─── Envoi de réponse Messenger ─────────────────────────────────────────────
export async function envoyerMessenger(senderId: string, message: string): Promise<boolean> {
  const accessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[MESSENGER] MESSENGER_PAGE_ACCESS_TOKEN non configuré');
    return false;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: message },
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('[MESSENGER] Erreur envoi:', data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[MESSENGER] Erreur réseau:', e);
    return false;
  }
}