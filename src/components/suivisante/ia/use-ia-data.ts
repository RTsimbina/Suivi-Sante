'use client';

/**
 * Hook de la vue Intelligence IA (refactoring P2 — extrait du monolithe
 * ia-view.tsx) : chargement de /api/ia avec le filtre de période partagé et
 * gestion de l'expansion des cartes « pièces manquantes » et « incohérences ».
 */
import { useState, useEffect } from 'react';
import { usePeriode } from '@/lib/periode-context';
import type { IaData } from './types';

export function useIaData() {
  const { queryString: qsPeriode } = usePeriode();
  const [data, setData] = useState<IaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        // Filtre de période partagé (date de référence : date de réception)
        const url = qsPeriode ? `/api/ia?${qsPeriode}` : '/api/ia';
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}: ${res.statusText}`);
        }
        const json: IaData = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [qsPeriode]);

  function toggleCard(key: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return { data, loading, error, expandedCards, toggleCard };
}
