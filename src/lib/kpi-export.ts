/**
 * kpi-export.ts — Exports Excel et PDF du module KPI.
 * SOURCE UNIQUE : consomme le résultat du moteur kpi-performance (même bundle
 * que le tableau de bord) — cohérence dashboard ↔ exports garantie (§12).
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { KpiGlobal, AlertesKpi } from './kpi-performance';

export interface DonneesExportKpi {
  periode: string;
  generePar: string;
  global: KpiGlobal;
  alertes: AlertesKpi;
}

const fmt = (v: number | null, unite = '') => (v === null ? '—' : `${v.toLocaleString('fr-FR')}${unite}`);
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);

/** Classeur Excel : Synthèse, Services, Collaborateurs, Alertes. */
export async function genererExcelKpi(d: DonneesExportKpi): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Suivi Santé — Module KPI';

  const addSheet = (name: string, rows: Record<string, unknown>[], widths: number[]) => {
    const ws = wb.addWorksheet(name);
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map((h, i) => ({
        header: h, key: h, width: widths[i] ?? 16,
      }));
      for (const r of rows) ws.addRow(r);
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF529286' } };
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    return ws;
  };

  addSheet('Synthèse', [
    { Indicateur: 'Période', Valeur: d.periode },
    { Indicateur: 'Généré par', Valeur: d.generePar },
    { Indicateur: 'Dossiers traités', Valeur: d.global.totalTraites },
    { Indicateur: 'Dossiers affectés', Valeur: d.global.totalAffectes },
    { Indicateur: 'Dossiers en cours', Valeur: d.global.enCours },
    { Indicateur: 'Dossiers en retard', Valeur: d.global.enRetard },
    { Indicateur: 'Délai moyen de traitement (min)', Valeur: fmt(d.global.delaiMoyenTraitementMin) },
    { Indicateur: 'Délai médian de traitement (min)', Valeur: fmt(d.global.delaiMedianTraitementMin) },
    { Indicateur: 'Délai moyen de responsabilité (min)', Valeur: fmt(d.global.delaiMoyenResponsabiliteMin) },
    { Indicateur: 'Taux de respect des délais', Valeur: pct(d.global.tauxRespectDelais) },
    { Indicateur: 'Taux de retour pour correction', Valeur: pct(d.global.tauxRetourCorrection) },
  ], [42, 26]);

  addSheet('Par service', d.global.parService.map((s) => ({
    Service: s.service, 'Dossiers traités': s.traites, 'En cours': s.enCours,
    'En retard': s.enRetard, 'Temps moyen (min)': fmt(s.tempsMoyenTraitementMin),
    'Délai médian (min)': fmt(s.delaiMedianTraitementMin),
    'Taux respect': pct(s.tauxRespectDelais), 'Taux retours': pct(s.tauxRetourCorrection),
  })), [18, 14, 10, 10, 16, 16, 13, 13]);

  addSheet('Collaborateurs', d.global.parCollaborateur.map((c) => ({
    Collaborateur: c.nom ?? c.userId, Service: c.service ?? '',
    'Affectés': c.attribues, 'Traités': c.traites, 'En cours': c.enCours,
    'En retard': c.enRetard, 'Prise en charge moy. (min)': fmt(c.delaiMoyenPriseEnChargeMin),
    'Traitement moy. (min)': fmt(c.tempsMoyenTraitementMin),
    'Traitement médian (min)': fmt(c.delaiMedianTraitementMin),
    'Taux respect': pct(c.tauxRespectDelais), 'Taux retours': pct(c.tauxRetourCorrection),
  })), [28, 16, 10, 10, 10, 10, 20, 20, 20, 13, 13]);

  const alertes: Record<string, unknown>[] = [];
  for (const a of d.alertes.dossiersDepasses) alertes.push({ Type: 'Dossier dépassé', Dossier: a.numeroDossier, Service: a.service, Détail: `${a.pourcentageObjectif} % de l'objectif` });
  for (const a of d.alertes.dossiersProches) alertes.push({ Type: 'Proche de la cible', Dossier: a.numeroDossier, Service: a.service, Détail: `${a.pourcentageObjectif} % de l'objectif` });
  for (const a of d.alertes.accumulations) alertes.push({ Type: 'Accumulation', Dossier: '', Service: a.service, Détail: `${a.nbOuverts} ouverts (seuil ${a.seuil})` });
  for (const a of d.alertes.degradations) alertes.push({ Type: 'Dégradation du taux', Dossier: '', Service: a.service, Détail: `${a.tauxPrecedent} % → ${a.tauxActuel} % (seuil ${a.seuil} pts)` });
  for (const a of d.alertes.hausseRetours) alertes.push({ Type: 'Hausse des retours', Dossier: '', Service: a.service, Détail: `${a.taux} % (seuil ${a.seuil} %)` });
  addSheet('Alertes', alertes.length > 0 ? alertes : [{ Type: '—', Dossier: '', Service: '', Détail: 'Aucune alerte' }], [24, 22, 16, 40]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** PDF : synthèse + tableaux services/collaborateurs (jsPDF + autotable). */
export function genererPdfKpi(d: DonneesExportKpi): Buffer {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Suivi Santé — Performance des collaborateurs', 14, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période : ${d.periode}   —   Généré par : ${d.generePar}`, 14, 26);

  autoTable(doc, {
    startY: 32,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Dossiers traités', String(d.global.totalTraites)],
      ['Dossiers en cours', String(d.global.enCours)],
      ['Dossiers en retard', String(d.global.enRetard)],
      ['Délai moyen de traitement', fmt(d.global.delaiMoyenTraitementMin, ' min')],
      ['Délai médian de traitement', fmt(d.global.delaiMedianTraitementMin, ' min')],
      ['Taux de respect des délais', pct(d.global.tauxRespectDelais)],
      ['Taux de retour pour correction', pct(d.global.tauxRetourCorrection)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [82, 146, 134] },
  });

  autoTable(doc, {
    head: [['Service', 'Traités', 'En cours', 'En retard', 'Moy. (min)', 'Médian (min)', 'Respect']],
    body: d.global.parService.map((s) => [s.service, String(s.traites), String(s.enCours), String(s.enRetard),
      fmt(s.tempsMoyenTraitementMin), fmt(s.delaiMedianTraitementMin), pct(s.tauxRespectDelais)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [82, 146, 134] },
  });

  autoTable(doc, {
    head: [['Collaborateur', 'Service', 'Affectés', 'Traités', 'Retard', 'Respect', 'Retours']],
    body: d.global.parCollaborateur.map((c) => [c.nom ?? c.userId, c.service ?? '', String(c.attribues),
      String(c.traites), String(c.enRetard), pct(c.tauxRespectDelais), pct(c.tauxRetourCorrection)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [82, 146, 134] },
  });

  return Buffer.from(doc.output('arraybuffer'));
}
