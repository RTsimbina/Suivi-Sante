'use client';

/**
 * use-portail-data.ts — Hook de chargement du portail (découpage P2-01),
 * avec la pagination serveur des dossiers (P2-02B) : page / limit / search /
 * statut sont envoyés au backend et CONSERVÉS lors du changement de page
 * (un changement de filtre ramène automatiquement à la page 1).
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePeriode } from '@/lib/periode-context';
import type { PortailData } from './types';

interface FiltresDossiers {
  page: number;
  limit: number;
  search: string;
  statut: string;
}

const FILTRES_INITIAUX: FiltresDossiers = { page: 1, limit: 50, search: '', statut: '' };

export function usePortailData() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { queryString: qsPeriode, libelle: libellePeriode } = usePeriode();
  const [data, setData] = useState<PortailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtres, setFiltres] = useState<FiltresDossiers>(FILTRES_INITIAUX);

  const role = session?.user?.role as string;
  const isPortailUser = role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE';

  // Rediriger les utilisateurs non-portail-client (internes → dashboard,
  // prestataires → leur portail dédié)
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && role === 'PRESTATAIRE') {
      router.push('/portail-prestataire');
    } else if (status === 'authenticated' && !isPortailUser) {
      router.push('/');
    }
  }, [status, role, isPortailUser, router]);

  // Charger les données du portail (dossiers paginés côté serveur)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (qsPeriode) {
        for (const [k, v] of new URLSearchParams(qsPeriode)) params.set(k, v);
      }
      params.set('page', String(filtres.page));
      params.set('limit', String(filtres.limit));
      if (filtres.search) params.set('search', filtres.search);
      if (filtres.statut) params.set('statut', filtres.statut);

      const res = await fetch(`/api/portail-client?${params.toString()}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) {
        const err = await res.json();
        setError(err.erreur || 'Erreur de chargement.');
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [router, qsPeriode, filtres]);

  useEffect(() => {
    if (isPortailUser) fetchData();
  }, [isPortailUser, fetchData]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  /**
   * Met à jour filtres + page : un changement de filtre (limit/search/statut)
   * ramène automatiquement à la page 1 — un seul fetch par mise à jour.
   */
  const majFiltres = useCallback((partiel: Partial<FiltresDossiers>) => {
    setFiltres((prev) => {
      const next = { ...prev, ...partiel };
      if (partiel.page === undefined) {
        const filtreChange = (['limit', 'search', 'statut'] as const).some(
          (c) => partiel[c] !== undefined && partiel[c] !== prev[c],
        );
        if (filtreChange) next.page = 1;
      }
      return next;
    });
  }, []);

  const changerPage = useCallback((p: number) => majFiltres({ page: p }), [majFiltres]);

  return {
    session, status, role, isPortailUser,
    data, loading, error,
    qsPeriode, libellePeriode,
    filtres, majFiltres, changerPage,
    handleLogout,
  };
}

export type PortailDataHook = ReturnType<typeof usePortailData>;

/** Sous-ensemble du hook transmis aux vues Assuré / Entreprise. */
export type PropsPortailVue = Pick<
  PortailDataHook,
  'data' | 'loading' | 'error' | 'qsPeriode' | 'libellePeriode' | 'filtres' | 'majFiltres' | 'changerPage'
>;
