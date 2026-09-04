/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVICE DE MESSAGERIE CENTRALISÉ — Façade unique d'envoi d'e-mails
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture cible :
 *
 *   Utilisateurs / Applications (routes API, cron, portail…)
 *        │  POST /api/mail/send  (session NextAuth ou clé API)
 *        ▼
 *   ┌─────────────────────────────────────────────┐
 *   │  MAIL SERVICE (cette façade)                │
 *   │   1. Authentification   → routes API        │
 *   │   2. Validation         → validate.ts       │
 *   │   3. Rate Limiting      → rate-limit.ts     │
 *   │   4. Anti-abus          → anti-abuse.ts     │
 *   │   5. File d'attente     → queue.ts          │
 *   │   6. Génération message → templates.ts      │
 *   │   7. Logs et suivi      → CourrielSortant   │
 *   └─────────────────────────────────────────────┘
 *        │
 *        ▼
 *   Moteur de livraison (delivery.ts) — SMTP + DNS/MX + Retry
 *        │  remise au RELAIS SMTP du domaine d'envoi
 *        └──────→ Gmail / Yahoo / Outlook / domaines pro
 *
 * Point clé : la plateforme n'envoie JAMAIS directement à Gmail/Yahoo via
 * leurs API. Elle remet le message à SON relais SMTP (voir docs/MESSAGERIE.md
 * pour l'identité d'expéditeur SPF / DKIM / DMARC), qui résout le DNS/MX du
 * destinataire et négocie la remise finale.
 *
 * UN SEUL point d'entrée : `envoyerCourriel()`. Toute la plateforme (récupération
 * de mot de passe, rapports mensuels, PDF, tests SMTP, notifications) doit y passer.
 */

import { validerAdresse, verifierDomaineLivraison, normaliserDestinataire, detecterInjectionEnTete } from './validate';
import { controlerMessage, controlerExpediteur } from './anti-abuse';
import { verifierQuotas } from './rate-limit';
import { mettreEnFile, type ResultatEnFile } from './queue';
import {
  templateReinitialisationMdp, templateNotification, templateTest,
  avecPrefixeSujet, echapperHTML, htmlVersTexte,
} from './templates';

// ─── Types publics ───────────────────────────────────────────────────────────

export type NomTemplate = 'reinitialisation-mdp' | 'notification' | 'test';

export interface PieceJointeDemande {
  nom: string;
  /** Contenu encodé en base64 */
  contenuBase64: string;
  contentType?: string;
}

export interface DemandeCourriel {
  /** Destinataires principaux (1 à MAX_DESTINATAIRES_MESSAGE) */
  destinataires: string[];
  cc?: string[];
  bcc?: string[];
  /** Sujet brut — requis si aucun template (le préfixe est ajouté automatiquement) */
  sujet?: string;
  /** Corps texte brut — requis si aucun template et pas de html */
  texte?: string;
  /** Corps HTML pré-généré (rapports) — le texte alterné est alors déduit */
  html?: string;
  /** Template déclaré (alternative à texte/html) */
  template?: NomTemplate;
  /** Données du template (échappées automatiquement) */
  donnees?: Record<string, unknown>;
  /** Pièces jointes (base64) */
  piecesJointes?: PieceJointeDemande[];
  /** "Nom Comptable <email@domaine>" — doit appartenir au domaine d'envoi contrôlé */
  fromPersonnalise?: string;
  replyTo?: string;
  /** Catégorie fonctionnelle pour le suivi : RESET_MDP, RAPPORT_MENSUEL… */
  categorie?: string;
  /** Priorité de traitement : 1 (urgente) à 9 (basse) */
  priorite?: number;
  /** Origine de la demande (audit) : "forgot-password", "cron-mensuel"… */
  source?: string;
  /** Identité de l'appelant (id utilisateur, "api-key"…) */
  sourceId?: string;
  /** Livrer immédiatement (true) ou laisser le processeur de file agir (défaut) */
  traiter?: boolean;
}

export interface ResultatCourriel {
  accepte: boolean;
  /** Code machine pour mapper la réponse HTTP : OK | INVALIDE | REJETE | QUOTA */
  code?: 'OK' | 'INVALIDE' | 'REJETE' | 'QUOTA';
  motif?: string;
  /** id CourrielSortant + statut après admission */
  envoi?: ResultatEnFile;
}

// ─── Vérification MX (admission) ─────────────────────────────────────────────

const MX_ACTIF = (): boolean => (process.env.MAIL_MX_CHECK ?? 'true') !== 'false';

/** Vérifie les domaines uniques des destinataires (MX publicés). */
async function verifierMX(destinataires: string[]): Promise<ResultatCourriel | null> {
  if (!MX_ACTIF()) return null;
  const domaines = [...new Set(destinataires.map((a) => a.slice(a.lastIndexOf('@') + 1)))];
  for (const domaine of domaines) {
    const r = await verifierDomaineLivraison(domaine);
    if (!r.livrable && !r.temporaire) {
      // Domaine réellement sans messagerie → rejet immédiat et définitif.
      // (Échec DNS TEMPORAIRE : on accepte, le moteur de livraison réessaiera.)
      return {
        accepte: false,
        code: 'REJETE',
        motif: r.motif || `Le domaine « ${domaine} » ne peut pas recevoir d'e-mail.`,
      };
    }
  }
  return null;
}

// ─── Génération du contenu selon le template ─────────────────────────────────

function genererContenu(
  template: NomTemplate | undefined,
  donnees: Record<string, unknown> | undefined,
  sujet: string | undefined,
  texte: string | undefined,
  html: string | undefined
): { sujet: string; texte: string; html?: string } {
  if (template) {
    const d = donnees ?? {};
    switch (template) {
      case 'reinitialisation-mdp': {
        const c = templateReinitialisationMdp({
          nom: String(d.nom ?? 'Utilisateur'),
          lien: String(d.lien ?? ''),
          minutes: Number(d.minutes ?? 30),
        });
        return { sujet: avecPrefixeSujet(c.sujet), texte: c.texte, html: c.html };
      }
      case 'notification': {
        const lignes = Array.isArray(d.lignes)
          ? (d.lignes as { libelle: string; valeur: string }[])
          : [];
        const c = templateNotification({
          titre: String(d.titre ?? 'Notification'),
          lignes,
          message: d.message ? String(d.message) : undefined,
          action: d.action ? (d.action as { lien: string; libelle: string }) : undefined,
        });
        return { sujet: avecPrefixeSujet(c.sujet), texte: c.texte, html: c.html };
      }
      case 'test': {
        const c = templateTest({ nomExpediteur: d.nomExpediteur ? String(d.nomExpediteur) : undefined });
        return { sujet: avecPrefixeSujet(c.sujet), texte: c.texte, html: c.html };
      }
    }
  }

  // Contenu brut (rapports HTML pré-générés…) — version texte déduite si absente
  if (!texte && !html) {
    throw new Error('Aucun contenu fourni : template, texte ou html requis.');
  }
  const sujetFinal = avecPrefixeSujet(sujet || '(sans objet)');
  return { sujet: sujetFinal, texte: texte || htmlVersTexte(html!), html };
}

// ─── Façade principale ───────────────────────────────────────────────────────

/**
 * Point d'entrée UNIQUE pour tout envoi d'e-mail de la plateforme.
 * Enchaîne : validation → MX → anti-abus → rate-limiting → file d'attente.
 * Les rejets sont précis et journalisés ; rien ne part sans avoir passé
 * toutes les barrières.
 */
export async function envoyerCourriel(demande: DemandeCourriel): Promise<ResultatCourriel> {
  const to = Array.isArray(demande.destinataires) ? demande.destinataires : [];
  const cc = Array.isArray(demande.cc) ? demande.cc : [];
  const bcc = Array.isArray(demande.bcc) ? demande.bcc : [];

  // 2. VALIDATION — syntaxe et normalisation de chaque adresse
  const validees: { to: string[]; cc: string[]; bcc: string[] } = { to: [], cc: [], bcc: [] };
  for (const [cle, liste] of Object.entries({ to, cc, bcc })) {
    for (const brute of liste) {
      const v = validerAdresse(brute);
      if (!v.valide) {
        return { accepte: false, code: 'INVALIDE', motif: `Destinataire « ${String(brute).slice(0, 80)} » : ${v.motif}` };
      }
      if (cle === 'to') validees.to.push(v.normalisee!);
      else if (cle === 'cc') validees.cc.push(v.normalisee!);
      else validees.bcc.push(v.normalisee!);
    }
  }

  // Sujet : injection d'en-têtes interdite
  if (demande.sujet !== undefined) {
    if (typeof demande.sujet !== 'string' || demande.sujet.length === 0 || demande.sujet.length > 255) {
      return { accepte: false, code: 'INVALIDE', motif: 'Sujet manquant ou trop long (255 caractères max).' };
    }
    if (detecterInjectionEnTete(demande.sujet)) {
      return { accepte: false, code: 'REJETE', motif: 'Caractères interdits dans le sujet.', };
    }
  }

  // Expéditeur personnalisé / Reply-To
  const rExp = controlerExpediteur(demande.fromPersonnalise, demande.replyTo);
  if (!rExp.autorise) {
    return { accepte: false, code: 'INVALIDE', motif: rExp.motif };
  }

  // Vérification MX du domaine destinataire (admission — DNS/MX)
  const mx = await verifierMX(validees.to);
  if (mx && !mx.accepte) return mx;

  // 4. ANTI-ABUS — domaines, volume par message, taille des contenus
  const rAbus = controlerMessage({
    destinataires: validees.to,
    cc: validees.cc,
    bcc: validees.bcc,
    sujet: demande.sujet || '',
    texte: demande.texte,
    html: demande.html,
    piecesJointes: demande.piecesJointes,
  });
  if (!rAbus.autorise) {
    return { accepte: false, code: 'REJETE', motif: rAbus.motif };
  }

  // 3. RATE LIMITING — plafond par destinataire normalisé + plafond global
  const quotas = await verifierQuotas(validees.to);
  if (!quotas.autorise) {
    return { accepte: false, code: 'QUOTA', motif: quotas.motif };
  }

  // 6. GÉNÉRATION DU MESSAGE — template typé ou contenu brut
  let contenu: { sujet: string; texte: string; html?: string };
  try {
    contenu = genererContenu(demande.template, demande.donnees, demande.sujet, demande.texte, demande.html);
  } catch (e: unknown) {
    return { accepte: false, code: 'INVALIDE', motif: e instanceof Error ? e.message : 'Contenu du message invalide.' };
  }

  // 5. + 7. FILE D'ATTENTE + LOGS — insertion persistante puis (option) livraison
  const envoi = await mettreEnFile({
    destinataires: validees,
    destinatairePrincipal: normaliserDestinataire(validees.to[0] || validees.cc[0] || validees.bcc[0] || ''),
    sujet: contenu.sujet,
    texte: contenu.texte,
    html: contenu.html,
    piecesJointes: demande.piecesJointes ?? null,
    template: demande.template ?? null,
    donnees: demande.donnees ?? null,
    fromPersonnalise: demande.fromPersonnalise ?? null,
    replyTo: demande.replyTo ?? null,
    categorie: demande.categorie ?? null,
    priorite: demande.priorite,
    source: demande.source ?? null,
    sourceId: demande.sourceId ?? null,
    traiter: demande.traiter,
  });

  return { accepte: true, code: 'OK', envoi };
}

// ─── Raccourcis typés (utilisés par les modules métier) ──────────────────────

/** Réinitialisation de mot de passe — livraison immédiate, haute priorité. */
export function envoyerReinitialisationMdp(donnees: {
  destinataire: string;
  nom: string;
  lien: string;
  minutes?: number;
  sourceId?: string;
}): Promise<ResultatCourriel> {
  return envoyerCourriel({
    destinataires: [donnees.destinataire],
    template: 'reinitialisation-mdp',
    donnees: { nom: donnees.nom, lien: donnees.lien, minutes: donnees.minutes ?? 30 },
    categorie: 'RESET_MDP',
    priorite: 1,
    source: 'forgot-password',
    sourceId: donnees.sourceId,
    traiter: true,
  });
}

/** Notification générique (lignes clé/valeur échappées). */
export function envoyerNotification(donnees: {
  destinataires: string[];
  titre: string;
  lignes?: { libelle: string; valeur: string }[];
  message?: string;
  action?: { lien: string; libelle: string };
  categorie?: string;
  source?: string;
  sourceId?: string;
}): Promise<ResultatCourriel> {
  return envoyerCourriel({
    destinataires: donnees.destinataires,
    template: 'notification',
    donnees: { titre: donnees.titre, lignes: donnees.lignes ?? [], message: donnees.message, action: donnees.action },
    categorie: donnees.categorie || 'NOTIFICATION',
    source: donnees.source,
    sourceId: donnees.sourceId,
  });
}

/** E-mail de test (page Configuration) — livraison immédiate. */
export function envoyerEmailTest(destinataire: string, sourceId?: string): Promise<ResultatCourriel> {
  return envoyerCourriel({
    destinataires: [destinataire],
    template: 'test',
    categorie: 'TEST',
    priorite: 3,
    source: 'configuration-test',
    sourceId,
    traiter: true,
  });
}

export { echapperHTML };
