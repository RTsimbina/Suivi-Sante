'use client';

/**
 * Hook : liste des sociétés, recherche, CRUD, sélection maître, contrats,
 * détails et rapport PDF.
 * Extrait de societes-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

import {
  Societe,
  SocieteDetails,
  DetailTab,
  ContratInfo,
} from './types';

export function useSocietesList() {
  // ─── État ───────────────────────────────────────────────────────────────
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contratsMap, setContratsMap] = useState<Record<string, ContratInfo[]>>({});
  const [detailsMap, setDetailsMap] = useState<Record<string, SocieteDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});

  // Formulaire
  const [formNom, setFormNom] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNif, setFormNif] = useState('');
  const [formContact, setFormContact] = useState('');
  const [saving, setSaving] = useState(false);

  // Détail : onglet actif + filtres
  const [activeTab, setActiveTab] = useState<DetailTab>('baremes');
  const [assureSearch, setAssureSearch] = useState('');
  const [prestataireSearch, setPrestataireSearch] = useState('');
  const [baremeSearch, setBaremeSearch] = useState('');

  // ─── Fetch sociétés ─────────────────────────────────────────────────────
  const fetchSocietes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/technique/societes?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.societes || [];
      setSocietes(list);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchSocietes(); }, [fetchSocietes]);

  // ─── Fetch contrats (budget) ────────────────────────────────────────────
  useEffect(() => {
    async function fetchContrats() {
      try {
        const res = await fetch('/api/contrats');
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, ContratInfo[]> = {};
          for (const c of (Array.isArray(data) ? data : [])) {
            const sid = c.societe?.id;
            if (sid) {
              if (!map[sid]) map[sid] = [];
              map[sid].push({ reference: c.reference, budgetAnnuel: c.budgetAnnuel, budgetUtilise: c.budgetUtilise, solde: c.budgetAnnuel - c.budgetUtilise, statut: c.statut, dateFin: c.dateFin });
            }
          }
          setContratsMap(map);
        }
      } catch { /* silent */ }
    }
    fetchContrats();
  }, []);

  // ─── Fetch détails d'une société ────────────────────────────────────────
  const fetchDetails = useCallback(async (societeId: string) => {
    if (detailsMap[societeId]) return;
    setDetailsLoading((prev) => ({ ...prev, [societeId]: true }));
    try {
      const res = await fetch(`/api/technique/societes/${societeId}/details`);
      if (res.ok) {
        const data = await res.json();
        setDetailsMap((prev) => ({ ...prev, [societeId]: data }));
      }
    } catch { /* silent */ } finally {
      setDetailsLoading((prev) => ({ ...prev, [societeId]: false }));
    }
  }, [detailsMap]);

  // Auto-sélectionner la première société au chargement
  useEffect(() => {
    if (societes.length > 0 && !selectedId) {
      setSelectedId(societes[0].id);
    }
  }, [societes, selectedId]);

  // Charger les détails quand on sélectionne
  useEffect(() => {
    if (selectedId) fetchDetails(selectedId);
  }, [selectedId, fetchDetails]);

  // ─── Formulaires ────────────────────────────────────────────────────────
  function resetForm() {
    setFormNom(''); setFormAdresse(''); setFormTelephone('');
    setFormEmail(''); setFormNif(''); setFormContact('');
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(s: Societe) {
    setEditing(s);
    setFormNom(s.nom); setFormAdresse(s.adresse || '');
    setFormTelephone(s.telephone || ''); setFormEmail(s.email || '');
    setFormNif(s.nif || ''); setFormContact(s.contactPrincipal || '');
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formNom.trim()) return;
    setSaving(true);
    try {
      const body = {
        nom: formNom.trim(),
        adresse: formAdresse.trim() || undefined,
        telephone: formTelephone.trim() || undefined,
        email: formEmail.trim() || undefined,
        nif: formNif.trim() || undefined,
        contactPrincipal: formContact.trim() || undefined,
      };

      if (editing) {
        const res = await fetch(`/api/technique/societes/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) { setFormOpen(false); fetchSocietes(); }
      } else {
        const res = await fetch('/api/technique/societes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) { setFormOpen(false); fetchSocietes(); }
      }
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/technique/societes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        if (selectedId === id) setSelectedId(null);
        fetchSocietes();
      }
    } catch { /* silent */ }
  }

  // ─── Dérivés ────────────────────────────────────────────────────────────
  const totalDossiers = societes.reduce((s, soc) => s + soc._count.dossiers, 0);
  const totalAssures = societes.reduce((s, soc) => s + soc._count.assures, 0);
  const totalContrats = societes.reduce((s, soc) => s + soc._count.contrats, 0);
  const totalBaremes = societes.reduce((s, soc) => s + soc._count.baremes, 0);
  const societesActives = societes.filter(s => s.actif).length;

  const selectedSociete = societes.find(s => s.id === selectedId);
  const details = selectedId ? detailsMap[selectedId] : null;
  const isLoading = selectedId ? detailsLoading[selectedId] : false;

  // Filtres
  const filteredBaremes = useMemo(() =>
    (details?.baremes || []).filter(b =>
      !baremeSearch || b.prestation.toLowerCase().includes(baremeSearch.toLowerCase())
    ), [details, baremeSearch]);

  const filteredAssures = useMemo(() =>
    (details?.assures || []).filter(a => {
      const q = assureSearch.toLowerCase();
      if (!q) return true;
      return `${a.nom} ${a.prenom || ''} ${a.nSS || ''}`.toLowerCase().includes(q);
    }), [details, assureSearch]);

  const filteredPrestataires = useMemo(() =>
    (details?.prestataires || []).filter(p => {
      const q = prestataireSearch.toLowerCase();
      if (!q) return true;
      return `${p.nom} ${p.type || ''}`.toLowerCase().includes(q);
    }), [details, prestataireSearch]);

  // ─── Télécharger rapport PDF ─────────────────────────────────────────────
  const [rapportLoading, setRapportLoading] = useState(false);
  const handleDownloadRapport = async () => {
    if (!selectedId) return;
    setRapportLoading(true);
    try {
      const now = new Date();
      const res = await fetch(`/api/entreprises/${selectedId}/rapport?mois=${now.getMonth() + 1}&annee=${now.getFullYear()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport-${selectedSociete?.nom || 'societe'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[RAPPORT PDF] Erreur serveur:', res.status, err);
      }
    } catch (err) {
      console.error('[RAPPORT PDF] Erreur:', err);
    } finally {
      setRapportLoading(false);
    }
  };

  return {
    // Liste & recherche
    societes,
    search,
    setSearch,
    loading,
    // Sélection maître
    selectedId,
    setSelectedId,
    activeTab,
    setActiveTab,
    selectedSociete,
    // CRUD
    formOpen,
    setFormOpen,
    editing,
    deleteConfirm,
    setDeleteConfirm,
    openCreate,
    openEdit,
    handleSave,
    handleDelete,
    formNom,
    setFormNom,
    formAdresse,
    setFormAdresse,
    formTelephone,
    setFormTelephone,
    formEmail,
    setFormEmail,
    formNif,
    setFormNif,
    formContact,
    setFormContact,
    saving,
    // Stats agrégées
    totalDossiers,
    totalAssures,
    totalContrats,
    totalBaremes,
    societesActives,
    // Détail
    contratsMap,
    detailsMap,
    details,
    isLoading,
    // Onglets du détail (barèmes / assurés / prestataires)
    filteredBaremes,
    baremeSearch,
    setBaremeSearch,
    filteredAssures,
    assureSearch,
    setAssureSearch,
    filteredPrestataires,
    prestataireSearch,
    setPrestataireSearch,
    // Rapport PDF
    rapportLoading,
    handleDownloadRapport,
  };
}

export type SocietesListState = ReturnType<typeof useSocietesList>;
