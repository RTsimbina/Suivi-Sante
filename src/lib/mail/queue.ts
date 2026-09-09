/**
 * Service de messagerie centralisé — Module FILE D'ATTENTE + LOGS ET SUIVI
 * ─────────────────────────────────────────────────────────────────────────
 * La table CourrielSortant est à la fois :
 *   - la FILE D'ATTENTE  : chaque message y attend son tour (statut EN_ATTENTE),
 *     survit aux redémarrages / redéploiements serverless, se traite dans
 *     l'ordre de priorité ;
 *   - le JOURNAL DE SUIVI : tentatives, erreurs, Message-ID, dates (audit).
 *
 * Cycle de vie :
 *   EN_ATTENTE → EN_COURS → ENVOYE
 *       ▲            └──────→ EN_ATTENTE (erreur temporaire + backoff)
 *                    └──────→ ECHEC     (erreur permanente ou max retries)
 *
 * Sûreté multi-instances : les messages sont RÉCLAMÉS de façon atomique avec
 * `FOR UPDATE SKIP LOCKED` (PostgreSQL) — deux workers ne peuvent jamais
 * prendre le même message, donc jamais d'envoi en double. Un fallback
 * optimiste (updateMany conditionnel) couvre les environnements non-Postgres.
 */

import { db } from '../db';
import { livrerMessage } from './delivery';
import { Prisma } from '@prisma/client';

// ─── Configuration retry ─────────────────────────────────────────────────────

/** Délais (secondes) avant la tentative n — backoff exponentiel + cap 6 h. */
export const DELAIS_RETRY_S = [60, 300, 1800, 7200, 21600];

export const STATUTS = {
  EN_ATTENTE: 'EN_ATTENTE',
  EN_COURS: 'EN_COURS',
  ENVOYE: 'ENVOYE',
  ECHEC: 'ECHEC',
} as const;

/** Types d'événements journalisés dans CourrielEvenement (historique du cycle de vie). */
export const TYPES_EVENEMENT = {
  MISE_EN_FILE: 'MISE_EN_FILE', // admis par le service, inséré dans la file
  EN_COURS: 'EN_COURS',         // réclamé par un worker (claim atomique)
  ENVOYE: 'ENVOYE',             // remis au relais SMTP (Message-ID obtenu)
  RETRY: 'RETRY',               // erreur temporaire → nouvelle tentative programmée
  ECHEC: 'ECHEC',               // erreur permanente ou max de tentatives atteint
  RECUPERE: 'RECUPERE',         // orphelin EN_COURS remis EN_ATTENTE (crash worker)
} as const;

/**
 * Journalise un événement du cycle de vie d'un message (table CourrielEvenement).
 * Best-effort par conception : une panne du journal ne doit JAMAIS interrompre
 * le pipeline d'envoi (l'état courant reste porté par CourrielSortant.statut).
 */
async function journaliserEvenement(
  courrielId: string,
  type: string,
  opts: { fournisseur?: string; message?: string } = {},
): Promise<void> {
  try {
    await db.courrielEvenement.create({
      data: {
        courrielId,
        type,
        fournisseur: opts.fournisseur ?? null,
        message: opts.message?.slice(0, 900) ?? null,
      },
      select: { id: true },
    });
  } catch {
    // Le journal est secondaire : on n'échoue jamais pour lui.
  }
}

/**
 * Calcule la date de la prochaine tentative après l'échec n.
 * Retourne null si le nombre maximal de tentatives est dépassé (→ ECHEC).
 */
export function calculerProchaineTentative(tentativesApresEchec: number, maintenant = new Date()): Date | null {
  const index = tentativesApresEchec - 1; // après le 1er échec → DELAIS_RETRY_S[0]
  if (index < 0 || index >= DELAIS_RETRY_S.length) return null;
  return new Date(maintenant.getTime() + DELAIS_RETRY_S[index] * 1000);
}

// ─── Demande d'envoi ─────────────────────────────────────────────────────────

export interface DemandeEnFile {
  destinataires: { to: string[]; cc?: string[]; bcc?: string[] };
  destinatairePrincipal: string;
  sujet: string;
  texte?: string | null;
  html?: string | null;
  piecesJointes?: { nom: string; contenuBase64: string; contentType?: string }[] | null;
  template?: string | null;
  donnees?: Record<string, unknown> | null;
  fromPersonnalise?: string | null;
  replyTo?: string | null;
  categorie?: string | null;
  priorite?: number;
  source?: string | null;
  sourceId?: string | null;
  /** Tenter la livraison immédiatement (e-mails interactifs : reset mdp, test…) */
  traiter?: boolean;
}

export interface ResultatEnFile {
  id: string;
  statut: string;
  /** Renseigné si `traiter: true` : résultat de la livraison immédiate */
  livraison?: { ok: boolean; messageId?: string; erreur?: string };
}

/** Insère un message déjà validé dans la file (statut EN_ATTENTE). */
export async function mettreEnFile(d: DemandeEnFile): Promise<ResultatEnFile> {
  const msg = await db.courrielSortant.create({
    data: {
      destinataires: d.destinataires as unknown as Prisma.InputJsonValue,
      destinatairePrincipal: d.destinatairePrincipal,
      sujet: d.sujet,
      texte: d.texte ?? null,
      html: d.html ?? null,
      piecesJointes: (d.piecesJointes ?? null) as unknown as Prisma.InputJsonValue,
      template: d.template ?? null,
      donnees: (d.donnees ?? null) as unknown as Prisma.InputJsonValue,
      fromPersonnalise: d.fromPersonnalise ?? null,
      replyTo: d.replyTo ?? null,
      categorie: d.categorie ?? null,
      priorite: d.priorite ?? 5,
      source: d.source ?? null,
      sourceId: d.sourceId ?? null,
      statut: STATUTS.EN_ATTENTE,
    },
    select: { id: true },
  });

  await journaliserEvenement(msg.id, TYPES_EVENEMENT.MISE_EN_FILE, {
    message: `Sujet : ${d.sujet} — destinataire principal : ${d.destinatairePrincipal}`,
  });

  if (d.traiter) {
    const r = await traiterFile({ limite: 1 });
    if (r.idsTraites.includes(msg.id)) {
      const etat = await db.courrielSortant.findUnique({
        where: { id: msg.id },
        select: { statut: true, messageId: true, derniereErreur: true },
      });
      return {
        id: msg.id,
        statut: etat?.statut ?? STATUTS.EN_ATTENTE,
        livraison: {
          ok: etat?.statut === STATUTS.ENVOYE,
          messageId: etat?.messageId ?? undefined,
          erreur: etat?.derniereErreur ?? undefined,
        },
      };
    }
  }

  return { id: msg.id, statut: STATUTS.EN_ATTENTE };
}

// ─── Réclamation atomique des messages (multi-instances) ─────────────────────

/**
 * Réclame jusqu'à `limite` messages prêts : EN_ATTENTE, dont la prochaine
 * tentative (backoff) est échue.
 *
 * Sûreté multi-instances : l'UPDATE ... RETURNING est UNE SEULE instruction
 * atomique — deux workers concurrents ne peuvent jamais réclamer le même
 * message (la sous-requête FOR UPDATE SKIP LOCKED verrouille les lignes
 * candidats, et le WHERE sur le statut re-sécurise la transition).
 * Fallback optimiste id par id (clause WHERE sur statut) pour les
 * environnements non-PostgreSQL.
 */
async function reclamerMessages(limite: number): Promise<string[]> {
  try {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`UPDATE "CourrielSortant"
                SET "statut" = ${STATUTS.EN_COURS}, "updatedAt" = now()
                WHERE "id" IN (
                  SELECT "id" FROM "CourrielSortant"
                  WHERE "statut" = ${STATUTS.EN_ATTENTE}
                    AND ("prochaineTentative" IS NULL OR "prochaineTentative" <= now())
                  ORDER BY "priorite" ASC, "createdAt" ASC
                  LIMIT ${limite}
                  FOR UPDATE SKIP LOCKED
                )
                RETURNING "id"`
    );
    // RETURNING renvoie EXACTEMENT les lignes que CE worker a réclamées —
    // aucune ambiguïté possible avec un autre worker.
    return rows.map((r) => r.id);
  } catch {
    // Fallback optimiste (non-PostgreSQL) : réclamation id par id, garantie
    // par la clause WHERE sur le statut (un message déjà réclamé n'est plus
    // EN_ATTENTE → count 0 → le worker concurrent le laisse).
    const candidats = await db.courrielSortant.findMany({
      where: {
        statut: STATUTS.EN_ATTENTE,
        OR: [{ prochaineTentative: null }, { prochaineTentative: { lte: new Date() } }],
      },
      orderBy: [{ priorite: 'asc' }, { createdAt: 'asc' }],
      take: limite,
      select: { id: true },
    });
    const reclames: string[] = [];
    for (const c of candidats) {
      const res = await db.courrielSortant.updateMany({
        where: { id: c.id, statut: STATUTS.EN_ATTENTE },
        data: { statut: STATUTS.EN_COURS, updatedAt: new Date() },
      });
      if (res.count === 1) reclames.push(c.id);
    }
    return reclames;
  }
}

// ─── Traitement de la file ───────────────────────────────────────────────────

export interface ResultatTraitement {
  /** Messages réellement traités (envoyés ou mis à jour) */
  idsTraites: string[];
  envoyes: number;
  retriesProgrammes: number;
  echecsDefinitifs: number;
  /** Erreurs détaillées pour le retour API / logs */
  erreurs: { id: string; erreur: string }[];
}

/**
 * Traite la file : réclame des messages, les livre via SMTP, met à jour
 * leur statut (ENVOYE / retry avec backoff / ECHEC).
 */
export async function traiterFile(opts: { limite?: number } = {}): Promise<ResultatTraitement> {
  const limite = Math.min(Math.max(opts.limite ?? 10, 1), 50);
  const result: ResultatTraitement = { idsTraites: [], envoyes: 0, retriesProgrammes: 0, echecsDefinitifs: 0, erreurs: [] };

  const ids = await reclamerMessages(limite);
  if (ids.length === 0) return result;

  for (const id of ids) {
    await journaliserEvenement(id, TYPES_EVENEMENT.EN_COURS);
  }

  const messages = await db.courrielSortant.findMany({ where: { id: { in: ids } } });
  result.idsTraites = messages.map((m) => m.id);

  for (const msg of messages) {
    try {
      const dest = msg.destinataires as unknown as { to: string[]; cc?: string[]; bcc?: string[] };
      const livraison = await livrerMessage({
        id: msg.id,
        destinataires: { to: dest.to, cc: dest.cc, bcc: dest.bcc },
        sujet: msg.sujet,
        texte: msg.texte,
        html: msg.html,
        piecesJointes: (msg.piecesJointes as unknown as { nom: string; contenuBase64: string; contentType?: string }[] | null) ?? undefined,
        fromPersonnalise: msg.fromPersonnalise,
        replyTo: msg.replyTo,
      });

      if (livraison.ok) {
        await db.courrielSortant.update({
          where: { id: msg.id },
          data: {
            statut: STATUTS.ENVOYE,
            tentatives: { increment: 1 },
            messageId: livraison.messageId,
            envoyeLe: new Date(),
            derniereErreur: null,
            updatedAt: new Date(),
          },
        });
        await journaliserEvenement(msg.id, TYPES_EVENEMENT.ENVOYE, {
          message: livraison.messageId ? `Message-ID : ${livraison.messageId}` : undefined,
        });
        result.envoyes++;
      } else {
        const tentative = msg.tentatives + 1;
        const prochaine = calculerProchaineTentative(tentative);
        if (livraison.temporaire && prochaine) {
          // Retry programmé (backoff exponentiel)
          await db.courrielSortant.update({
            where: { id: msg.id },
            data: {
              statut: STATUTS.EN_ATTENTE,
              tentatives: tentative,
              prochaineTentative: prochaine,
              derniereErreur: livraison.erreur?.slice(0, 900),
              updatedAt: new Date(),
            },
          });
          result.retriesProgrammes++;
          await journaliserEvenement(msg.id, TYPES_EVENEMENT.RETRY, {
            message: `Tentative ${tentative} — nouvelle tentative à ${prochaine.toISOString()} — ${livraison.erreur ?? 'erreur temporaire'}`,
          });
          result.erreurs.push({ id: msg.id, erreur: `Retry programmé : ${livraison.erreur}` });
        } else {
          await db.courrielSortant.update({
            where: { id: msg.id },
            data: {
              statut: STATUTS.ECHEC,
              tentatives: tentative,
              prochaineTentative: null,
              derniereErreur: livraison.erreur?.slice(0, 900),
              updatedAt: new Date(),
            },
          });
          result.echecsDefinitifs++;
          await journaliserEvenement(msg.id, TYPES_EVENEMENT.ECHEC, {
            message: `Tentative ${tentative} — ${livraison.erreur ?? 'erreur permanente'}`,
          });
          result.erreurs.push({ id: msg.id, erreur: `Échec définitif : ${livraison.erreur}` });
        }
      }
    } catch (e: unknown) {
      // Erreur inattendue du moteur : sécuriser le message (retry, pas de perte)
      const msgErreur = e instanceof Error ? e.message : String(e);
      const tentative = msg.tentatives + 1;
      const prochaine = calculerProchaineTentative(tentative);
      await db.courrielSortant.update({
        where: { id: msg.id },
        data: {
          statut: prochaine ? STATUTS.EN_ATTENTE : STATUTS.ECHEC,
          tentatives: tentative,
          prochaineTentative: prochaine,
          derniereErreur: `Erreur interne : ${msgErreur.slice(0, 800)}`,
          updatedAt: new Date(),
        },
      }).catch(() => undefined);
      await journaliserEvenement(msg.id, prochaine ? TYPES_EVENEMENT.RETRY : TYPES_EVENEMENT.ECHEC, {
        message: `Erreur interne (tentative ${tentative}) : ${msgErreur}`,
      }).catch(() => undefined);
      result.echecsDefinitifs++;
      result.erreurs.push({ id: msg.id, erreur: `Erreur interne : ${msgErreur}` });
    }
  }

  return result;
}

// ─── Résilience : orphelins et purge ─────────────────────────────────────────

/**
 * Remet EN_ATTENTE les messages restés EN_COURS trop longtemps (crash de
 * l'instance pendant l'envoi). Limite : 15 minutes.
 */
export async function recupererOrphelins(): Promise<number> {
  const seuil = new Date(Date.now() - 15 * 60 * 1000);
  const orphelins = await db.courrielSortant.findMany({
    where: { statut: STATUTS.EN_COURS, updatedAt: { lt: seuil } },
    select: { id: true },
  });
  if (orphelins.length === 0) return 0;
  const res = await db.courrielSortant.updateMany({
    where: { id: { in: orphelins.map((o) => o.id) }, statut: STATUTS.EN_COURS, updatedAt: { lt: seuil } },
    data: { statut: STATUTS.EN_ATTENTE, updatedAt: new Date() },
  });
  for (const o of orphelins) {
    await journaliserEvenement(o.id, TYPES_EVENEMENT.RECUPERE, {
      message: 'Message resté EN_COURS plus de 15 min (crash d\'instance) — remis en file',
    });
  }
  return res.count;
}

/**
 * Purge le journal : ENVOYE > 90 jours, ECHEC > 180 jours.
 * Appelée par la route process (cron quotidien).
 */
export async function purgerAnciens(): Promise<{ envoyes: number; echecs: number }> {
  const now = Date.now();
  const envoyes = await db.courrielSortant.deleteMany({
    where: { statut: STATUTS.ENVOYE, envoyeLe: { lt: new Date(now - 90 * 24 * 3600 * 1000) } },
  });
  const echecs = await db.courrielSortant.deleteMany({
    where: { statut: STATUTS.ECHEC, updatedAt: { lt: new Date(now - 180 * 24 * 3600 * 1000) } },
  });
  return { envoyes: envoyes.count, echecs: echecs.count };
}

// ─── Statistiques de suivi ───────────────────────────────────────────────────

export interface StatsFile {
  enAttente: number;
  enCours: number;
  envoyes24h: number;
  echecs24h: number;
  parStatut: { statut: string; total: number }[];
}

export async function statistiquesFile(): Promise<StatsFile> {
  const [enAttente, enCours, envoyes24h, echecs24h, parStatut] = await Promise.all([
    db.courrielSortant.count({ where: { statut: STATUTS.EN_ATTENTE } }),
    db.courrielSortant.count({ where: { statut: STATUTS.EN_COURS } }),
    db.courrielSortant.count({ where: { statut: STATUTS.ENVOYE, envoyeLe: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    db.courrielSortant.count({ where: { statut: STATUTS.ECHEC, updatedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    db.courrielSortant.groupBy({ by: ['statut'], _count: { statut: true } }),
  ]);
  return {
    enAttente,
    enCours,
    envoyes24h,
    echecs24h,
    parStatut: parStatut.map((g) => ({ statut: g.statut, total: g._count.statut })),
  };
}
