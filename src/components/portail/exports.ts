'use client';

/**
 * exports.ts — Téléchargements du portail client (P2-02C/D).
 *
 *   - CSV : le serveur produit le fichier (échappement + ANTI-INJECTION de
 *     formules, périmètre et filtres identiques à la lecture) → blob local.
 *   - PDF : rendu CLIENT avec jsPDF + jspdf-autotable (déjà dépendances du
 *     projet) — en-tête société, date/heure de génération, période et
 *     critères de filtrage, tableau des dossiers, totaux financiers,
 *     pagination avec numéros de page du document.
 *
 * Les deux formats consomment le MÊME endpoint /api/portail-client/export :
 * périmètre société, permissions et confidentialité NSS identiques (aucune
 * colonne NSS dans l'export).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PortailData } from './types';

/** Construit la query d'export depuis les filtres actifs (conservés). */
function queryExport(filtres: { search: string; statut: string }, qsPeriode: string): string {
  const params = new URLSearchParams();
  if (qsPeriode) {
    for (const [k, v] of new URLSearchParams(qsPeriode)) params.set(k, v);
  }
  if (filtres.search) params.set('search', filtres.search);
  if (filtres.statut) params.set('statut', filtres.statut);
  return params.toString();
}

export async function telechargerExportCsv(
  filtres: { search: string; statut: string },
  qsPeriode: string,
): Promise<void> {
  const res = await fetch(`/api/portail-client/export?format=csv&${queryExport(filtres, qsPeriode)}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { erreur?: string };
    throw new Error(err.erreur || 'Export CSV impossible.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dossiers-portail-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Statuts lisibles pour l'export PDF (même source de vérité que l'UI). */
function libelleStatut(statut: string): string {
  switch (statut) {
    case 'RECU': return 'Reçu';
    case 'EN_ANALYSE': return 'En analyse';
    case 'VALIDE': return 'Validé';
    case 'EN_COMPTABILITE': return 'En comptabilité';
    case 'EN_PAIEMENT': return 'En paiement';
    case 'PAYE': return 'Payé';
    case 'REJETE': return 'Rejeté';
    default: return statut;
  }
}

export async function telechargerExportPdf(
  filtres: { search: string; statut: string },
  qsPeriode: string,
  contexte: { societeNom: string; libellePeriode: string; typeVue: string },
): Promise<void> {
  const res = await fetch(`/api/portail-client/export?format=json&${queryExport(filtres, qsPeriode)}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { erreur?: string };
    throw new Error(err.erreur || 'Export PDF impossible.');
  }
  const json = (await res.json()) as {
    societe: string;
    total: number;
    tronque: boolean;
    dossiers: {
      numeroDossier: string;
      beneficiaire: string;
      typeDossier: string;
      statut: string;
      dateReception: string;
      montantReclame: number;
      montantValide: number | null;
      montantPaye: number | null;
    }[];
  };

  const fmt = (n: number | null | undefined): string =>
    n === null || n === undefined ? '—' : new Intl.NumberFormat('fr-FR').format(n) + ' Ar';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const largeur = doc.internal.pageSize.getWidth();

  // ─── En-tête du document ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Suivi Santé — Dossiers ${contexte.typeVue}`, 14, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(json.societe || contexte.societeNom, 14, 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, 14, 26.5);
  const critères = [
    `Période : ${contexte.libellePeriode || 'Toutes les périodes'}`,
    `Statut : ${filtres.statut === 'en-cours' ? 'En cours' : filtres.statut ? libelleStatut(filtres.statut) : 'Tous'}`,
    `Recherche : ${filtres.search || '—'}`,
  ].join('   ·   ');
  doc.text(critères, 14, 31.5);

  // ─── Tableau des dossiers ────────────────────────────────────────────────
  autoTable(doc, {
    head: [['N° dossier', 'Bénéficiaire', 'Type', 'Statut', 'Réception', 'Réclamé (Ar)', 'Validé (Ar)', 'Payé (Ar)']],
    body: json.dossiers.map(d => [
      d.numeroDossier,
      d.beneficiaire,
      d.typeDossier,
      libelleStatut(d.statut),
      d.dateReception ? new Date(d.dateReception).toLocaleDateString('fr-FR') : '—',
      fmt(d.montantReclame),
      fmt(d.montantValide),
      fmt(d.montantPaye),
    ]),
    startY: 36,
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [5, 150, 105], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    // Numéros de page du document (marge inférieure de chaque page)
    didDrawPage: () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        largeur - 25,
        doc.internal.pageSize.getHeight() - 6,
      );
    },
  });

  // ─── Totaux financiers (calculés sur l'ensemble exporté) ─────────────────
  const totalReclame = json.dossiers.reduce((s, d) => s + (d.montantReclame ?? 0), 0);
  const totalValide = json.dossiers.reduce((s, d) => s + (d.montantValide ?? 0), 0);
  const totalPaye = json.dossiers.reduce((s, d) => s + (d.montantPaye ?? 0), 0);
  const yFinal = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `Nombre total de dossiers : ${json.total}${json.tronque ? ' (export limité à 10 000 — affinez les filtres)' : ''}`,
    14,
    yFinal,
  );
  doc.text(
    `Totaux : réclamé ${fmt(totalReclame)}  ·  validé ${fmt(totalValide)}  ·  payé ${fmt(totalPaye)}`,
    14,
    yFinal + 6,
  );

  doc.save(`dossiers-portail-${new Date().toISOString().slice(0, 10)}.pdf`);
}
