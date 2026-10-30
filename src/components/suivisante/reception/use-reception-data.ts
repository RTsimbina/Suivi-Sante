'use client';

/**
 * Hook Réception — état et traitements des courriels : listing paginé
 * (filtres type/statut, recherche, période partagée), référentiel des
 * sociétés, formulaire de création, fiche détail avec mode édition et
 * suppression. Extraits tels quels de l'ancien monolithe reception-view.tsx.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { PAGE_SIZE, type PaginationState } from '@/components/ui/shared-pagination';
import type { CourrielItem, SocieteOption } from './types';

const PAGINATION_VIDE: PaginationState = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 };

export function useReceptionData(qsPeriode: string) {
  // Courriels state
  const [courriels, setCourriels] = useState<CourrielItem[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(PAGINATION_VIDE);
  const [loadingCourriels, setLoadingCourriels] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<string>('TOUS');
  const [filterStatut, setFilterStatut] = useState<string>('TOUS');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCourriel, setSelectedCourriel] = useState<CourrielItem | null>(null);

  // Edit mode in detail dialog
  const [editMode, setEditMode] = useState(false);

  // Societes for select
  const [societes, setSocietes] = useState<SocieteOption[]>([]);

  // Form state
  const [formType, setFormType] = useState('FACTURE_PRESTATAIRE');
  const [formExpediteur, setFormExpediteur] = useState('');
  const [formObjet, setFormObjet] = useState('');
  const [formSocieteId, setFormSocieteId] = useState('');
  const [formBeneficiaire, setFormBeneficiaire] = useState('');
  const [formMontant, setFormMontant] = useState('');
  const [formDateCourriel, setFormDateCourriel] = useState('');
  const [formDateSoins, setFormDateSoins] = useState('');
  const [formPrestataire, setFormPrestataire] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Detail edit state
  const [editStatut, setEditStatut] = useState('');
  const [editObservations, setEditObservations] = useState('');
  const [editDossierId, setEditDossierId] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ─── Fetch societes ─────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchSocietes() {
      try {
        const res = await fetch('/api/dossiers/societes');
        if (res.ok) {
          const data = await res.json();
          setSocietes(data.societes || []);
        }
      } catch {
        // silent
      }
    }
    fetchSocietes();
  }, []);

  // ─── Fetch courriels ────────────────────────────────────────────────────
  const fetchCourriels = useCallback(async (page = 1) => {
    setLoadingCourriels(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', String(PAGE_SIZE));
      if (filterType !== 'TOUS') params.set('type', filterType);
      if (filterStatut !== 'TOUS') params.set('statut', filterStatut);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      // Filtre de période partagé (date de référence : date du courriel)
      if (qsPeriode) {
        for (const [cle, valeur] of new URLSearchParams(qsPeriode)) params.set(cle, valeur);
      }

      const res = await fetch(`/api/reception/courriels?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCourriels(data.courriels || []);
        setPagination(data.pagination || PAGINATION_VIDE);
      }
    } catch {
      toast.error('Erreur lors du chargement des courriels.');
    } finally {
      setLoadingCourriels(false);
    }
  }, [filterType, filterStatut, searchQuery, qsPeriode]);

  useEffect(() => {
    fetchCourriels(1);
  }, [fetchCourriels]);

  function resetForm() {
    setFormType('FACTURE_PRESTATAIRE');
    setFormExpediteur('');
    setFormObjet('');
    setFormSocieteId('');
    setFormBeneficiaire('');
    setFormMontant('');
    setFormDateCourriel('');
    setFormDateSoins('');
    setFormPrestataire('');
  }

  // Bouton « Nouveau courriel » : formulaire vierge puis ouverture
  function ouvrirCreation() {
    resetForm();
    setCreateOpen(true);
  }

  // ─── Create courriel ────────────────────────────────────────────────────
  async function creer() {
    if (!formExpediteur.trim() || !formObjet.trim()) {
      toast.error("L'expéditeur et l'objet sont obligatoires.");
      return;
    }

    setFormSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type: formType,
        expediteur: formExpediteur.trim(),
        objet: formObjet.trim(),
        societeId: formSocieteId || null,
        beneficiaire: formBeneficiaire.trim() || null,
        montant: formMontant ? parseFloat(formMontant) : null,
        dateCourriel: formDateCourriel || new Date().toISOString(),
        dateSoins: formDateSoins || null,
        prestataire: formPrestataire.trim() || null,
      };

      const res = await fetch('/api/reception/courriels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.erreur || "Erreur lors de l'enregistrement.");
        return;
      }

      toast.success('Courriel enregistré avec succès.');
      setCreateOpen(false);
      resetForm();
      fetchCourriels(1);
    } catch {
      toast.error("Erreur lors de l'enregistrement du courriel.");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ─── Open detail ────────────────────────────────────────────────────────
  function ouvrirDetail(c: CourrielItem) {
    setSelectedCourriel(c);
    setEditStatut(c.statut);
    setEditObservations(c.observations || '');
    setEditDossierId(c.dossierId || '');
    setEditMode(false);
    setDetailOpen(true);
  }

  // onOpenChange du dialog détail : refermer aussi le mode édition
  function changerDetailOuverture(open: boolean) {
    if (!open) setEditMode(false);
    setDetailOpen(open);
  }

  // ─── Update courriel ────────────────────────────────────────────────────
  async function mettreAJour() {
    if (!selectedCourriel) return;

    setEditSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        statut: editStatut,
        observations: editObservations,
        dossierId: editDossierId || null,
      };

      const res = await fetch(`/api/reception/courriels/${selectedCourriel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.erreur || 'Erreur lors de la mise à jour.');
        return;
      }

      toast.success(data.message || 'Courriel mis à jour.');
      setEditMode(false);
      setDetailOpen(false);
      fetchCourriels(pagination.page);
    } catch {
      toast.error('Erreur lors de la mise à jour.');
    } finally {
      setEditSubmitting(false);
    }
  }

  // ─── Delete courriel ────────────────────────────────────────────────────
  async function supprimer() {
    if (!selectedCourriel) return;

    try {
      const res = await fetch(`/api/reception/courriels/${selectedCourriel.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.erreur || 'Erreur lors de la suppression.');
        return;
      }

      toast.success('Courriel supprimé.');
      setDeleteOpen(false);
      setDetailOpen(false);
      fetchCourriels(pagination.page);
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  }

  return {
    // données
    courriels, pagination, loadingCourriels,
    // filtres
    filterType, setFilterType, filterStatut, setFilterStatut, searchQuery, setSearchQuery,
    changerPage: fetchCourriels,
    // dialogues
    createOpen, setCreateOpen, detailOpen, changerDetailOuverture,
    deleteOpen, setDeleteOpen,
    // détail
    selectedCourriel, editMode, setEditMode,
    ouvrirDetail, mettreAJour, supprimer,
    // référentiel
    societes,
    // création
    ouvrirCreation, creer,
    formType, setFormType,
    formExpediteur, setFormExpediteur,
    formObjet, setFormObjet,
    formSocieteId, setFormSocieteId,
    formBeneficiaire, setFormBeneficiaire,
    formMontant, setFormMontant,
    formDateCourriel, setFormDateCourriel,
    formDateSoins, setFormDateSoins,
    formPrestataire, setFormPrestataire,
    formSubmitting,
    // édition du détail
    editStatut, setEditStatut,
    editObservations, setEditObservations,
    editDossierId, setEditDossierId,
    editSubmitting,
  };
}
