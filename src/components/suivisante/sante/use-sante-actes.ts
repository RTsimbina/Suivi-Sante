'use client';

/**
 * Hook Contrôle Santé — historique des actes d'un assuré : fetch paginé,
 * filtres (type, statut, recherche) et intégration de la période partagée.
 * Extraits tels quels de l'ancien monolithe sante-view.tsx, y compris les
 * deux effets de chargement automatique (assuré vérifié changé, page ou
 * filtres modifiés) et la relance différée après réinitialisation.
 */
import { useState, useCallback, useEffect } from 'react';
import type { ActeItem, ActesPagination, ActesFiltres } from './types';

const ACTES_LIMIT = 10;

const PAGINATION_VIDE: ActesPagination = {
  page: 1, limit: ACTES_LIMIT, total: 0, totalPages: 0,
};

interface UseSanteActesOptions {
  /** Id de l'assuré vérifié, '' tant qu'aucune vérification n'a abouti. */
  assureId: string;
  /** Période partagée (barre en haut de page), date de réception des dossiers. */
  dateDebutPeriode: string;
  dateFinPeriode: string;
}

export function useSanteActes({ assureId, dateDebutPeriode, dateFinPeriode }: UseSanteActesOptions) {
  const [actesLoading, setActesLoading] = useState(false);
  const [actes, setActes] = useState<ActeItem[]>([]);
  const [actesPagination, setActesPagination] = useState<ActesPagination>(PAGINATION_VIDE);
  const [actesFiltres, setActesFiltres] = useState<ActesFiltres>({ typesActe: [], statuts: [] });

  const [filtreType, setFiltreType] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreSearch, setFiltreSearch] = useState('');
  const [actesPage, setActesPage] = useState(1);
  const [showFiltres, setShowFiltres] = useState(true);

  const fetchActes = useCallback(async (assureId: string, page: number, overrides?: {
    typeDossier?: string; statut?: string; dateDebut?: string; dateFin?: string; search?: string;
  }) => {
    setActesLoading(true);
    try {
      const params = new URLSearchParams({
        assureId,
        page: String(page),
        limit: String(ACTES_LIMIT),
      });
      const t = overrides?.typeDossier ?? filtreType;
      const s = overrides?.statut ?? filtreStatut;
      const dd = overrides?.dateDebut ?? dateDebutPeriode;
      const df = overrides?.dateFin ?? dateFinPeriode;
      const q = overrides?.search ?? filtreSearch;
      if (t) params.set('typeDossier', t);
      if (s) params.set('statut', s);
      if (dd) params.set('dateDebut', dd);
      if (df) params.set('dateFin', df);
      if (q) params.set('search', q);

      const res = await fetch(`/api/sante/actes-assure?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActes(data.dossiers);
        setActesPagination(data.pagination);
        if (data.filtres) setActesFiltres(data.filtres);
      }
    } catch (err) {
      console.error('[ACTES] Erreur chargement actes:', err);
    } finally {
      setActesLoading(false);
    }
  }, [filtreType, filtreStatut, dateDebutPeriode, dateFinPeriode, filtreSearch]);

  // Charger automatiquement quand l'assuré vérifié change (fetchActes change aussi avec la période)
  useEffect(() => {
    if (assureId) {
      fetchActes(assureId, 1);
    }
  }, [assureId, fetchActes]);

  // Recharger quand la page change (pagination)
  useEffect(() => {
    if (!assureId) return;
    fetchActes(assureId, actesPage);
  }, [assureId, fetchActes, actesPage]);

  // Appliquer les filtres (uniquement via le bouton Rechercher)
  const appliquerFiltres = () => {
    if (!assureId) return;
    setActesPage(1);
    fetchActes(assureId, 1);
  };

  // Réinitialiser les filtres et relancer la recherche
  const resetFiltres = () => {
    setFiltreType('');
    setFiltreStatut('');
    setFiltreSearch('');
    // Relancer après reset
    if (assureId) {
      setActesPage(1);
      setTimeout(() => fetchActes(assureId, 1), 0);
    }
  };

  // Remise à zéro à chaque nouvelle vérification d'assuré (orchestré par la vue mère)
  const resetActes = () => {
    setActes([]);
    setActesPagination(PAGINATION_VIDE);
    setActesFiltres({ typesActe: [], statuts: [] });
    setFiltreType('');
    setFiltreStatut('');
    setFiltreSearch('');
    setActesPage(1);
  };

  return {
    actes, actesPagination, actesFiltres, actesLoading,
    filtreType, setFiltreType,
    filtreStatut, setFiltreStatut,
    filtreSearch, setFiltreSearch,
    actesPage, setActesPage,
    showFiltres, setShowFiltres,
    appliquerFiltres, resetFiltres, resetActes,
  };
}
