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

// ─── Identification et isolation des données bots ─────────────────────────

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
  return `Identite confirmee. Bienvenue ${assure.prenom || ''} ${assure.nom} (${assure.societe.nom}).\nVous pouvez maintenant consulter vos dossiers avec /dossier ou /mesdossiers.`;
}

async function mesDossiers(assureId: string, assureNom: string): Promise<string> {
  const dossiers = await db.dossier.findMany({ where: { assureId }, include: { societe: { select: { nom: true } } }, orderBy: { createdAt: 'desc' }, take: 10 });
  if (dossiers.length === 0) return `${assureNom}, vous n'avez aucun dossier enregistre.`;
  const statutLabels: Record<string, string> = { RECU: 'Recu', EN_ANALYSE: 'En analyse', VALIDE: 'Valide', EN_COMPTABILITE: 'En comptabilite', EN_PAIEMENT: 'En paiement', PAYE: 'Paye', REJETE: 'Rejete' };
  const lignes = dossiers.map(d => `- ${d.numeroDossier}: ${statutLabels[d.statut] || d.statut} — ${d.montantReclame.toLocaleString('fr-FR')} AR${d.montantPaye ? ` (Paye: ${d.montantPaye.toLocaleString('fr-FR')} AR)` : ''}`);
  return `${assureNom}, voici vos ${dossiers.length} dernier(s) dossier(s):\n${lignes.join('\n')}`;
}

// ─── Recherche d'assuré par nom ou NSS ──────────────────────────────────────
async function chercherAssure(query: string): Promise<string> {
  const q = query.trim();
  const assures = await db.assure.findMany({
    where: {
      OR: [
        { nom: { contains: q } },
        { prenom: { contains: q } },
        { nSS: { contains: q } },
        { telephone: { contains: q } },
      ],
      actif: true,
    },
    include: {
      societe: { select: { nom: true } },
      _count: { select: { dossiers: true } },
    },
    take: 5,
  });

  if (assures.length === 0) {
    return 'Aucun assuré trouvé pour cette recherche. Vérifiez le nom ou le numéro de sécurité sociale.';
  }

  const lignes = assures.map(a => {
    const nomComplet = a.prenom ? `${a.prenom} ${a.nom}` : a.nom;
    const nss = a.nSS ? ` | NSS: ${a.nSS}` : '';
    return `- ${nomComplet} (${a.societe.nom})${nss} — ${a._count.dossiers} dossier(s)`;
  });
  return `Assurés trouvés (${assures.length}):\n${lignes.join('\n')}`;
}

// ─── Recherche de prestataire par nom ───────────────────────────────────────
async function chercherPrestataire(query: string): Promise<string> {
  const q = query.trim();
  const prestas = await db.prestataire.findMany({
    where: {
      OR: [
        { nom: { contains: q } },
        { telephone: { contains: q } },
      ],
      actif: true,
    },
    take: 5,
  });

  if (prestas.length === 0) {
    return 'Aucun prestataire trouvé pour cette recherche.';
  }

  const types: Record<string, string> = {
    HOPITAL: 'Hôpital', CLINIQUE: 'Clinique', PHARMACIE: 'Pharmacie',
    CABINET_MEDICAL: 'Cabinet médical', LABORATOIRE: 'Laboratoire',
    DENTAIRE: 'Dentaire', OPTICIEN: 'Opticien', AUTRE: 'Autre',
  };

  const lignes = prestas.map(p =>
    `- ${p.nom} (${types[p.type] || p.type})${p.telephone ? ` — Tél: ${p.telephone}` : ''}`
  );
  return `Prestataires trouvés (${prestas.length}):\n${lignes.join('\n')}`;
}

// ─── Suivi d'un dossier par numéro ──────────────────────────────────────────
async function suiviDossier(numero: string, expediteurId?: string): Promise<string> {
  const q = numero.trim().toUpperCase();

  // Si l'expediteur est identifie, verifier que le dossier lui appartient
  if (expediteurId) {
    const session = botSessions.get(expediteurId);
    if (session) {
      const assureDossiers = await db.dossier.findMany({
        where: { assureId: session.assureId, numeroDossier: { contains: q } },
        select: { id: true }, take: 1,
      });
      if (assureDossiers.length === 0) {
        return `Aucun dossier "${numero}" ne vous est associe. Vous ne pouvez consulter que vos propres dossiers.`;
      }
    }
  }

  const dossier = await db.dossier.findFirst({
    where: {
      OR: [
        { numeroDossier: { contains: q } },
      ],
    },
    include: {
      societe: { select: { nom: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (!dossier) {
    return `Aucun dossier trouvé pour "${numero}". Vérifiez le numéro de dossier (format: DOS-2026-XXXXXX).`;
  }

  const statutLabels: Record<string, string> = {
    RECU: 'Reçu', EN_ANALYSE: 'En analyse', VALIDE: 'Validé',
    EN_COMPTABILITE: 'En comptabilité', EN_PAIEMENT: 'En paiement',
    PAYE: 'Payé', REJETE: 'Rejeté',
  };

  let reponse = `Dossier ${dossier.numeroDossier}\n`;
  reponse += `Société: ${dossier.societe.nom}\n`;
  reponse += `Statut: ${statutLabels[dossier.statut] || dossier.statut}\n`;
  reponse += `Montant réclamé: ${dossier.montantReclame.toLocaleString('fr-FR')} AR\n`;

  if (dossier.montantValide) {
    reponse += `Montant validé: ${dossier.montantValide.toLocaleString('fr-FR')} AR\n`;
  }
  if (dossier.ticketModerateur) {
    reponse += `Ticket modérateur: ${dossier.ticketModerateur.toLocaleString('fr-FR')} AR\n`;
  }
  if (dossier.montantPaye) {
    reponse += `Montant payé: ${dossier.montantPaye.toLocaleString('fr-FR')} AR\n`;
  }
  if (dossier.datePaiement) {
    reponse += `Date de paiement: ${dossier.datePaiement.toLocaleDateString('fr-FR')}\n`;
  }
  if (dossier.motifRejet) {
    reponse += `Motif de rejet: ${dossier.motifRejet}\n`;
  }

  return reponse;
}

// ─── Calcul ticket modérateur ────────────────────────────────────────────────
async function calculerTicket(societeNom: string, prestation: string, montant: number): Promise<string> {
  const societe = await db.societe.findFirst({
    where: { nom: { contains: societeNom.trim(), mode: 'insensitive' } },
  });

  if (!societe) {
    return `Société "${societeNom}" non trouvée. Vérifiez le nom.`;
  }

  const bareme = await db.bareme.findUnique({
    where: {
      societeId_prestation: {
        societeId: societe.id,
        prestation: prestation.trim().toUpperCase(),
      },
    },
  });

  if (!bareme || !bareme.active) {
    return `Aucun barème actif trouvé pour la prestation "${prestation}" chez ${societe.nom}.`;
  }

  const montantCouvert = Math.min(montant, bareme.plafond);
  const montantRembourse = montantCouvert * (bareme.tauxCouverture / 100);
  const ticketModerateur = montant - montantRembourse;
  const plafondAtteint = montant > bareme.plafond;

  let reponse = `Calcul pour ${societe.nom} — ${prestation}:\n`;
  reponse += `Montant réclamé: ${montant.toLocaleString('fr-FR')} AR\n`;
  reponse += `Taux de couverture: ${bareme.tauxCouverture}%\n`;
  reponse += `Plafond: ${bareme.plafond.toLocaleString('fr-FR')} AR\n`;
  if (plafondAtteint) {
    reponse += `Plafond atteint ! Montant couvert plafonné à ${montantCouvert.toLocaleString('fr-FR')} AR\n`;
  }
  reponse += `Montant remboursé: ${Math.round(montantRembourse).toLocaleString('fr-FR')} AR\n`;
  reponse += `Ticket modérateur (à la charge du patient): ${Math.round(ticketModerateur).toLocaleString('fr-FR')} AR\n`;

  if (plafondAtteint) {
    reponse += `\nLe patient devra payer la différence de ${Math.round(montant - bareme.plafond).toLocaleString('fr-FR')} AR (dépassement du plafond) plus le ticket modérateur.`;
  }

  return reponse;
}

// ─── Réponse IA générique (fallback) ────────────────────────────────────────
async function reponseIA(question: string): Promise<string> {
  try {
    // Contexte simplifié pour les bots
    const stats = await db.dossier.groupBy({
      by: ['statut'],
      _count: true,
      _sum: { montantReclame: true, montantPaye: true },
    });

    let contexte = 'Suivi Santé — Plateforme de gestion des dossiers de santé.\n\nStatistiques actuelles:\n';
    for (const s of stats) {
      contexte += `- ${s.statut}: ${s._count.id} dossiers`;
      if (s._sum.montantReclame) contexte += `, ${Math.round(s._sum.montantReclame).toLocaleString('fr-FR')} AR réclamés`;
      if (s._sum.montantPaye) contexte += `, ${Math.round(s._sum.montantPaye).toLocaleString('fr-FR')} AR payés`;
      contexte += '\n';
    }

    const systemPrompt = `Tu es l'assistant bot Suivi Santé. Tu réponds aux questions des assurés et prestataires médicaux concernant leurs dossiers de remboursement de soins de santé à Madagascar.
Tu réponds en français, de manière concise et courtoise. Utilise les données fournies pour répondre.
Si on te demande le solde, le remboursement, ou le statut d'un dossier précis, invite l'utilisateur à fournir le numéro de dossier.
Commandes disponibles: /assure [nom], /prestataire [nom], /dossier [numéro], /calcul [société] [prestation] [montant], /aide

${contexte}`;

    const result = await callLLM(systemPrompt, question);
    if (result) return result;

    return 'Le service IA est temporairement indisponible. Veuillez réessayer plus tard.';
  } catch (e) {
    console.error('[BOT] Erreur LLM:', e);
    return 'Désolé, une erreur est survenue lors du traitement. Veuillez réessayer.';
  }
}

// ─── Router principal des messages bots ──────────────────────────────────────
export async function traiterMessageBot(msg: MessageBotIncoming): Promise<string> {
  const texte = msg.texte.trim();

  // Message vide
  if (!texte) {
    return 'Bonjour ! Je suis le bot Suivi Santé. Envoyez /aide pour voir les commandes disponibles.';
  }

  // Commandes
  const lowerText = texte.toLowerCase();

  if (lowerText === '/aide' || lowerText === '/help' || lowerText === 'aide' || lowerText === 'help') {
    return [
      'Suivi Santé — Commandes disponibles:',
      '',
      '/verifier [NSS] — Vous identifier (obligatoire pour acceder a vos donnees)',
      '/mesdossiers — Voir vos dossiers (apres identification)',
      '/assure [nom ou NSS] — Rechercher un assure',
      '/prestataire [nom] — Rechercher un prestataire médical',
      '/dossier [numéro] — Suivre l\'état d\'un dossier',
      '/calcul [société] [prestation] [montant] — Calculer le remboursement',
      '/aide — Afficher ce message',
      '',
      'Exemples:',
      '/assure Rakoto',
      '/prestataire Clinique Sainte Marie',
      '/dossier DOS-2026-000001',
      '/calcul TELMA consultation 40000',
      '',
      'Vous pouvez aussi poser une question en langage naturel.',
    ].join('\n');
  }

  // Commande /verifier [NSS]
  if (lowerText.startsWith('/verifier ')) {
    const nss = texte.slice('/verifier '.length).trim();
    return await verifierNSS(nss, msg.expeditieurId);
  }

  // Commande /mesdossiers
  if (lowerText === '/mesdossiers' || lowerText === '/mes dossiers') {
    const ident = await identifierExpediteur(msg);
    if (!ident) return 'Vous devez d\'abord vous identifier. Envoyez /verifier [votre numero de securite sociale].';
    return await mesDossiers(ident.assureId, ident.assureNom);
  }

  // Commande /assure
  if (lowerText.startsWith('/assure ')) {
    const query = texte.slice('/assure '.length);
    return await chercherAssure(query);
  }

  // Commande /prestataire
  if (lowerText.startsWith('/prestataire ')) {
    const query = texte.slice('/prestataire '.length);
    return await chercherPrestataire(query);
  }

  // Commande /dossier (avec controle d'acces)
  if (lowerText.startsWith('/dossier ')) {
    const numero = texte.slice('/dossier '.length);
    return await suiviDossier(numero, msg.expeditieurId);
  }

  // Commande /calcul
  if (lowerText.startsWith('/calcul ')) {
    const parts = texte.slice('/calcul '.length).split(/\s+/);
    if (parts.length < 3) {
      return 'Format: /calcul [société] [prestation] [montant]\nExemple: /calcul TELMA consultation 40000';
    }
    const montant = parseFloat(parts[parts.length - 1]);
    const prestation = parts[parts.length - 2];
    const societeNom = parts.slice(0, parts.length - 2).join(' ');
    if (isNaN(montant) || montant <= 0) {
      return 'Le montant doit être un nombre positif. Exemple: /calcul TELMA consultation 40000';
    }
    return await calculerTicket(societeNom, prestation, montant);
  }

  // Détection intelligente de l'intention
  if (lowerText.includes('assuré') || lowerText.includes('assure') || lowerText.includes('chercher')) {
    if (lowerText.includes('trouver') || lowerText.includes('chercher') || lowerText.includes('recherch')) {
      const words = texte.split(/\s+/).filter(w => !['je', 'veux', 'trouver', 'chercher', 'rechercher', 'un', 'une', 'des', 'les', 'l\'assuré', 'l\'assure', 'assuré', 'assure', 's\'il', 'vous', 'plait'].includes(w.toLowerCase()));
      if (words.length > 0) return await chercherAssure(words.join(' '));
    }
  }

  if (lowerText.includes('dossier') && (lowerText.includes('statut') || lowerText.includes('suivi') || lowerText.includes('où') || lowerText.includes('etat') || lowerText.includes('avancement'))) {
    const match = texte.match(/DOS-\d{4}-\d{3,}/i) || texte.match(/\d{6,}/);
    if (match) return await suiviDossier(match[0]);
    return 'Veuillez fournir le numéro de dossier. Format: /dossier DOS-2026-000001';
  }

  if (lowerText.includes('calcul') || lowerText.includes('remboursement') || lowerText.includes('ticket')) {
    const match = texte.match(/(\d[\d\s.]*)\s*ar?$/i);
    if (match) {
      const montantStr = match[1].replace(/\s/g, '');
      const montant = parseFloat(montantStr);
      if (!isNaN(montant) && montant > 0) {
        // Essayer d'extraire société et prestation
        const words = texte.replace(/calcul|remboursement|ticket|modérateur|pour|de|est|c'est|\d[\d\s.]*ar?$/gi, '').trim().split(/\s+/);
        if (words.length >= 2) {
          return await calculerTicket(words[0], words[1], montant);
        }
      }
    }
  }

  // Fallback IA
  return await reponseIA(texte);
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