import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportData {
  periode: string;
  direction: {
    totalRecus: number;
    totalTraites: number;
    totalPayes: number;
    totalRejetes: number;
    delaiMoyenGlobal: number;
    montantTotalReclame: number;
    montantTotalPaye: number;
    tauxRejet: number;
  };
  parSociete: {
    societeNom: string;
    nbDossiers: number;
    montantReclame: number;
    montantPaye: number;
  }[];
  volumeMensuel: {
    mois: string;
    nbDossiers: number;
  }[];
  dateGeneration: string;
}

function formatMontant(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' Ar';
}

export async function genererRapportMensuel(data: ReportData): Promise<Buffer> {
  const doc = new jsPDF();

  // ─── En-tête ──────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Suivi Santé — Rapport Mensuel', 14, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période : ${data.periode}`, 14, 28);

  // ─── Section 1 : Indicateurs Globaux ──────────────────────
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicateurs Globaux', 14, 40);

  const indicateursRows: [string, string][] = [
    ['Total reçus', String(data.direction.totalRecus)],
    ['Total traités', String(data.direction.totalTraites)],
    ['Total payés', String(data.direction.totalPayes)],
    ['Total rejetés', String(data.direction.totalRejetes)],
    ['Délai moyen (jours)', String(data.direction.delaiMoyenGlobal)],
    ['Montant réclamé', formatMontant(data.direction.montantTotalReclame)],
    ['Montant payé', formatMontant(data.direction.montantTotalPaye)],
    ['Taux de rejet', data.direction.tauxRejet + ' %'],
  ];

  autoTable(doc, {
    startY: 44,
    head: [['Indicateur', 'Valeur']],
    body: indicateursRows,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 90 },
    },
  });

  // ─── Section 2 : Volume Mensuel ──────────────────────────
  const volumeBody = data.volumeMensuel.map((v) => [v.mois, String(v.nbDossiers)]);

  const volumeY = (doc as any).lastAutoTable?.finalY
    ? (doc as any).lastAutoTable.finalY + 14
    : 110;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Volume Mensuel', 14, volumeY);

  autoTable(doc, {
    startY: volumeY + 4,
    head: [['Mois', 'Nb Dossiers']],
    body: volumeBody,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { halign: 'right', cellWidth: 70 },
    },
  });

  // ─── Section 3 : Performance par Société ─────────────────
  const societeBody = data.parSociete.map((s) => [
    s.societeNom,
    String(s.nbDossiers),
    formatMontant(s.montantReclame),
    formatMontant(s.montantPaye),
  ]);

  const societeY = (doc as any).lastAutoTable?.finalY
    ? (doc as any).lastAutoTable.finalY + 14
    : 180;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Performance par Société', 14, societeY);

  autoTable(doc, {
    startY: societeY + 4,
    head: [['Société', 'Dossiers', 'Réclamé (Ar)', 'Payé (Ar)']],
    body: societeBody,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 45 },
      3: { halign: 'right', cellWidth: 45 },
    },
  });

  // ─── Pied de page ────────────────────────────────────────
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Document généré automatiquement par Suivi Santé — ${data.dateGeneration}`,
    14,
    pageHeight - 10
  );

  // Retourner le PDF sous forme de Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}