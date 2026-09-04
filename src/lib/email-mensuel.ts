import { db } from './db';
import { getEmailRapportDestinataire } from './email';
import { envoyerCourriel, envoyerEmailTest } from '@/lib/mail';
import { getPrestationLabel } from './prestations';

// ─── Type pour un expéditeur Comptabilité ──────────────────────────────────
interface ExpediteurComptable {
  nom: string;
  email: string;
}

/** Récupère les utilisateurs COMPTABILITE actifs (pour l'expéditeur des rapports) */
async function getExpediteursComptabilite(): Promise<ExpediteurComptable[]> {
  try {
    return await db.utilisateur.findMany({
      where: { role: 'COMPTABILITE', actif: true },
      select: { nom: true, email: true },
    });
  } catch {
    return [];
  }
}

/** Formate l'adresse d'expéditeur : "Nom Prénom <email>" */
function formatExpediteur(exp: ExpediteurComptable): string {
  return `"${exp.nom}" <${exp.email}>`;
}

// ─── Template HTML du rapport mensuel par société ──────────────────────────

function genererHTMLRapportSociete(data: {
  societeNom: string;
  periode: string;
  totalDossiers: number;
  parStatut: { statut: string; count: number }[];
  montantReclame: number;
  montantPaye: number;
  montantEnCours: number;
  delaiMoyen: number;
  topPrestations: { type: string; count: number; montant: number }[];
  parAssure: { nom: string; nbDossiers: number; montantReclame: number; montantPaye: number }[];
  appelsFonds: { reference: string | null; montant: number; statut: string; datePaiement?: string | null }[];
  fondsDisponibles: number;
  budgetUtilise: number;
  budgetTotal: number;
  /** Signature de l'expéditeur (comptable) */
  expediteurNom?: string;
  expediteurEmail?: string;
}): string {
  const statutColors: Record<string, string> = {
    RECU: '#f59e0b', EN_ANALYSE: '#3b82f6', VALIDE: '#8b5cf6',
    EN_COMPTABILITE: '#ec4899', EN_PAIEMENT: '#f97316', PAYE: '#10b981', REJETE: '#ef4444',
  };
  const statutLabels: Record<string, string> = {
    RECU: 'Reçu', EN_ANALYSE: 'En analyse', VALIDE: 'Validé',
    EN_COMPTABILITE: 'En comptabilité', EN_PAIEMENT: 'En paiement', PAYE: 'Payé', REJETE: 'Rejeté',
  };

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

  const statutRows = data.parStatut.map(s => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${statutColors[s.statut] || '#9ca3af'}; margin-right:8px;"></span>
        ${statutLabels[s.statut] || s.statut}
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align:center; font-weight:600;">${s.count}</td>
    </tr>
  `).join('');

  const prestationRows = data.topPrestations.map(p => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${getPrestationLabel(p.type)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align:center;">${p.count}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align:right;">${fmt(p.montant)} AR</td>
    </tr>
  `).join('');

  const tauxPaiement = data.totalDossiers > 0
    ? Math.round(((data.parStatut.find(s => s.statut === 'PAYE')?.count || 0) / data.totalDossiers) * 100)
    : 0;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 20px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

        <!-- En-tête -->
        <tr>
          <td style="background: linear-gradient(135deg, #059669, #047857); padding: 24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="margin:0; color:#ffffff; font-size:20px; font-weight:700;">Suivi Santé</h1>
                  <p style="margin:4px 0 0 0; color:rgba(255,255,255,0.85); font-size:13px;">Rapport Mensuel de Gestion des Dossiers Santé</p>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.2); color:#fff; padding:4px 12px; border-radius:20px; font-size:12px;">${data.periode}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Nom société -->
        <tr>
          <td style="padding: 20px 32px 8px 32px;">
            <h2 style="margin:0; font-size:18px; color:#111827;">${data.societeNom}</h2>
          </td>
        </tr>

        <!-- KPI Cards -->
        <tr>
          <td style="padding: 8px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="padding:4px;">
                  <div style="background:#ecfdf5; border-radius:8px; padding:16px; text-align:center;">
                    <p style="margin:0; font-size:24px; font-weight:700; color:#059669;">${data.totalDossiers}</p>
                    <p style="margin:4px 0 0 0; font-size:11px; color:#6b7280; text-transform:uppercase;">Dossiers</p>
                  </div>
                </td>
                <td width="33%" style="padding:4px;">
                  <div style="background:#eff6ff; border-radius:8px; padding:16px; text-align:center;">
                    <p style="margin:0; font-size:24px; font-weight:700; color:#2563eb;">${fmt(data.montantReclame)} AR</p>
                    <p style="margin:4px 0 0 0; font-size:11px; color:#6b7280; text-transform:uppercase;">Réclamé</p>
                  </div>
                </td>
                <td width="33%" style="padding:4px;">
                  <div style="background:#f0fdf4; border-radius:8px; padding:16px; text-align:center;">
                    <p style="margin:0; font-size:24px; font-weight:700; color:#16a34a;">${tauxPaiement}%</p>
                    <p style="margin:4px 0 0 0; font-size:11px; color:#6b7280; text-transform:uppercase;">Taux paiement</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Deux colonnes : Statut + Prestations -->
        <tr>
          <td style="padding: 16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding-right:8px; vertical-align:top;">
                  <h3 style="margin:0 0 8px 0; font-size:14px; color:#374151;">Répartition par statut</h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                    ${statutRows}
                  </table>
                </td>
                <td width="50%" style="padding-left:8px; vertical-align:top;">
                  <h3 style="margin:0 0 8px 0; font-size:14px; color:#374151;">Top prestations</h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                    <tr style="background:#f9fafb;">
                      <th style="padding:8px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Type</th>
                      <th style="padding:8px 12px; text-align:center; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Nb</th>
                      <th style="padding:8px 12px; text-align:right; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Montant</th>
                    </tr>
                    ${prestationRows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Montants + Budget -->
        <tr>
          <td style="padding: 8px 32px 16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border-radius:8px; padding:12px;">
              <tr>
                <td style="padding:8px 12px;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">Montant paye</p>
                  <p style="margin:2px 0 0 0; font-size:16px; font-weight:600; color:#059669;">${fmt(data.montantPaye)} AR</p>
                </td>
                <td style="padding:8px 12px;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">En cours de paiement</p>
                  <p style="margin:2px 0 0 0; font-size:16px; font-weight:600; color:#d97706;">${fmt(data.montantEnCours)} AR</p>
                </td>
                <td style="padding:8px 12px;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">Delai moyen</p>
                  <p style="margin:2px 0 0 0; font-size:16px; font-weight:600; color:#2563eb;">${data.delaiMoyen} jours</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.parAssure.length > 0 ? `
        <!-- Depenses par salarie/famille -->
        <tr>
          <td style="padding: 4px 32px 8px 32px;">
            <h3 style="margin:0 0 8px 0; font-size:14px; color:#374151;">Depenses par salarie / famille</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Beneficiaire</th>
                <th style="padding:8px 12px; text-align:center; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Nb dossiers</th>
                <th style="padding:8px 12px; text-align:right; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Reclame</th>
                <th style="padding:8px 12px; text-align:right; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Paye</th>
              </tr>
              ${data.parAssure.slice(0, 20).map(a => `
              <tr>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:12px;">${a.nom}</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:center; font-size:12px;">${a.nbDossiers}</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:right; font-size:12px;">${fmt(a.montantReclame)} AR</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:right; font-size:12px;">${fmt(a.montantPaye)} AR</td>
              </tr>`).join('')}
            </table>
          </td>
        </tr>` : ''}

        ${(data.appelsFonds.length > 0 || data.budgetTotal > 0) ? `
        <!-- Budget et appels de fonds -->
        <tr>
          <td style="padding: 4px 32px 8px 32px;">
            <h3 style="margin:0 0 8px 0; font-size:14px; color:#374151;">Budget et appels de fonds</h3>
            ${data.budgetTotal > 0 ? `
            <div style="background:#eff6ff; border-radius:8px; padding:12px; margin-bottom:8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;"><p style="margin:0; font-size:12px; color:#6b7280;">Budget annuel</p><p style="margin:2px 0 0 0; font-size:15px; font-weight:600; color:#1e40af;">${fmt(data.budgetTotal)} AR</p></td>
                  <td style="padding:4px 0;"><p style="margin:0; font-size:12px; color:#6b7280;">Budget utilise</p><p style="margin:2px 0 0 0; font-size:15px; font-weight:600; color:#d97706;">${fmt(data.budgetUtilise)} AR</p></td>
                  <td style="padding:4px 0;"><p style="margin:0; font-size:12px; color:#6b7280;">Fonds disponibles</p><p style="margin:2px 0 0 0; font-size:15px; font-weight:600; color:#059669;">${fmt(data.fondsDisponibles)} AR</p></td>
                </tr>
              </table>
            </div>` : ''}
            ${data.appelsFonds.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Reference</th>
                <th style="padding:8px 12px; text-align:right; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Montant</th>
                <th style="padding:8px 12px; text-align:center; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Statut</th>
                <th style="padding:8px 12px; text-align:center; font-size:11px; color:#6b7280; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Date paiement</th>
              </tr>
              ${data.appelsFonds.map(af => `
              <tr>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:12px;">${af.reference}</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:right; font-size:12px;">${fmt(af.montant)} AR</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:center; font-size:12px;">${af.statut}</td>
                <td style="padding:6px 12px; border-bottom:1px solid #f3f4f6; text-align:center; font-size:12px;">${af.datePaiement || 'En attente'}</td>
              </tr>`).join('')}
            </table>` : ''}
          </td>
        </tr>` : ''}

        <!-- Signature expéditeur -->
        ${data.expediteurNom ? `
        <tr>
          <td style="padding: 12px 32px 4px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0;">
                  <p style="margin:0; font-size:13px; color:#374151; font-weight:600;">${data.expediteurNom}</p>
                  <p style="margin:2px 0 0 0; font-size:11px; color:#6b7280;">Service Comptabilité — Suivi Santé</p>
                  ${data.expediteurEmail ? `<p style="margin:2px 0 0 0; font-size:11px; color:#059669;">${data.expediteurEmail}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- Pied de page -->
        <tr>
          <td style="background:#f9fafb; padding:16px 32px; border-top:1px solid #e5e7eb;">
            <p style="margin:0; font-size:11px; color:#9ca3af; text-align:center;">
              Ce rapport est généré automatiquement par Suivi Santé — Plateforme de gestion des dossiers de santé.
              <br>Pour toute question, répondez directement à cet email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Envoi du rapport mensuel à toutes les sociétés ─────────────────────────

export async function envoyerRapportMensuel(): Promise<{
  envoyes: number;
  erreurs: { societe: string; erreur: string }[];
  details: { societe: string; destinataires: string[]; expediteur: string }[];
}> {
  const maintenant = new Date();
  const moisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
  const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

  const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const periode = `${nomsMois[moisPrecedent.getMonth()]} ${moisPrecedent.getFullYear()}`;

  // Récupérer les expéditeurs (utilisateurs COMPTABILITE actifs)
  const comptables = await getExpediteursComptabilite();
  if (comptables.length === 0) {
    console.warn('[EMAIL MENSUEL] Aucun utilisateur COMPTABILITE actif trouvé — envoi annulé');
    return { envoyes: 0, erreurs: [{ societe: 'Système', erreur: 'Aucun utilisateur Comptabilité actif trouvé pour l\'expédition des rapports.' }], details: [] };
  }

  // Récupérer toutes les sociétés avec leurs contacts email
  const societes = await db.societe.findMany({
    include: {
      contacts: { where: { actif: true, email: { not: null } }, select: { email: true, nom: true, prenom: true } },
    },
  });

  const envoyes: { societe: string; destinataires: string[]; expediteur: string }[] = [];
  const erreurs: { societe: string; erreur: string }[] = [];

  // Distribuer les sociétés entre les comptables (round-robin)
  let comptableIndex = 0;

  for (const societe of societes) {
    try {
      // Dossiers du mois précédent pour cette société
      const dossiers = await db.dossier.findMany({
        where: {
          societeId: societe.id,
          dateReception: { gte: moisPrecedent, lt: moisSuivant },
        },
      });

      if (dossiers.length === 0) continue;

      // ── Destinataires : uniquement les emails de la société cliente ──
      const destinataires: string[] = [];

      // 1. Email principal de la société
      if (societe.email) {
        destinataires.push(societe.email);
      }

      // 2. Emails des contacts de la société
      for (const contact of societe.contacts) {
        if (contact.email && !destinataires.includes(contact.email)) {
          destinataires.push(contact.email);
        }
      }

      if (destinataires.length === 0) {
        console.warn(`[EMAIL MENSUEL] ${societe.nom} : aucun email de contact trouvé — ignoré`);
        continue;
      }

      // ── Expéditeur : utilisateur COMPTABILITE (round-robin) ──
      const comptable = comptables[comptableIndex % comptables.length];
      comptableIndex++;
      const fromPersonnalise = formatExpediteur(comptable);

      // Calculer les statistiques
      const parStatut = dossiers.reduce<Record<string, number>>((acc, d) => {
        acc[d.statut] = (acc[d.statut] || 0) + 1;
        return acc;
      }, {});

      const statutList = Object.entries(parStatut)
        .map(([statut, count]) => ({ statut, count }))
        .sort((a, b) => b.count - a.count);

      const montantReclame = dossiers.reduce((s, d) => s + d.montantReclame, 0);
      const montantPaye = dossiers.reduce((s, d) => s + (d.montantPaye || 0), 0);
      const montantEnCours = dossiers
        .filter(d => d.statut === 'EN_PAIEMENT' || d.statut === 'EN_COMPTABILITE')
        .reduce((s, d) => s + (d.montantValide || d.montantReclame), 0);

      // Délai moyen
      const payes = dossiers.filter(d => d.datePaiement && d.dateReception);
      const delaiMoyen = payes.length > 0
        ? Math.round(payes.reduce((s, d) => s + (d.datePaiement!.getTime() - d.dateReception.getTime()) / 86400000, 0) / payes.length)
        : 0;

      // Top prestations
      const prestationMap = new Map<string, { count: number; montant: number }>();
      for (const d of dossiers) {
        const existing = prestationMap.get(d.typeDossier) || { count: 0, montant: 0 };
        existing.count++;
        existing.montant += d.montantReclame;
        prestationMap.set(d.typeDossier, existing);
      }
      const topPrestations = Array.from(prestationMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Dépenses par assuré (bénéficiaire)
      const assureMap = new Map<string, { nom: string; nbDossiers: number; montantReclame: number; montantPaye: number }>();
      for (const d of dossiers) {
        const key = d.beneficiaire;
        const existing = assureMap.get(key) || { nom: key, nbDossiers: 0, montantReclame: 0, montantPaye: 0 };
        existing.nbDossiers++;
        existing.montantReclame += d.montantReclame;
        existing.montantPaye += d.montantPaye || 0;
        assureMap.set(key, existing);
      }
      const parAssure = Array.from(assureMap.values()).sort((a, b) => b.montantReclame - a.montantReclame);

      // Appels de fonds et budget
      const tousContrats = await db.contrat.findMany({
        where: { societeId: societe.id },
        include: { appelsDeFonds: { select: { montant: true, reference: true, statut: true, datePaiement: true } } },
      });
      const budgetTotal = tousContrats.reduce((s, c) => s + c.budgetAnnuel, 0);
      const budgetUtilise = tousContrats.reduce((s, c) => {
        return s + c.appelsDeFonds.reduce((a: number, f) => a + (Number(f.montant) || 0), 0);
      }, 0);
      const fondsDisponibles = budgetTotal - budgetUtilise;
      const appelsFonds = tousContrats.flatMap(c => c.appelsDeFonds).map(af => ({
        reference: af.reference,
        montant: af.montant,
        statut: af.statut,
        datePaiement: af.datePaiement ? af.datePaiement.toLocaleDateString('fr-FR') : null,
      }));

      const html = genererHTMLRapportSociete({
        societeNom: societe.nom,
        periode,
        totalDossiers: dossiers.length,
        parStatut: statutList,
        montantReclame,
        montantPaye,
        montantEnCours,
        delaiMoyen,
        topPrestations,
        parAssure,
        appelsFonds,
        fondsDisponibles,
        budgetUtilise,
        budgetTotal,
        expediteurNom: comptable.nom,
        expediteurEmail: comptable.email,
      });

      // Récupérer l'email admin BCC (copie des rapports)
      const emailBccAdmin = await getEmailRapportDestinataire();
      const bcc = emailBccAdmin ? [emailBccAdmin] : undefined;

      // Envoi via le service de messagerie centralisé (file + retry + suivi)
      const resultat = await envoyerCourriel({
        destinataires,
        sujet: `Suivi Santé — Rapport Mensuel ${periode} — ${societe.nom}`,
        texte: `Bonjour,\n\nVeuillez trouver ci-joint le rapport mensuel de gestion des dossiers de santé pour ${societe.nom} — ${periode}.\n\nCordialement,\n${comptable.nom}\nService Comptabilité — Suivi Santé`,
        html,
        fromPersonnalise,
        replyTo: comptable.email,
        bcc,
        categorie: 'RAPPORT_MENSUEL',
        priorite: 4,
        source: 'email-mensuel',
        sourceId: comptable.email,
        traiter: true, // livraison immédiate attendue dans le flux cron
      });
      if (!resultat.accepte) {
        throw new Error(resultat.motif || 'Envoi refusé par le service de messagerie');
      }
      if (resultat.envoi?.livraison && !resultat.envoi.livraison.ok) {
        // Erreur SMTP : le message est conservé en file (retries automatiques)
        throw new Error(resultat.envoi.livraison.erreur || 'Livraison SMTP échouée');
      }

      envoyes.push({ societe: societe.nom, destinataires, expediteur: fromPersonnalise });
      console.log(`[EMAIL MENSUEL] Rapport envoyé pour ${societe.nom} → ${destinataires.join(', ')} (par ${comptable.nom})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      erreurs.push({ societe: societe.nom, erreur: msg });
      console.error(`[EMAIL MENSUEL] Erreur pour ${societe.nom}:`, e);
    }
  }

  return { envoyes: envoyes.length, erreurs, details: envoyes };
}

// ─── Test d'envoi immédiat (pour l'Admin) ────────────────────────────────────

export async function envoyerTestEmail(destinataire: string): Promise<{ ok: boolean; erreur?: string }> {
  try {
    const resultat = await envoyerEmailTest(destinataire);
    if (!resultat.accepte) {
      return { ok: false, erreur: resultat.motif };
    }
    if (resultat.envoi?.livraison && !resultat.envoi.livraison.ok) {
      return { ok: false, erreur: resultat.envoi.livraison.erreur };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: msg };
  }
}