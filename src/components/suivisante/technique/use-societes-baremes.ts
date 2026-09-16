'use client';

/**
 * Hook : sociétés & barèmes de la vue Technique (liste, CRUD, dialog, filtres).
 * Extrait de technique-view.tsx lors du découpage Vague 3 (comportement inchangé).
 * Appelé par le conteneur TechniqueView afin que l'état survive aux changements
 * d'onglets (Radix démonte le contenu des onglets inactifs).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import {
  BaremeRow,
  Societe,
  PRESTATIONS,
  emptyBaremes,
} from './types';

export function useSocietesBaremes() {
  // ─── State: Sociétés & Barèmes ───
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [societesLoading, setSocietesLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSociete, setEditingSociete] = useState<Societe | null>(null);
  const [societeNom, setSocieteNom] = useState('');
  const [baremesForm, setBaremesForm] = useState<BaremeRow[]>(emptyBaremes());
  const [savingSociete, setSavingSociete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── State: Filtre barèmes par société ───
  const [filtreSocieteId, setFiltreSocieteId] = useState<string | undefined>(undefined);
  const [filtrePrestation, setFiltrePrestation] = useState<string>('all');
  const [baremesLoading, setBaremesLoading] = useState(false);

  // Barèmes détaillés de la société sélectionnée (rechargés depuis l'API)
  const [baremesSociete, setBaremesSociete] = useState<BaremeRow[]>([]);

  // Charger les barèmes d'une société quand elle est sélectionnée
  const fetchBaremesSociete = useCallback(async (societeId: string) => {
    setBaremesLoading(true);
    try {
      const res = await fetch(`/api/technique/societes/${societeId}`);
      if (res.ok) {
        const data = await res.json();
        const baremes = data.societe?.baremes || [];
        setBaremesSociete(baremes);
      } else {
        setBaremesSociete([]);
      }
    } catch {
      setBaremesSociete([]);
    } finally {
      setBaremesLoading(false);
    }
  }, []);

  const handleFiltreSocieteChange = (value: string) => {
    if (value === '__all__') {
      setFiltreSocieteId(undefined);
      setBaremesSociete([]);
      setFiltrePrestation('all');
    } else {
      setFiltreSocieteId(value);
      setFiltrePrestation('all');
      fetchBaremesSociete(value);
    }
  };

  // Barèmes filtrés par type de prestation
  const baremesFiltres = useMemo(() => {
    if (!filtreSocieteId) return [];
    if (filtrePrestation === 'all') return baremesSociete;
    return baremesSociete.filter((b) => b.prestation === filtrePrestation);
  }, [filtreSocieteId, filtrePrestation, baremesSociete]);

  // Société sélectionnée (pour l'en-tête)
  const societeSelectionnee = useMemo(
    () => societes.find((s) => s.id === filtreSocieteId),
    [societes, filtreSocieteId]
  );

  // ─── Fetch sociétés ───
  const fetchSocietes = useCallback(async () => {
    setSocietesLoading(true);
    try {
      const res = await fetch('/api/technique/societes?withBaremes=true');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Message serveur explicite (ex. migration en attente) — jamais un
        // 500 muet transformé en liste vide (incident 2026-09).
        toast.error(
          (data && typeof data.erreur === 'string' && data.erreur) ||
            `Impossible de charger les sociétés (erreur ${res.status})`
        );
        return;
      }
      setSocietes(Array.isArray(data) ? data : data.societes ?? []);
    } catch {
      toast.error('Erreur réseau : impossible de charger les sociétés');
    } finally {
      setSocietesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocietes();
  }, [fetchSocietes]);

  // ─── Handlers: Sociétés & Barèmes ───
  const openCreateDialog = () => {
    setEditingSociete(null);
    setSocieteNom('');
    setBaremesForm(emptyBaremes());
    setDialogOpen(true);
  };

  const openEditDialog = async (societe: Societe) => {
    setEditingSociete(societe);
    setSocieteNom(societe.nom);
    // Toujours recharger les barèmes depuis l'API pour avoir les valeurs à jour
    let baremes = societe.baremes;
    if (!baremes || baremes.length === 0) {
      try {
        const res = await fetch(`/api/technique/societes/${societe.id}`);
        if (res.ok) {
          const data = await res.json();
          baremes = data.societe?.baremes || [];
        }
      } catch { /* silent */ }
    }
    setBaremesForm(
      PRESTATIONS.map((p) => {
        const existing = baremes?.find((b) => b.prestation === p);
        return existing
          ? { prestation: p, tauxCouverture: existing.tauxCouverture, plafond: existing.plafond, description: existing.description || '' }
          : { prestation: p, tauxCouverture: 0, plafond: 0, description: '' };
      })
    );
    setDialogOpen(true);
  };

  const handleSaveSociete = async () => {
    if (!societeNom.trim()) {
      toast.error('Le nom de la société est requis');
      return;
    }
    setSavingSociete(true);
    try {
      // Filtrer les barèmes : ne pas envoyer ceux avec taux=0 ET plafond=0 si création
      const baremesToSend = editingSociete
        ? baremesForm // En modification, envoyer tout (remplacement total)
        : baremesForm.filter((b) => b.tauxCouverture > 0 || b.plafond > 0);

      const body = { nom: societeNom.trim(), baremes: baremesToSend };
      let res: Response;
      if (editingSociete) {
        res = await fetch(`/api/technique/societes/${editingSociete.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/technique/societes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.erreur) {
        throw new Error(data?.erreur || `Erreur serveur (${res.status})`);
      }
      toast.success(editingSociete ? 'Société et barèmes mis à jour' : 'Société créée avec succès');
      setDialogOpen(false);
      await fetchSocietes();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSavingSociete(false);
    }
  };

  const handleDeleteSociete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/technique/societes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur lors de la suppression');
      toast.success('Société supprimée');
      fetchSocietes();
    } catch {
      toast.error('Impossible de supprimer la société');
    } finally {
      setDeletingId(null);
    }
  };

  const updateBaremeField = (
    index: number,
    field: keyof Omit<BaremeRow, 'prestation'>,
    value: string | number
  ) => {
    setBaremesForm((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  return {
    // Données
    societes,
    societesLoading,
    // Dialog création / édition
    dialogOpen,
    setDialogOpen,
    editingSociete,
    societeNom,
    setSocieteNom,
    baremesForm,
    savingSociete,
    deletingId,
    openCreateDialog,
    openEditDialog,
    handleSaveSociete,
    handleDeleteSociete,
    updateBaremeField,
    // Filtre barèmes par société
    filtreSocieteId,
    filtrePrestation,
    setFiltrePrestation,
    baremesLoading,
    baremesFiltres,
    societeSelectionnee,
    handleFiltreSocieteChange,
  };
}

export type SocietesBaremesState = ReturnType<typeof useSocietesBaremes>;
