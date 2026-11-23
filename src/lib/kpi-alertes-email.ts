/**
 * kpi-alertes-email.ts — Digest quotidien des alertes de performance (R5).
 * ────────────────────────────────────────────────────────────────────────────
 * Décision (R5) : FRÉQUENCE QUOTIDIENNE — un digest par jour à 07 h Madagascar
 * (04 h UTC, même créneau que le rapport mensuel), via Vercel Cron
 * (/api/cron/kpi-alertes, vercel.json) ou node-cron en développement local.
 *
 * Anti-abus (réutilisation des barrières existantes) :
 *   - AUCUN courriel si aucune alerte active (pas de « spam à vide ») ;
 *   - un SEUL message agrégé par exécution (jamais 1 courriel par alerte) ;
 *   - envoi par le service de messagerie centralisé (file + retries + quotas
 *     + rate-limiting + anti-abus de src/lib/mail) ;
 *   - coupe-circuit : KPI_ALERTES_EMAIL=off désactive l'envoi (utile en
 *     recette) ; le cron ne tourne que si SMTP est configuré ;
 *   - destinataires fermés : comptes actifs ADMINISTRATEUR +
 *     DIRECTION_GENERALE, à défaut l'adresse des rapports configurée.
 *
 * Le contenu est calculé par le MÊME moteur que l'écran Alertes
 * (kpi-performance.calculerAlertes) — cohérence garantie par construction.
 */

import { db } from './db';
import { getEmailRapportDestinataire } from './email';
import { envoyerCourriel } from '@/lib/mail';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerAlertes,
  type AlertesKpi, type PeriodeKpi,
} from './kpi-performance';

/** Durée de référence du digest : 30 jours glissants (état ouvert + tendances). */
const DUREE_JOURS = 30;

const SERVICE_LABELS: Record<string, string> = {
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Service Technique',
  CONTROLE_MEDICAL: 'Contrôle médical',
  COMPTABILITE: 'Comptabilité',
};

export function serviceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}

// ─── Destinataires ───────────────────────────────────────────────────────────

/** Comptes actifs ADMINISTRATEUR / DIRECTION_GENERALE, à défaut l'adresse rapport. */
export async function destinatairesAlertesKpi(): Promise<string[]> {
  try {
    const comptes = await db.utilisateur.findMany({
      where: { role: { in: ['ADMINISTRATEUR', 'DIRECTION_GENERALE'] }, actif: true },
      select: { email: true },
    });
    const emails = comptes.map((u) => u.email).filter(Boolean);
    if (emails.length > 0) return emails;
  } catch (e) {
    console.error('[ALERTES KPI] Erreur de lecture des destinataires :', e);
  }
  const secours = await getEmailRapportDestinataire().catch(() => null);
  return secours ? [secours] : [];
}

// ─── Période + calcul ────────────────────────────────────────────────────────

export function periodeDigest(now: Date = new Date()): PeriodeKpi {
  const fin = new Date(now);
  fin.setHours(23, 59, 59, 999);
  const debut = new Date(fin.getTime() - DUREE_JOURS * 86_400_000);
  return { debut, fin };
}

// ─── Template HTML (style cohérent avec le rapport mensuel) ──────────────────

function ligneDossier(numero: string, service: string, detail: string, rouge: boolean): string {
  return `
  <tr>
    <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:12px; font-weight:600;">${numero}</td>
    <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:12px;">${serviceLabel(service)}</td>
    <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:12px; text-align:right; color:${rouge ? '#dc2626' : '#d97706'};">${detail}</td>
  </tr>`;
}

function tableauAlertes(titre: string, lignes: string, couleur: string): string {
  return `
  <tr><td style="padding: 8px 32px 4px 32px;">
    <h3 style="margin:0 0 6px 0; font-size:14px; color:${couleur};">${titre}</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
      <tr style="background:#f9fafb;">
        <th style="padding:6px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase;">Dossier</th>
        <th style="padding:6px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase;">Service</th>
        <th style="padding:6px 12px; text-align:right; font-size:11px; color:#6b7280; text-transform:uppercase;">Consommé</th>
      </tr>
      ${lignes}
    </table>
  </td></tr>`;
}

/** HTML du digest — 100 % échappé par construction (numéros et services du référentiel). */
export function genererHtmlAlertesKpi(periode: PeriodeKpi, alertes: AlertesKpi): string {
  const periodeTxt = `${periode.debut.toLocaleDateString('fr-FR')} — ${periode.fin.toLocaleDateString('fr-FR')}`;
  const depasses = alertes.dossiersDepasses
    .slice(0, 15)
    .map((a) => ligneDossier(a.numeroDossier, a.service, `${a.pourcentageObjectif} % de l'objectif`, true))
    .join('');
  const proches = alertes.dossiersProches
    .slice(0, 15)
    .map((a) => ligneDossier(a.numeroDossier, a.service, `${a.pourcentageObjectif} % de l'objectif`, false))
    .join('');

  const structurelles = [
    ...alertes.accumulations.map((a) =>
      `<div style="padding:4px 0; font-size:12px;">Accumulation — <strong>${serviceLabel(a.service)}</strong> : ${a.nbOuverts} dossiers ouverts (seuil ${a.seuil})</div>`),
    ...alertes.degradations.map((d) =>
      `<div style="padding:4px 0; font-size:12px;">Dégradation — <strong>${serviceLabel(d.service)}</strong> : ${d.tauxPrecedent} % → ${d.tauxActuel} % de respect</div>`),
    ...alertes.hausseRetours.map((h) =>
      `<div style="padding:4px 0; font-size:12px;">Hausse des retours — <strong>${serviceLabel(h.service)}</strong> : ${h.taux} % (seuil ${h.seuil} %)</div>`),
  ].join('');

  const total = alertes.dossiersDepasses.length + alertes.dossiersProches.length
    + alertes.accumulations.length + alertes.degradations.length + alertes.hausseRetours.length;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 20px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background: linear-gradient(135deg, #b45309, #92400e); padding: 24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="margin:0; color:#ffffff; font-size:20px; font-weight:700;">Suivi Santé</h1>
                  <p style="margin:4px 0 0 0; color:rgba(255,255,255,0.85); font-size:13px;">Alertes de performance — digest quotidien</p>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.2); color:#fff; padding:4px 12px; border-radius:20px; font-size:12px;">${total} alerte(s)</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding: 16px 32px 4px 32px;">
          <p style="margin:0; font-size:12px; color:#6b7280;">
            Période analysée : ${periodeTxt} (30 jours glissants) — seuils et délais cibles du module KPI.
          </p>
        </td></tr>
        ${alertes.dossiersDepasses.length > 0 ? tableauAlertes(`Dossiers ayant dépassé leur délai cible (${alertes.dossiersDepasses.length})`, depasses, '#dc2626') : ''}
        ${alertes.dossiersProches.length > 0 ? tableauAlertes(`Dossiers proches de leur délai cible (${alertes.dossiersProches.length})`, proches, '#d97706') : ''}
        ${structurelles ? `
        <tr><td style="padding: 8px 32px;">
          <h3 style="margin:0 0 6px 0; font-size:14px; color:#374151;">Alertes structurelles</h3>
          ${structurelles}
        </td></tr>` : ''}
        <tr>
          <td style="background:#f9fafb; padding:16px 32px; border-top:1px solid #e5e7eb;">
            <p style="margin:0; font-size:11px; color:#9ca3af; text-align:center;">
              Digest quotidien généré automatiquement par Suivi Santé — module « Performance des collaborateurs ».
              <br>Consultez l'écran KPI → Alertes pour le détail complet ; ce message part uniquement lorsqu'au moins une alerte est active.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Envoi du digest ─────────────────────────────────────────────────────────

export interface ResultatAlertesKpi {
  /** true = un courriel est parti (ou est en file) */
  envoye: boolean;
  /** false + motif = aucune alerte / désactivé / sans destinataire */
  motif?: string;
  totalAlertes: number;
  destinataires: string[];
  erreur?: string;
}

/** Calcule les alertes et envoie UN digest quotidien (anti-abus : rien si vide). */
export async function envoyerDigestAlertesKpi(): Promise<ResultatAlertesKpi> {
  if ((process.env.KPI_ALERTES_EMAIL ?? '').toLowerCase() === 'off') {
    return { envoye: false, motif: 'DESACTIVE', totalAlertes: 0, destinataires: [] };
  }

  const destinataires = await destinatairesAlertesKpi();
  if (destinataires.length === 0) {
    return { envoye: false, motif: 'SANS_DESTINATAIRE', totalAlertes: 0, destinataires: [] };
  }

  const periode = periodeDigest();
  const [etapes, objectifs, seuils] = await Promise.all([
    chargerEtapesPeriode(periode),
    chargerObjectifs(),
    chargerSeuils(),
  ]);
  const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
  const total = alertes.dossiersDepasses.length + alertes.dossiersProches.length
    + alertes.accumulations.length + alertes.degradations.length + alertes.hausseRetours.length;

  // Anti-abus principal : pas de courriel « tout va bien ».
  if (total === 0) {
    return { envoye: false, motif: 'AUCUNE_ALERTE', totalAlertes: 0, destinataires };
  }

  try {
    const resultat = await envoyerCourriel({
      destinataires,
      sujet: `Suivi Santé — Alertes de performance (${total} alerte${total > 1 ? 's' : ''})`,
      texte: `Alertes de performance du ${periode.debut.toLocaleDateString('fr-FR')} au ${periode.fin.toLocaleDateString('fr-FR')} :\n`
        + `- Dossiers dépassés : ${alertes.dossiersDepasses.length}\n`
        + `- Dossiers proches : ${alertes.dossiersProches.length}\n`
        + `- Alertes structurelles : ${alertes.accumulations.length + alertes.degradations.length + alertes.hausseRetours.length}\n`
        + `\nDétail dans l'écran KPI → Alertes.`,
      html: genererHtmlAlertesKpi(periode, alertes),
      categorie: 'ALERTE_KPI',
      priorite: 3,
      source: 'kpi-alertes-digest',
      traiter: true,
    });
    if (!resultat.accepte) {
      return { envoye: false, totalAlertes: total, destinataires, erreur: resultat.motif ?? 'Envoi refusé' };
    }
    if (resultat.envoi?.livraison && !resultat.envoi.livraison.ok) {
      return { envoye: false, totalAlertes: total, destinataires, erreur: resultat.envoi.livraison.erreur ?? 'Livraison échouée' };
    }
    return { envoye: true, totalAlertes: total, destinataires };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ALERTES KPI] Erreur d\u2019envoi :', e);
    return { envoye: false, totalAlertes: total, destinataires, erreur: msg };
  }
}
