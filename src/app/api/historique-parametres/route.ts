import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { getToken } from 'next-auth/jwt';

// ─── Constantes ────────────────────────────────────────────────────────────

const ENTITES_VALIDES = [
  'Bareme', 'Contrat', 'Utilisateur', 'Societe', 'Prestataire',
  'PrestataireSociete', 'Assure', 'Gestionnaire', 'EntrepriseContact', 'Dossier',
];

const ACTIONS_VALIDES = ['CREATION', 'MODIFICATION', 'SUPPRESSION'];
const NIVEAUX_VALIDES = ['INFO', 'STANDARD', 'SENSIBLE', 'CRITIQUE'];

const MODULE_MAP: Record<string, string> = {
  Bareme: 'Barèmes',
  Contrat: 'Contrats',
  Utilisateur: 'Utilisateurs',
  Societe: 'Sociétés',
  Prestataire: 'Prestataires',
  PrestataireSociete: 'Prestataire/Société',
  Assure: 'Assurés',
  Gestionnaire: 'Gestionnaires',
  EntrepriseContact: 'Contacts Entreprise',
  Dossier: 'Dossiers',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseDate(str: string | null): Date | undefined {
  if (!str) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatJournalNumber(id: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  // Hash du CUID pour le numéro de séquence (6 premiers chars hex)
  const hash = id.replace(/^cm/, '').slice(0, 6).toUpperCase();
  return `AUD-${y}${m}${d}-${hash}`;
}

// ─── GET : Lecture du journal avec filtres ────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'stats' | 'export-excel' | 'export-pdf' | undefined (default: list)

    // ── Mode stats : KPIs pour le dashboard ──────────────────────────────
    if (mode === 'stats') {
      return getStats();
    }

    // ── Mode export-excel ────────────────────────────────────────────────
    if (mode === 'export-excel') {
      return exportExcel(request, searchParams);
    }

    // ── Mode export-pdf ──────────────────────────────────────────────────
    if (mode === 'export-pdf') {
      return exportPdf(request, searchParams);
    }

    // ── Mode par défaut : liste paginée ──────────────────────────────────
    return getListe(request, searchParams);
  } catch (error) {
    console.error('Erreur historique-parametres:', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la récupération du journal.' },
      { status: 500 }
    );
  }
}

// ─── Stats Dashboard ────────────────────────────────────────────────────────

async function getStats() {
  const [total, creations, modifications, suppressions, dernierAdmin] = await Promise.all([
    db.historiqueParametre.count(),
    db.historiqueParametre.count({ where: { action: 'CREATION' } }),
    db.historiqueParametre.count({ where: { action: 'MODIFICATION' } }),
    db.historiqueParametre.count({ where: { action: 'SUPPRESSION' } }),
    db.historiqueParametre.findFirst({
      orderBy: { dateModification: 'desc' },
      select: { modifiePar: true, dateModification: true },
    }),
  ]);

  return NextResponse.json({
    total,
    creations,
    modifications,
    suppressions,
    derniereModification: dernierAdmin?.dateModification || null,
    dernierAdministrateur: dernierAdmin?.modifiePar || null,
  });
}

// ─── Liste paginée avec filtres ─────────────────────────────────────────────

async function getListe(request: NextRequest, searchParams: URLSearchParams) {
  const where = buildWhere(searchParams);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

  const [entries, total] = await Promise.all([
    db.historiqueParametre.findMany({
      where,
      orderBy: { dateModification: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.historiqueParametre.count({ where }),
  ]);

  // Enrichir chaque entrée avec le numéro de journal et le module
  const enriched = entries.map((e) => ({
    ...e,
    journalNumero: formatJournalNumber(e.id, e.dateModification),
    moduleLibelle: e.module || MODULE_MAP[e.entite] || e.entite,
  }));

  // Récupérer la liste des utilisateurs et sociétés pour les filtres dropdown
  const [utilisateurs, societes] = await Promise.all([
    db.utilisateur.findMany({
      select: { id: true, nom: true, email: true },
      orderBy: { nom: 'asc' },
      take: 100,
    }),
    db.societe.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    entries: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    filtres: {
      utilisateurs: utilisateurs.map((u) => ({ id: u.id, label: `${u.nom} (${u.email})` })),
      societes: societes.map((s) => ({ id: s.id, label: s.nom })),
    },
  });
}

// ─── Construction du filtre WHERE ───────────────────────────────────────────

function buildWhere(searchParams: URLSearchParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  // Filtre par entité
  const entite = searchParams.get('entite');
  if (entite && ENTITES_VALIDES.includes(entite)) {
    where.entite = entite;
  }

  // Filtre par ID d'entité
  const entiteId = searchParams.get('entiteId');
  if (entiteId) where.entiteId = entiteId;

  // Filtre par action
  const action = searchParams.get('action');
  if (action && ACTIONS_VALIDES.includes(action)) {
    where.action = action;
  }

  // Filtre par niveau
  const niveau = searchParams.get('niveau');
  if (niveau && NIVEAUX_VALIDES.includes(niveau)) {
    where.niveau = niveau;
  }

  // Filtre par utilisateur (modifieParId)
  const utilisateurId = searchParams.get('utilisateurId');
  if (utilisateurId) where.modifieParId = utilisateurId;

  // Filtre par société
  const societeId = searchParams.get('societeId');
  if (societeId) where.societeId = societeId;

  // Filtre par période (dateDebut / dateFin)
  const dateDebut = parseDate(searchParams.get('dateDebut'));
  const dateFin = parseDate(searchParams.get('dateFin'));
  if (dateDebut || dateFin) {
    const dateFilter: Record<string, unknown> = {};
    if (dateDebut) dateFilter.gte = dateDebut;
    if (dateFin) {
      // Inclure toute la journée de fin
      const fin = new Date(dateFin);
      fin.setHours(23, 59, 59, 999);
      dateFilter.lte = fin;
    }
    where.dateModification = dateFilter;
  }

  // Filtre par recherche textuelle (champ, ancienne/nouvelle valeur, modifiePar)
  const recherche = searchParams.get('recherche');
  if (recherche && recherche.trim()) {
    const term = recherche.trim();
    where.OR = [
      { champ: { contains: term, mode: 'insensitive' } },
      { ancienneValeur: { contains: term, mode: 'insensitive' } },
      { nouvelleValeur: { contains: term, mode: 'insensitive' } },
      { modifiePar: { contains: term, mode: 'insensitive' } },
      { objet: { contains: term, mode: 'insensitive' } },
      { module: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ─── Export Excel ────────────────────────────────────────────────────────────

async function exportExcel(request: NextRequest, searchParams: URLSearchParams) {
  const XLSX = await import('xlsx');

  const where = buildWhere(searchParams);
  const limit = Math.min(10000, parseInt(searchParams.get('limit') || '5000', 10) || 5000);

  const entries = await db.historiqueParametre.findMany({
    where,
    orderBy: { dateModification: 'desc' },
    take: limit,
  });

  const rows = entries.map((e) => ({
    'Date / Heure': formatDateTimeFr(e.dateModification),
    'N° Journal': formatJournalNumber(e.id, e.dateModification),
    'Module': e.module || MODULE_MAP[e.entite] || e.entite,
    'Objet': e.objet || '-',
    'Action': actionLabel(e.action),
    'Niveau': niveauLabel(e.niveau),
    'Champ': e.champ === 'CREATION' || e.champ === 'SUPPRESSION' ? '-' : e.champ,
    'Ancienne Valeur': e.ancienneValeur || '-',
    'Nouvelle Valeur': e.nouvelleValeur || '-',
    'Utilisateur': e.modifiePar,
    'Adresse IP': e.ipAdresse || '-',
    'Navigateur': e.navigateur || '-',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Largeurs de colonnes
  ws['!cols'] = [
    { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 28 },
    { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 24 },
    { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Journal d\'audit');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="journal-audit-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

// ─── Export PDF ─────────────────────────────────────────────────────────────

async function exportPdf(request: NextRequest, searchParams: URLSearchParams) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const where = buildWhere(searchParams);
  const limit = Math.min(5000, parseInt(searchParams.get('limit') || '2000', 10) || 2000);

  const entries = await db.historiqueParametre.findMany({
    where,
    orderBy: { dateModification: 'desc' },
    take: limit,
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // En-tête
  doc.setFontSize(16);
  doc.text('Journal d\'Audit des Paramétrages', 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} | ${entries.length} entrée(s)`, 14, 25);
  doc.setTextColor(0);

  const rows = entries.map((e) => [
    formatDateTimeFr(e.dateModification),
    formatJournalNumber(e.id, e.dateModification),
    e.module || MODULE_MAP[e.entite] || e.entite,
    e.objet || '-',
    actionLabel(e.action),
    niveauLabel(e.niveau),
    e.champ === 'CREATION' || e.champ === 'SUPPRESSION' ? '-' : e.champ,
    (e.ancienneValeur || '-').slice(0, 40),
    (e.nouvelleValeur || '-').slice(0, 40),
    e.modifiePar,
  ]);

  autoTable(doc, {
    startY: 30,
    head: [[
      'Date/Heure', 'N° Journal', 'Module', 'Objet', 'Action',
      'Niveau', 'Champ', 'Anc. Valeur', 'Nouv. Valeur', 'Utilisateur',
    ]],
    body: rows,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 7 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 34 },
      2: { cellWidth: 26 },
      3: { cellWidth: 36 },
      6: { cellWidth: 22 },
      7: { cellWidth: 34 },
      8: { cellWidth: 34 },
      9: { cellWidth: 28 },
    },
  });

  const pdfBuffer = doc.output('arraybuffer');
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="journal-audit-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}

// ─── Utilitaires de formatage ───────────────────────────────────────────────

function formatDateTimeFr(date: Date): string {
  try {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'CREATION': return 'Création';
    case 'SUPPRESSION': return 'Suppression';
    default: return 'Modification';
  }
}

function niveauLabel(niveau: string): string {
  switch (niveau) {
    case 'INFO': return 'Information';
    case 'STANDARD': return 'Standard';
    case 'SENSIBLE': return 'Sensible';
    case 'CRITIQUE': return 'Critique';
    default: return niveau;
  }
}
