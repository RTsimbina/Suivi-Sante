/**
 * Utilitaires Excel — wrapper autour d'exceljs (remplacement de xlsx/SheetJS).
 *
 * SheetJS (xlsx 0.18.5) est abandonné sur npm public et ne reçoit plus de correctifs
 * de sécurité. ExcelJS (MIT, activement maintenu) fournit les mêmes fonctionnalités.
 */

import ExcelJS from 'exceljs';

// ─── Lecture ─────────────────────────────────────────────────────────────────

/**
 * Lit la première feuille d'un fichier Excel et retourne les lignes
 * sous forme de tableaux d'objets clés/valeurs (même format que XLSX.utils.sheet_to_json).
 *
 * @param buffer - Contenu binaire du fichier .xlsx
 * @returns rows (objets avec clés = en-têtes) et sheetName
 */
export async function readExcelRows(
  buffer: Buffer,
): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return { rows: [], sheetName: worksheet?.name || '' };
  }

  // Extraire les en-têtes (ligne 1)
  const headerRow = worksheet.getRow(1);
  const headerValues: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerValues[colNumber] = String(cell.value ?? '');
  });

  // Construire les objets pour chaque ligne de données
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Ignorer l'en-tête
    const obj: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headerValues[colNumber] || `COL_${colNumber}`;
      obj[key] = getCellValue(cell);
    });
    rows.push(obj);
  });

  return { rows, sheetName: worksheet.name };
}

/**
 * Extrait la valeur brute d'une cellule ExcelJS.
 * Gère les types spéciaux : dates, formules, liens hypertexte, etc.
 */
function getCellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return null;

  // Type date natif ExcelJS
  if (v instanceof Date) return v;

  // Formule : retourner le résultat calculé
  if (typeof v === 'object' && 'result' in v) {
    return (v as { result: unknown }).result;
  }

  // Lien hypertexte
  if (typeof v === 'object' && 'text' in v) {
    return (v as { text: string }).text;
  }

  // Texte riche
  if (typeof v === 'object' && 'richText' in v) {
    const rt = (v as { richText: { text: string }[] }).richText;
    return rt.map((r) => r.text).join('');
  }

  return v;
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/**
 * Génère un fichier Excel à partir d'un tableau d'objets.
 * Équivalent de XLSX.utils.book_new() + json_to_sheet() + write().
 *
 * @param rows - Tableau d'objets (clés = en-têtes de colonnes)
 * @param sheetName - Nom de la feuille
 * @param columnWidths - Largeurs de colonnes optionnelles (en caractères, comme SheetJS wch)
 */
export async function writeExcelFromJson(
  rows: Record<string, unknown>[],
  sheetName: string,
  columnWidths?: { wch: number }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (rows.length === 0) {
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  const headers = Object.keys(rows[0]);

  // Définir les colonnes
  worksheet.columns = headers.map((h, i) => ({
    header: h,
    key: h,
    width: columnWidths?.[i] ? Math.max(8, columnWidths[i].wch * 0.65) : 15,
  }));

  // En-tête en gras
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  // Lignes de données
  for (const row of rows) {
    const dataRow: Record<string, unknown> = {};
    for (const h of headers) {
      dataRow[h] = row[h] ?? null;
    }
    worksheet.addRow(dataRow);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf) as unknown as Buffer;
}
