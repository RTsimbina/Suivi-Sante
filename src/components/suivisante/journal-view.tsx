'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, Filter, X, Download, FileSpreadsheet, FileText,
  Clock, User, ChevronUp, Eye,
  Info, AlertTriangle, AlertCircle, AlertOctagon,
  Calendar, ArrowUpDown, RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SharedPagination, type PaginationState } from '@/components/ui/shared-pagination';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HistoriqueEntry {
  id: string;
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  modifiePar: string;
  modifieParId: string | null;
  dateModification: string;
  action: string;
  niveau: string;
  module: string | null;
  objet: string | null;
  societeId: string | null;
  ipAdresse: string | null;
  navigateur: string | null;
  sessionId: string | null;
  motif: string | null;
  journalNumero: string;
  moduleLibelle: string;
}

interface Stats {
  total: number;
  creations: number;
  modifications: number;
  suppressions: number;
  derniereModification: string | null;
  dernierAdministrateur: string | null;
}

interface FilterOption {
  id: string;
  label: string;
}



// ─── Constantes ──────────────────────────────────────────────────────────────

const MODULE_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'Bareme', label: 'Barèmes' },
  { value: 'Contrat', label: 'Contrats' },
  { value: 'Utilisateur', label: 'Utilisateurs' },
  { value: 'Societe', label: 'Sociétés' },
  { value: 'Prestataire', label: 'Prestataires' },
  { value: 'PrestataireSociete', label: 'Prestataire/Société' },
  { value: 'Assure', label: 'Assurés' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Toutes' },
  { value: 'CREATION', label: '➕ Création' },
  { value: 'MODIFICATION', label: '✏️ Modification' },
  { value: 'SUPPRESSION', label: '🗑 Suppression' },
];

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'INFO', label: '🟢 Information' },
  { value: 'STANDARD', label: '🟡 Standard' },
  { value: 'SENSIBLE', label: '🟠 Sensible' },
  { value: 'CRITIQUE', label: '🔴 Critique' },
];

const NIVEAU_CONFIG: Record<string, { icon: typeof Info; bg: string; text: string; border: string; dot: string }> = {
  INFO:     { icon: Info,          bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900', dot: 'bg-emerald-500' },
  STANDARD: { icon: AlertTriangle,  bg: 'bg-amber-50 dark:bg-amber-950/40',    text: 'text-amber-700 dark:text-amber-400',    border: 'border-amber-200 dark:border-amber-900',    dot: 'bg-amber-500' },
  SENSIBLE: { icon: AlertCircle,    bg: 'bg-orange-50 dark:bg-orange-950/40',   text: 'text-orange-700 dark:text-orange-400',   border: 'border-orange-200 dark:border-orange-900',   dot: 'bg-orange-500' },
  CRITIQUE: { icon: AlertOctagon,   bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-400',       border: 'border-red-200 dark:border-red-900',       dot: 'bg-red-500' },
};

const ACTION_CONFIG: Record<string, { icon: string; bg: string; text: string }> = {
  CREATION:     { icon: '➕', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400' },
  MODIFICATION: { icon: '✏️', bg: 'bg-blue-50 dark:bg-blue-950/40',    text: 'text-blue-700 dark:text-blue-400' },
  SUPPRESSION:  { icon: '🗑', bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-400' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function getNiveauConfig(niveau: string) {
  return NIVEAU_CONFIG[niveau] || NIVEAU_CONFIG.STANDARD;
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || ACTION_CONFIG.MODIFICATION;
}

function truncate(str: string | null, max: number): string {
  if (!str) return '-';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ─── Composant principal ──────────────────────────────────────────────────

export default function JournalView() {
  const [entries, setEntries] = useState<HistoriqueEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<HistoriqueEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filtres
  const [entite, setEntite] = useState('');
  const [action, setAction] = useState('');
  const [niveau, setNiveau] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [utilisateurId, setUtilisateurId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);

  // Dropdowns dynamiques
  const [utilisateurs, setUtilisateurs] = useState<FilterOption[]>([]);
  const [societes, setSocietes] = useState<FilterOption[]>([]);
  const [societeId, setSocieteId] = useState('');
  const [filtresOuverts, setFiltresOuverts] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);

  // ── Fetch stats ─────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/historique-parametres?mode=stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* silencieux */ }
  }, []);

  // ── Fetch entries ───────────────────────────────────────────────────

  const fetchEntries = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' }); // Journal garde 50 items par page
      if (entite) params.set('entite', entite);
      if (action) params.set('action', action);
      if (criticalOnly) {
        params.set('niveau', 'CRITIQUE');
      } else if (niveau) {
        params.set('niveau', niveau);
      }
      if (dateDebut) params.set('dateDebut', dateDebut);
      if (dateFin) params.set('dateFin', dateFin);
      if (utilisateurId) params.set('utilisateurId', utilisateurId);
      if (societeId) params.set('societeId', societeId);
      if (recherche.trim()) params.set('recherche', recherche.trim());

      const res = await fetch(`/api/historique-parametres?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erreur || 'Erreur de chargement');
      }
      const data = await res.json();
      setEntries(data.entries);
      setPagination(data.pagination);
      if (data.filtres) {
        setUtilisateurs(data.filtres.utilisateurs || []);
        setSocietes(data.filtres.societes || []);
      }
      setPage(p);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [entite, action, niveau, dateDebut, dateFin, utilisateurId, societeId, recherche, criticalOnly]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  // ── Reset filtres ──────────────────────────────────────────────────

  function resetFilters() {
    setEntite('');
    setAction('');
    setNiveau('');
    setDateDebut('');
    setDateFin('');
    setUtilisateurId('');
    setSocieteId('');
    setRecherche('');
    setCriticalOnly(false);
    setPage(1);
  }

  // ── Export ─────────────────────────────────────────────────────────

  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(true);
    try {
      const params = new URLSearchParams({ mode: `export-${format}` });
      if (entite) params.set('entite', entite);
      if (action) params.set('action', action);
      if (niveau) params.set('niveau', niveau);
      if (dateDebut) params.set('dateDebut', dateDebut);
      if (dateFin) params.set('dateFin', dateFin);
      if (recherche.trim()) params.set('recherche', recherche.trim());

      const res = await fetch(`/api/historique-parametres?${params}`);
      if (!res.ok) throw new Error('Erreur export');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `journal-audit.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors de l\'export. Veuillez réessayer.');
    } finally {
      setExporting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-[1400px]">

      {/* ═══ Header ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Journal d&apos;Audit des Paramétrages</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Historique immuable des opérations — Accessible uniquement aux administrateurs
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                onClick={() => handleExport('excel')} disabled={exporting}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel
              </Button>
              <Button
                variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                onClick={() => handleExport('pdf')} disabled={exporting}
              >
                <FileText className="h-3.5 w-3.5" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ═══ Dashboard KPIs ═══ */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="border-emerald-200 dark:border-emerald-900">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total événements</p>
                  <p className="text-xl font-bold mt-0.5">{stats.total}</p>
                </div>
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-medium">Créations</p>
                  <p className="text-xl font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">{stats.creations}</p>
                </div>
                <span className="text-lg">🟢</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-medium">Modifications</p>
                  <p className="text-xl font-bold mt-0.5 text-amber-600 dark:text-amber-400">{stats.modifications}</p>
                </div>
                <span className="text-lg">🟡</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider font-medium">Suppressions</p>
                  <p className="text-xl font-bold mt-0.5 text-red-600 dark:text-red-400">{stats.suppressions}</p>
                </div>
                <span className="text-lg">🔴</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernière modification</p>
              <p className="text-xs font-medium mt-1.5">{stats.derniereModification ? formatDateShort(stats.derniereModification) : '-'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernier administrateur</p>
              <p className="text-xs font-medium mt-1.5 truncate">{stats.dernierAdministrateur || '-'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Filtres ═══ */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setFiltresOuverts(!filtresOuverts)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtres
              <ChevronUp className={cn('h-3 w-3 transition-transform', !filtresOuverts && 'rotate-180')} />
            </button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={resetFilters}>
              <RotateCcw className="h-3 w-3" />
              Réinitialiser
            </Button>
          </div>

          {filtresOuverts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
              {/* Période */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Du</label>
                <Input type="date" className="h-8 text-xs" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Au</label>
                <Input type="date" className="h-8 text-xs" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
              </div>

              {/* Module */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Module</label>
                <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={entite} onChange={(e) => setEntite(e.target.value)}>
                  {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Action */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</label>
                <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={action} onChange={(e) => setAction(e.target.value)}>
                  {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Niveau */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Niveau</label>
                <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={criticalOnly ? 'CRITIQUE' : niveau} onChange={(e) => { setCriticalOnly(false); setNiveau(e.target.value); }}>
                  <option value="">Tous</option>
                  {NIVEAU_OPTIONS.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Utilisateur */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Utilisateur</label>
                <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={utilisateurId} onChange={(e) => setUtilisateurId(e.target.value)}>
                  <option value="">Tous</option>
                  {utilisateurs.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>

              {/* Société */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Société</label>
                <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={societeId} onChange={(e) => setSocieteId(e.target.value)}>
                  <option value="">Toutes</option>
                  {societes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Barre de recherche + toggle critiques */}
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans le journal..."
                className="h-8 pl-8 text-xs"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
              {recherche && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setRecherche('')}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <button
              className={cn(
                'h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                criticalOnly
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
              onClick={() => { setCriticalOnly(!criticalOnly); if (!criticalOnly) setNiveau(''); }}
            >
              🔴 Critiques uniquement
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Loading ═══ */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">Chargement du journal...</span>
        </div>
      )}

      {/* ═══ Error ═══ */}
      {error && !loading && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Empty ═══ */}
      {!loading && !error && entries.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Aucun événement trouvé.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Les opérations de paramétrage apparaîtront ici.</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Tableau principal ═══ */}
      {!loading && entries.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Date / Heure</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Module</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Objet</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Action</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Champ</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Ancienne valeur</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nouvelle valeur</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Utilisateur</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Niveau</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const nivCfg = getNiveauConfig(entry.niveau);
                    const actCfg = getActionConfig(entry.action);
                    const isSelected = selectedEntry?.id === entry.id;

                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          'border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer',
                          isSelected && 'bg-muted/60',
                          entry.niveau === 'CRITIQUE' && 'bg-red-50/30 dark:bg-red-950/20',
                        )}
                        onClick={() => setSelectedEntry(isSelected ? null : entry)}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            {formatDateShort(entry.dateModification)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                          {entry.moduleLibelle}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap max-w-[180px] truncate">
                          {entry.objet || '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', actCfg.bg, actCfg.text)}>
                            {actCfg.icon} {entry.action === 'CREATION' ? 'Création' : entry.action === 'SUPPRESSION' ? 'Suppression' : 'Modification'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {(entry.action === 'CREATION' || entry.action === 'SUPPRESSION') ? '-' : entry.champ}
                        </td>
                        <td className="py-2.5 px-3 max-w-[160px]">
                          {entry.action === 'CREATION' ? (
                            <span className="text-muted-foreground">-</span>
                          ) : entry.action === 'SUPPRESSION' ? (
                            <span className="text-red-600 dark:text-red-400 line-through">{truncate(entry.ancienneValeur, 35)}</span>
                          ) : (
                            <span className="text-muted-foreground line-through">{truncate(entry.ancienneValeur, 35)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-[160px] font-medium">
                          {entry.action === 'SUPPRESSION' ? (
                            <span className="text-red-600 dark:text-red-400">Supprimé</span>
                          ) : entry.action === 'CREATION' ? (
                            <span className="text-emerald-600 dark:text-emerald-400">{truncate(entry.nouvelleValeur, 35)}</span>
                          ) : (
                            truncate(entry.nouvelleValeur, 35)
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {entry.modifiePar}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full', nivCfg.bg, nivCfg.text)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', nivCfg.dot)} />
                            {entry.niveau === 'INFO' ? 'Info' : entry.niveau === 'STANDARD' ? 'Moyen' : entry.niveau === 'SENSIBLE' ? 'Élevé' : 'Critique'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button className="p-1 rounded hover:bg-muted transition-colors">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ═══ Panneau détail ═══ */}
          {selectedEntry && (
            <Card className={cn('border', getNiveauConfig(selectedEntry.niveau).border)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Détail de l&apos;opération</CardTitle>
                  </div>
                  <button onClick={() => setSelectedEntry(null)} className="p-1 rounded hover:bg-muted">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-xs">
                  <DetailField label="N° Journal" value={selectedEntry.journalNumero} mono />
                  <DetailField label="Date" value={formatDate(selectedEntry.dateModification)} />
                  <DetailField label="Module" value={selectedEntry.moduleLibelle} />
                  <DetailField label="Entité" value={selectedEntry.entite} mono />
                  <DetailField label="Objet" value={selectedEntry.objet || '-'} />
                  <DetailField label="Action" value={selectedEntry.action} />
                  <DetailField label="Champ modifié" value={(selectedEntry.action === 'CREATION' || selectedEntry.action === 'SUPPRESSION') ? '-' : selectedEntry.champ} />
                  <DetailField label="Ancienne valeur" value={selectedEntry.ancienneValeur || 'vide'} />
                  <DetailField label="Nouvelle valeur" value={selectedEntry.nouvelleValeur || 'vide'} />
                  <DetailField label="Effectué par" value={selectedEntry.modifiePar} />
                  <DetailField label="ID utilisateur" value={selectedEntry.modifieParId || '-'} mono />
                  <DetailField label="ID entité" value={selectedEntry.entiteId} mono />
                  <DetailField label="Niveau" value={selectedEntry.niveau} />
                  <DetailField label="Adresse IP" value={selectedEntry.ipAdresse || '-'} mono />
                  <DetailField label="Navigateur" value={selectedEntry.navigateur || '-'} />
                  <DetailField label="Session" value={selectedEntry.sessionId || '-'} mono />
                  <DetailField label="Motif" value={selectedEntry.motif || 'Aucun motif spécifié'} className="md:col-span-2 lg:col-span-3" />
                </div>
              </CardContent>
            </Card>
          )}

          <SharedPagination pagination={pagination!} onPageChange={(p) => fetchEntries(p)} label="résultat" />
        </>
      )}

      {/* ═══ Exporting overlay ═══ */}
      {exporting && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <span className="text-sm">Génération de l&apos;export en cours...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Composant auxiliaire DetailField ──────────────────────────────────────

function DetailField({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <span className="text-muted-foreground">{label} :</span>
      <span className={cn('ml-1.5', mono && 'font-mono text-[11px] text-muted-foreground/80')}>{value}</span>
    </div>
  );
}
