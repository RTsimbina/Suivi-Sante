'use client';

/**
 * Hook : données et actions de la vue Prestataires — sociétés, liens
 * prestataire-société, prestataires, synchronisation depuis les dossiers,
 * liaison, bascule de statut, retrait et création.
 * Extrait de prestataires-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { validerFormulairePrestataire } from './validations';

import {
  SocieteItem, PrestataireItem, LienPS, SocieteStats,
  StatutFilter, CreateFormState, EMPTY_CREATE_FORM,
  formulaireDepuisPrestataire, DoublonInfo,
} from './types';

export interface GroupeItem { id: string; nom: string }

export function usePrestatairesData() {
  // ─── État ───────────────────────────────────────────────────────────────
  const [societes, setSocietes] = useState<SocieteItem[]>([]);
  const [liens, setLiens] = useState<LienPS[]>([]);
  const [allPrestatairesList, setAllPrestatairesList] = useState<PrestataireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSociete, setSearchSociete] = useState('');
  const [searchPrestataire, setSearchPrestataire] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutFilter>('');

  // Sélection maître-détail
  const [selectedSocieteId, setSelectedSocieteId] = useState<string | null>(null);

  // Dialogs
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkPrestataireId, setLinkPrestataireId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  // Dialog créer un nouveau prestataire
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createSelectedSocietes, setCreateSelectedSocietes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [createSocieteSearch, setCreateSocieteSearch] = useState('');

  // Doublons détectés (409) — information déjà existante affichée + exception admin
  const [createDoublons, setCreateDoublons] = useState<DoublonInfo[]>([]);
  const [editDoublons, setEditDoublons] = useState<DoublonInfo[]>([]);

  // Groupes de prestataires
  const [groupes, setGroupes] = useState<GroupeItem[]>([]);

  const fetchGroupes = useCallback(async () => {
    try {
      const res = await fetch('/api/prestataires/groupes');
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        setGroupes((data.groupes || []).map((g: { id: string; nom: string }) => ({ id: g.id, nom: g.nom })));
      }
    } catch { /* silencieux : les listes de groupes restent vides */ }
  }, []);

  /** Crée un groupe de prestataires (Administrateur / Service Technique). */
  async function creerGroupe(nom: string, description?: string): Promise<{ ok: boolean; erreur?: string }> {
    try {
      const res = await fetch('/api/prestataires/groupes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), description: description?.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, erreur: (data as { erreur?: string }).erreur || `Erreur ${res.status}` };
      }
      await fetchGroupes();
      return { ok: true };
    } catch {
      return { ok: false, erreur: 'Erreur réseau' };
    }
  }

  // Formulaire de modification (état piloté par la vue d'édition)
  const [editForm, setEditForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Fiche détaillée + modification du prestataire (module GESTION → PRESTATAIRES)
  const [ficheOuvert, setFicheOuvert] = useState(false);
  const [fichePrestataire, setFichePrestataire] = useState<PrestataireItem | null>(null);
  const [ficheLoading, setFicheLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPrestataire, setEditPrestataire] = useState<PrestataireItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Fetches ────────────────────────────────────────────────────────────
  const fetchSocietes = useCallback(async () => {
    try {
      const res = await fetch('/api/technique/societes');
      if (res.status === 401 || res.status === 403) return;
      // Échec visible via la bannière d'erreur de la vue — jamais une liste
      // vide silencieuse (incident 2026-09 : 500 → « aucune liste trouvée »).
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFetchError(
          (data && typeof data.erreur === 'string' && data.erreur) ||
            `Erreur ${res.status} : impossible de charger les sociétés`
        );
        return;
      }
      const list = (Array.isArray(data) ? data : data.societes || []).map(
        (s: { id: string; nom: string }) => ({ id: s.id, nom: s.nom })
      );
      setSocietes(list);
    } catch {
      setFetchError('Erreur réseau : impossible de charger les sociétés');
    }
  }, []);

  // Référence pour éviter double appel au sync manuel
  const autoSyncDone = useRef(false);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchLiens = useCallback(async () => {
    try {
      const res = await fetch('/api/prestataires/societes');
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        const liensData = data.liens || [];
        setLiens(liensData);
        // Si aucun lien même après le auto-sync côté API → proposer sync manuel
        if (liensData.length === 0 && !autoSyncDone.current) {
          autoSyncDone.current = true;
          setSyncMessage('Aucun lien trouvé. Vérifiez que des dossiers existent avec un prestataire et une société.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err.erreur || `Erreur serveur (${res.status})`);
      }
    } catch (e) {
      setFetchError('Erreur réseau lors du chargement des liens prestataire-société.');
    }
  }, []);

  const fetchAllPrestataires = useCallback(async () => {
    try {
      const res = await fetch('/api/prestataires?limit=500');
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        setAllPrestatairesList(
          (data.prestataires || []).map((p: Record<string, unknown> & { id: string; nom: string; type: string }) => ({
            id: p.id,
            nom: p.nom,
            type: p.type,
            telephone: (p.telephone as string | null) ?? null,
            email: (p.email as string | null) ?? null,
            adresse: (p.adresse as string | null) ?? null,
            nif: (p.nif as string | null) ?? null,
            stat: (p.stat as string | null) ?? null,
            statutJuridique: (p.statutJuridique as string | null) ?? null,
            statut: (p.statut as string | null) ?? null,
            rib: (p.rib as string | null) ?? null,
            iban: (p.iban as string | null) ?? null,
            code: (p.code as string | null) ?? null,
            exceptionValidee: Boolean(p.exceptionValidee),
            groupePrestataire:
              (p.groupePrestataire as { id: string; nom: string } | null) ?? null,
            societes:
              (p.societes as { societe: { id: string; nom: string }; actif: boolean }[] | undefined) ?? [],
            actif: Boolean(p.actif),
            nbDossiers:
              (p._count as { dossiers?: number } | undefined)?.dossiers ?? 0,
          }))
        );
      }
    } catch (e) {
      console.error('Erreur chargement prestataires:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocietes();
    fetchLiens();
    fetchAllPrestataires();
    fetchGroupes();
  }, [fetchSocietes, fetchLiens, fetchAllPrestataires, fetchGroupes]);

  // Auto-sélection première société
  useEffect(() => {
    if (societes.length > 0 && !selectedSocieteId) {
      setSelectedSocieteId(societes[0].id);
    }
  }, [societes, selectedSocieteId]);

  // ─── Dérivés ────────────────────────────────────────────────────────────

  // Liens pour la société sélectionnée
  const selectedLiens = useMemo(
    () => liens.filter(l => l.societeId === selectedSocieteId),
    [liens, selectedSocieteId]
  );

  // Filtrer les liens de la société sélectionnée
  const filteredLiens = useMemo(() => {
    let result = selectedLiens;
    if (searchPrestataire) {
      const q = searchPrestataire.toLowerCase();
      result = result.filter(l =>
        l.prestataire.nom.toLowerCase().includes(q) ||
        l.prestataire.type.toLowerCase().includes(q) ||
        (l.prestataire.telephone && l.prestataire.telephone.includes(q))
      );
    }
    if (filterType) {
      result = result.filter(l => l.prestataire.type === filterType);
    }
    if (filterStatut) {
      result = result.filter(l =>
        filterStatut === 'actif' ? l.actif : !l.actif
      );
    }
    return result;
  }, [selectedLiens, searchPrestataire, filterType, filterStatut]);

  // Sociétés filtrées pour la liste de gauche
  const filteredSocietes = useMemo(() => {
    if (!searchSociete) return societes;
    const q = searchSociete.toLowerCase();
    return societes.filter(s => s.nom.toLowerCase().includes(q));
  }, [societes, searchSociete]);

  // Compteur par société
  const societeStats = useMemo(() => {
    const stats: Record<string, SocieteStats> = {};
    for (const l of liens) {
      if (!stats[l.societeId]) stats[l.societeId] = { total: 0, actifs: 0, inactifs: 0, nbDossiers: 0, montantTotal: 0 };
      stats[l.societeId].total++;
      stats[l.societeId].nbDossiers += l.nbDossiers ?? 0;
      stats[l.societeId].montantTotal += l.montantTotal ?? 0;
      if (l.actif) stats[l.societeId].actifs++;
      else stats[l.societeId].inactifs++;
    }
    return stats;
  }, [liens]);

  // Prestataires disponibles à lier (pas encore liés à cette société)
  // Utilise la liste complète des prestataires, pas seulement ceux déjà liés
  const availablePrestataires = useMemo(() => {
    const linkedIds = new Set(selectedLiens.map(l => l.prestataireId));
    return allPrestatairesList.filter(p => !linkedIds.has(p.id) && p.actif);
  }, [allPrestatairesList, selectedLiens]);

  // Stats globales
  const totalSocietesAvecPresta = Object.keys(societeStats).length;
  const totalLiens = liens.length;
  const totalActifs = liens.filter(l => l.actif).length;
  const totalInactifs = liens.filter(l => !l.actif).length;
  const totalPrestatairesUniques = allPrestatairesList.length;

  const selectedSociete = societes.find(s => s.id === selectedSocieteId);

  // Sociétés filtrées pour le dialogue de création
  const filteredCreateSocietes = useMemo(() => {
    if (!createSocieteSearch) return societes;
    const q = createSocieteSearch.toLowerCase();
    return societes.filter(s => s.nom.toLowerCase().includes(q));
  }, [societes, createSocieteSearch]);

  // Rattachements par prestataire (dérivés des liens) — alimente la liste
  // centralisée et la fiche détaillée (« sociétés clientes rattachées »).
  const societesParPrestataire = useMemo(() => {
    const map = new Map<string, { societe: { id: string; nom: string }; actif: boolean }[]>();
    for (const l of liens) {
      const list = map.get(l.prestataireId) ?? [];
      list.push({ societe: l.societe, actif: l.actif });
      map.set(l.prestataireId, list);
    }
    return map;
  }, [liens]);

  // ─── Actions ────────────────────────────────────────────────────────────
  async function handleSyncFromDossiers() {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/prestataires/societes/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSyncResult(data.message || `Synchronisation OK : ${data.created} lien(s) créé(s).`);
        // Recharger les données
        fetchLiens();
      } else {
        const err = await res.json().catch(() => ({}));
        setSyncResult(err.erreur || 'Erreur lors de la synchronisation.');
      }
    } catch {
      setSyncResult('Erreur réseau.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleLinkPrestataire() {
    if (!selectedSocieteId || !linkPrestataireId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/prestataires/societes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prestataireId: linkPrestataireId, societeId: selectedSocieteId }),
      });
      if (res.ok) {
        setLinkDialogOpen(false);
        setLinkPrestataireId('');
        fetchLiens();
      }
    } catch { /* silent */ } finally { setSaving(false); }
  }

  async function handleToggleActif(lienId: string, newActif: boolean) {
    try {
      const res = await fetch('/api/prestataires/societes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lienId, actif: newActif }),
      });
      if (res.ok) fetchLiens();
    } catch { /* silent */ }
  }

  async function handleUnlink(lienId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/prestataires/societes?id=${lienId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchLiens();
      }
    } catch { /* silent */ } finally { setSaving(false); }
  }

  /** Corps JSON standard du formulaire (champs du référentiel).
   *  NB : l'id est placé en premier (ordre de sérialisation stable). */
  function corpsDepuisFormulaire(form: CreateFormState, avecId?: string): Record<string, unknown> {
    const corps: Record<string, unknown> = avecId
      ? { id: avecId }
      : {};
    Object.assign(corps, {
      nom: form.nom,
      type: form.type || undefined,
      code: form.code || undefined,
      telephone: form.telephone || undefined,
      email: form.email || undefined,
      adresse: form.adresse || undefined,
      nif: form.nif || undefined,
      stat: form.stat || undefined,
      statutJuridique: form.statutJuridique || undefined,
      statut: form.statut || undefined,
      rib: form.rib || undefined,
      iban: form.iban || undefined,
      groupePrestataireId: form.groupePrestataireId || undefined,
    });
    return corps;
  }

  async function handleCreatePrestataire() {
    setCreateError('');
    setCreateSuccess('');
    setCreateDoublons([]);
    const erreurs = validerFormulairePrestataire(createForm);
    if (Object.keys(erreurs).length > 0) {
      setCreateError(Object.values(erreurs)[0]);
      return;
    }
    setCreating(true);
    try {
      // 1) Créer le prestataire
      const res = await fetch('/api/prestataires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsDepuisFormulaire(createForm)),
      });
      if (res.status === 409 || res.status === 403) {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.erreur || 'Des doublons ont été détectés.');
        if (res.status === 409) setCreateDoublons(err.doublons || []);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.erreur || 'Erreur lors de la création du prestataire.');
        return;
      }
      const { prestataire } = await res.json();

      // 2) Rattacher aux sociétés sélectionnées
      if (createSelectedSocietes.length > 0) {
        const linkResults = await Promise.allSettled(
          createSelectedSocietes.map(societeId =>
            fetch('/api/prestataires/societes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prestataireId: prestataire.id, societeId }),
            })
          )
        );
        const failed = linkResults.filter(r => r.status === 'rejected' || !r.value.ok).length;
        if (failed > 0) {
          setCreateSuccess(`Prestataire créé mais ${failed} rattachement(s) sur ${createSelectedSocietes.length} ont échoué.`);
        } else {
          setCreateSuccess(`Prestataire créé et rattaché à ${createSelectedSocietes.length} société(s) avec succès.`);
        }
      } else {
        setCreateSuccess('Prestataire créé avec succès. Aucune société sélectionnée.');
      }

      // 3) Réinitialiser le formulaire et rafraîchir les données
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateSelectedSocietes([]);
      setCreateDoublons([]);
      fetchAllPrestataires();
      fetchLiens();
      // Fermer le dialogue après un court délai pour montrer le succès
      setTimeout(() => {
        setCreateDialogOpen(false);
        setCreateSuccess('');
      }, 1500);
    } catch {
      setCreateError('Erreur réseau lors de la création.');
    } finally {
      setCreating(false);
    }
  }

  function toggleSocieteSelection(societeId: string) {
    setCreateSelectedSocietes(prev =>
      prev.includes(societeId)
        ? prev.filter(id => id !== societeId)
        : [...prev, societeId]
    );
  }

  function clearSocieteSelection() {
    setCreateSelectedSocietes([]);
  }

  // ─── Ouvertures du dialog de création (comportement inchangé) ───────────
  function openCreateDialog() {
    setCreateDialogOpen(true);
    setCreateError('');
    setCreateSuccess('');
    setCreateSocieteSearch('');
    setCreateDoublons([]);
  }

  function changeCreateDialogOpen(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateError('');
      setCreateSuccess('');
    }
  }

  // ─── Fiche détaillée d'un prestataire ───────────────────────────────────
  // Chargée depuis GET /api/prestataires/[id] : données les plus fraîches,
  // rattachements aux sociétés inclus, 404 si l'identifiant est inconnu
  // (protection contre la manipulation d'identifiant dans l'URL).
  async function ouvrirFiche(prestataireId: string) {
    setFicheOuvert(true);
    setFicheLoading(true);
    try {
      const res = await fetch(`/api/prestataires/${prestataireId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFicheOuvert(false);
        toast.error((data && typeof data.erreur === 'string' && data.erreur) || `Erreur ${res.status} : fiche indisponible`);
        return;
      }
      setFichePrestataire(data.prestataire);
    } catch {
      setFicheOuvert(false);
      toast.error('Erreur réseau : fiche indisponible');
    } finally {
      setFicheLoading(false);
    }
  }

  function fermerFiche() {
    setFicheOuvert(false);
    setFichePrestataire(null);
    setFicheLoading(false);
  }

  /** Ouvre le formulaire « Modifier le prestataire » pré-rempli. */
  function ouvrirEdition(p: PrestataireItem) {
    setEditPrestataire({ ...p });
    setEditForm(formulaireDepuisPrestataire(p));
    setEditErrors({});
    setEditDialogOpen(true);
  }

  /** Depuis la fiche : bouton « Modifier le prestataire ». */
  function modifierDepuisFiche() {
    if (!fichePrestataire) return;
    const fiche = fichePrestataire;
    fermerFiche();
    ouvrirEdition(fiche);
  }

  /**
   * Enregistre la modification (PUT /api/prestataires).
   * Validation locale avec les MÊMES schémas Zod que l'API (validations.ts) ;
   * l'autorisation est tranchée côté serveur (Admin + Service Technique) :
   * un 403 est affiché à l'utilisateur, jamais contourné côté client.
   */
  async function handleSaveEdit(form: CreateFormState) {
    if (!editPrestataire) return;
    setSavingEdit(true);
    setEditDoublons([]);
    try {
      const res = await fetch('/api/prestataires', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsDepuisFormulaire(form, editPrestataire.id)),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 || res.status === 403) {
        // 409 = doublons (nom, e-mail, NIF, Num STAT, code) — l'information
        // déjà existante est affichée ; l'exception est réservée à l'Administrateur.
        toast.warning(
          (data && typeof data.erreur === 'string' && data.erreur) ||
            `Erreur ${res.status} : modification refusée`
        );
        if (res.status === 409) setEditDoublons((data as { doublons?: DoublonInfo[] }).doublons || []);
        return;
      }
      if (!res.ok) {
        const detailZod =
          data && Array.isArray(data.details) && data.details.length > 0
            ? `${data.details[0].champ} : ${data.details[0].message}`
            : '';
        toast.error(
          (data && typeof data.erreur === 'string' && data.erreur) ||
            detailZod ||
            `Erreur ${res.status} : modification refusée`
        );
        return;
      }
      toast.success('Prestataire modifié. La modification est enregistrée dans le journal d\'audit.');
      setEditDialogOpen(false);
      setEditPrestataire(null);
      // Rafraîchir les listes (fiche + annuaire + conventions)
      fetchAllPrestataires();
    } catch {
      toast.error('Erreur réseau : modification non enregistrée');
    } finally {
      setSavingEdit(false);
    }
  }

  /**
   * Valide une exception de doublon : réémet l'opération avec le motif.
   * Le serveur autorise l'exception UNIQUEMENT pour un Administrateur et
   * l'enregistre dans le Journal d'Audit (action EXCEPTION_DOUBLON, CRITIQUE).
   */
  async function confirmerExceptionCreation(motif: string) {
    if (!motif || motif.trim().length < 5) {
      setCreateError('Un motif est requis (5 caractères minimum) pour valider une exception.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/prestataires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...corpsDepuisFormulaire(createForm),
          exceptionDoublon: true,
          motifException: motif.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError((data as { erreur?: string }).erreur || `Erreur ${res.status}`);
        return;
      }
      toast.success('Prestataire créé. Exception de doublon enregistrée dans le journal d\'audit.');
      setCreateDoublons([]);
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateSelectedSocietes([]);
      fetchAllPrestataires();
      fetchLiens();
      setTimeout(() => { setCreateDialogOpen(false); setCreateSuccess(''); }, 1200);
    } catch {
      setCreateError('Erreur réseau.');
    } finally {
      setCreating(false);
    }
  }

  async function confirmerExceptionEdition(motif: string) {
    if (!editPrestataire) return;
    if (!motif || motif.trim().length < 5) {
      toast.error('Un motif est requis (5 caractères minimum) pour valider une exception.');
      return;
    }
    setSavingEdit(true);
    setEditDoublons([]);
    try {
      const res = await fetch('/api/prestataires', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...corpsDepuisFormulaire(editForm, editPrestataire.id),
          exceptionDoublon: true,
          motifException: motif.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { erreur?: string }).erreur || `Erreur ${res.status}`);
        return;
      }
      toast.success('Modification enregistrée. Exception de doublon tracée dans le journal d\'audit.');
      setEditDialogOpen(false);
      setEditPrestataire(null);
      fetchAllPrestataires();
    } catch {
      toast.error('Erreur réseau : modification non enregistrée');
    } finally {
      setSavingEdit(false);
    }
  }

  return {
    // Données
    societes,
    liens,
    allPrestatairesList,
    loading,
    fetchError,
    // Rattachements par prestataire (liste centralisée + fiche)
    societesParPrestataire,
    // Recherche & filtres
    searchSociete,
    setSearchSociete,
    searchPrestataire,
    setSearchPrestataire,
    filterType,
    setFilterType,
    filterStatut,
    setFilterStatut,
    // Sélection maître
    selectedSocieteId,
    setSelectedSocieteId,
    selectedSociete,
    // Dialog lien
    linkDialogOpen,
    setLinkDialogOpen,
    linkPrestataireId,
    setLinkPrestataireId,
    saving,
    availablePrestataires,
    // Suppression
    deleteConfirm,
    setDeleteConfirm,
    // Synchronisation
    syncing,
    syncResult,
    syncMessage,
    handleSyncFromDossiers,
    // Actions sur les liens
    handleLinkPrestataire,
    handleToggleActif,
    handleUnlink,
    // Groupes de prestataires
    groupes,
    fetchGroupes,
    creerGroupe,
    // Doublons / exception
    createDoublons,
    editDoublons,
    setCreateDoublons,
    setEditDoublons,
    confirmerExceptionCreation,
    confirmerExceptionEdition,
    // Dialog création
    createDialogOpen,
    openCreateDialog,
    changeCreateDialogOpen,
    createForm,
    setCreateForm,
    createSelectedSocietes,
    creating,
    createError,
    createSuccess,
    createSocieteSearch,
    setCreateSocieteSearch,
    filteredCreateSocietes,
    handleCreatePrestataire,
    toggleSocieteSelection,
    clearSocieteSelection,
    // Dérivés
    selectedLiens,
    filteredLiens,
    filteredSocietes,
    societeStats,
    totalSocietesAvecPresta,
    totalLiens,
    totalActifs,
    totalInactifs,
    totalPrestatairesUniques,
    // Fiche détaillée + modification (module GESTION → PRESTATAIRES)
    ficheOuvert,
    fichePrestataire,
    ficheLoading,
    ouvrirFiche,
    fermerFiche,
    modifierDepuisFiche,
    editDialogOpen,
    setEditDialogOpen,
    editPrestataire,
    setEditPrestataire,
    editForm,
    setEditForm,
    editErrors,
    setEditErrors,
    savingEdit,
    ouvrirEdition,
    handleSaveEdit,
  };
}

export type PrestatairesDataState = ReturnType<typeof usePrestatairesData>;
