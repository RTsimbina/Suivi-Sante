'use client';

/**
 * Hook : exclusions / dépassements de plafond (fetch + filtre par type d'écart).
 * Extrait de technique-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useEffect, useCallback } from 'react';

import { ExclusionRow } from './types';

export type ExclusionFilter = 'all' | 'depassement' | 'exclusion' | 'rejete';

export function useExclusions() {
  const [exclusions, setExclusions] = useState<ExclusionRow[]>([]);
  const [exclusionsLoading, setExclusionsLoading] = useState(false);
  const [exclusionFilter, setExclusionFilter] = useState<ExclusionFilter>('all');

  // ─── Fetch Exclusions / Dépassements ───
  const fetchExclusions = useCallback(async () => {
    setExclusionsLoading(true);
    try {
      const res = await fetch('/api/technique/exclusions');
      if (res.ok) {
        const data = await res.json();
        setExclusions(data.exclusions || []);
      }
    } catch {
      // silencieux
    } finally {
      setExclusionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExclusions();
  }, [fetchExclusions]);

  return {
    exclusions,
    exclusionsLoading,
    exclusionFilter,
    setExclusionFilter,
  };
}

export type ExclusionsState = ReturnType<typeof useExclusions>;
