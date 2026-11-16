'use client';

/**
 * Hook du board Kanban (refactoring P2 — extrait du monolithe
 * kanban-view.tsx) : chargement des dossiers (limite 200, période partagée)
 * et des gestionnaires, comptage des non-assignés, drag & drop d'un dossier
 * vers une colonne statut avec mise à jour optimiste et rollback en cas
 * d'échec du PATCH.
 */
import { useState, useEffect, useCallback } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { usePeriode } from '@/lib/periode-context';
import { statutLabel } from '../format';
import { STATUTS_ORDER, champVersGestionnaireId } from './types';
import type { Dossier, Gestionnaire } from './types';

export function useKanbanBoard() {
  const { queryString: qsPeriode } = usePeriode();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);

  const fetchDossiers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      // Filtre de période partagé (date de référence : date de réception)
      if (qsPeriode) {
        for (const [cle, valeur] of new URLSearchParams(qsPeriode)) params.set(cle, valeur);
      }
      const res = await fetch(`/api/dossiers?${params.toString()}`);
      const data = await res.json();
      setDossiers(data.dossiers || []);
    } catch {
      setDossiers([]);
    } finally {
      setLoading(false);
    }
  }, [qsPeriode]);

  const fetchGestionnaires = useCallback(async () => {
    try {
      const res = await fetch('/api/dossiers/gestionnaires');
      if (res.ok) setGestionnaires(await res.json());
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    fetchDossiers();
    fetchGestionnaires();
  }, [fetchDossiers, fetchGestionnaires]);

  // Compter les non-assignés par statut
  const nonAssignesParStatut = useCallback(
    (statut: string) =>
      dossiers.filter((d) => d.statut === statut && !champVersGestionnaireId(statut, d)).length,
    [dossiers]
  );

  const totalNonAssignes = dossiers.filter(
    (d) => !champVersGestionnaireId(d.statut, d)
  ).length;

  const nonAssignes = dossiers.filter(
    (d) => !champVersGestionnaireId(d.statut, d)
  );

  const dossiersByStatut = useCallback(
    (statut: string) => dossiers.filter((d) => d.statut === statut),
    [dossiers]
  );

  const activeDossier = activeId ? dossiers.find((d) => d.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedDossier = dossiers.find((d) => d.id === active.id);
    if (!draggedDossier) return;

    let targetStatut: string | undefined;

    const overDossier = dossiers.find((d) => d.id === over.id);
    if (overDossier) {
      targetStatut = overDossier.statut;
    }

    if (!targetStatut && typeof over.id === 'string' && STATUTS_ORDER.includes(over.id as typeof STATUTS_ORDER[number])) {
      targetStatut = over.id;
    }

    if (!targetStatut || targetStatut === draggedDossier.statut) return;

    setDossiers((prev) =>
      prev.map((d) =>
        d.id === draggedDossier.id ? { ...d, statut: targetStatut! } : d
      )
    );

    try {
      const res = await fetch(`/api/dossiers/${draggedDossier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: targetStatut }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.erreur || 'Erreur lors de la mise à jour');
        setDossiers((prev) =>
          prev.map((d) =>
            d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
          )
        );
        return;
      }

      toast.success(
        `Dossier ${draggedDossier.numeroDossier} déplacé vers « ${statutLabel(targetStatut)} »`
      );
    } catch {
      toast.error('Erreur réseau lors de la mise à jour');
      setDossiers((prev) =>
        prev.map((d) =>
          d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
        )
      );
    }
  }

  return {
    dossiers, loading,
    gestionnaires, fetchDossiers,
    activeId, setActiveId, activeDossier,
    handleDragStart, handleDragEnd,
    totalNonAssignes, nonAssignes, nonAssignesParStatut, dossiersByStatut,
  };
}
