'use client';

/**
 * Hook du Journal de Bord (refactoring P2 — extrait du monolithe
 * journal-view.tsx) : chargement des stats et des entrées paginées avec
 * filtres (module, action, niveau, utilisateur, société, recherche, période
 * partagée), dropdowns dynamiques, toggle « critiques uniquement » et
 * exports Excel/PDF.
 */
import { useState, useEffect, useCallback } from 'react';
import type { PaginationState } from '@/components/ui/shared-pagination';
import { usePeriode } from '@/lib/periode-context';
import type { FilterOption, HistoriqueEntry, Stats } from './types';

export function useJournalData() {
  const { queryString: qsPeriode } = usePeriode();
  const [entries, setEntries] = useState<HistoriqueEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Filtres
  const [entite, setEntite] = useState('');
  const [action, setAction] = useState('');
  const [niveau, setNiveau] = useState('');
  // La période (anciennement champs Du/Au locaux) est gérée par le filtre de période partagé
  const [utilisateurId, setUtilisateurId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);

  // Dropdowns dynamiques
  const [utilisateurs, setUtilisateurs] = useState<FilterOption[]>([]);
  const [societes, setSocietes] = useState<FilterOption[]>([]);
  const [societeId, setSocieteId] = useState('');
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
      // Filtre de période partagé (date de référence : date de modification)
      if (qsPeriode) {
        for (const [cle, valeur] of new URLSearchParams(qsPeriode)) params.set(cle, valeur);
      }
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
  }, [entite, action, niveau, qsPeriode, utilisateurId, societeId, recherche, criticalOnly]);

  // Changement de période : revenir à la première page
  useEffect(() => {
    setPage(1);
  }, [qsPeriode]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  // ── Interactions filtres (le présentateur reste pur affichage) ──────

  function changerNiveau(valeur: string) {
    setCriticalOnly(false);
    setNiveau(valeur);
  }

  function toggleCriticalOnly() {
    setCriticalOnly(!criticalOnly);
    if (!criticalOnly) setNiveau('');
  }

  // ── Reset filtres ──────────────────────────────────────────────────

  function resetFilters() {
    setEntite('');
    setAction('');
    setNiveau('');
    // La période est réinitialisée via le filtre partagé (bouton « Toutes les périodes »)
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
      // Filtre de période partagé (date de référence : date de modification)
      if (qsPeriode) {
        for (const [cle, valeur] of new URLSearchParams(qsPeriode)) params.set(cle, valeur);
      }
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

  return {
    // données
    entries, pagination, stats, loading, error,
    // filtres
    entite, setEntite,
    action, setAction,
    niveau, changerNiveau,
    utilisateurId, setUtilisateurId,
    societeId, setSocieteId,
    recherche, setRecherche,
    criticalOnly, toggleCriticalOnly,
    utilisateurs, societes,
    resetFilters,
    // actions
    fetchEntries, handleExport, exporting, page,
  };
}
