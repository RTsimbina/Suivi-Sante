'use client';

/**
 * Hook Assurés — état et traitements du registre des bénéficiaires :
 * listing paginé serveur (recherche, société, type, ayants droit inclus),
 * référentiels (sociétés, assurés principaux), formulaire de création/
 * édition (POST/PUT), suppression en deux temps et import Excel.
 * Extraits tels quels de l'ancien monolithe assures-view.tsx ; les
 * agrégations de familles et le comptage des sociétés couvertes sont
 * exposés sous forme dérivée (useMemo).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { PAGE_SIZE, type PaginationState } from '@/components/ui/shared-pagination';
import type { Assure, Societe, ImportResult } from './types';

const PAGINATION_VIDE: PaginationState = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 };

export function useAssuresData() {
  const [assures, setAssures] = useState<Assure[]>([]);
  const [ayantsDroitMap, setAyantsDroitMap] = useState<Record<string, Assure[]>>({});
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSociete, setFilterSociete] = useState('');
  const [filterType, setFilterType] = useState('');
  const [pagination, setPagination] = useState<PaginationState>(PAGINATION_VIDE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssure, setEditingAssure] = useState<Assure | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  // Form
  const [formSocieteId, setFormSocieteId] = useState('');
  const [formNom, setFormNom] = useState('');
  const [formPrenom, setFormPrenom] = useState('');
  const [formNSS, setFormNSS] = useState('');
  const [formMatricule, setFormMatricule] = useState('');
  const [formTypeBenef, setFormTypeBenef] = useState('ASSURE');
  const [formAssurePrincipalId, setFormAssurePrincipalId] = useState('');
  const [formCodeFamille, setFormCodeFamille] = useState('');
  const [formDateNaissance, setFormDateNaissance] = useState('');
  const [formSexe, setFormSexe] = useState('');
  const [formDateEffet, setFormDateEffet] = useState('');
  const [formBareme, setFormBareme] = useState('0.8');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formActif, setFormActif] = useState(true);

  // Assurés principaux (pour le select dans le formulaire des ayants droit)
  const [principaux, setPrincipaux] = useState<Assure[]>([]);

  const fetchAssures = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSociete) params.set('societeId', filterSociete);
      if (filterType) params.set('typeBeneficiaire', filterType);
      params.set('avecAyantsDroit', 'true');
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      const res = await fetch(`/api/assures?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setAssures(data.assures || []);
      setAyantsDroitMap(data.ayantsDroitMap || {});
      setCountsByType(data.countsByType || {});
      if (data.pagination) setPagination(data.pagination);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search, filterSociete, filterType, pagination.page, pagination.limit]);

  useEffect(() => {
    Promise.all([
      fetch('/api/technique/societes').then(r => r.json()).then(data => setSocietes(data.societes || [])).catch(() => {}),
      fetch('/api/assures?typeBeneficiaire=ASSURE&limit=500').then(r => r.json()).then(data => setPrincipaux(data.assures || [])).catch(() => {}),
    ]);
  }, []);

  useEffect(() => { fetchAssures(); }, [fetchAssures]);

  // ─── Filtres — chaque changement ramène à la page 1 (monolithe) ───
  const changerRecherche = (v: string) => { setSearch(v); setPagination(p => ({ ...p, page: 1 })); };
  const changerFiltreSociete = (v: string) => { setFilterSociete(v); setPagination(p => ({ ...p, page: 1 })); };
  const changerFiltreType = (v: string) => { setFilterType(v); setPagination(p => ({ ...p, page: 1 })); };
  const changerPage = (page: number) => setPagination(prev => ({ ...prev, page }));

  function resetForm() {
    setFormSocieteId('');
    setFormNom('');
    setFormPrenom('');
    setFormNSS('');
    setFormMatricule('');
    setFormTypeBenef('ASSURE');
    setFormAssurePrincipalId('');
    setFormCodeFamille('');
    setFormDateNaissance('');
    setFormSexe('');
    setFormDateEffet('');
    setFormBareme('0.8');
    setFormTelephone('');
    setFormEmail('');
    setFormAdresse('');
    setFormActif(true);
  }

  function openCreate() {
    setEditingAssure(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(a: Assure) {
    setEditingAssure(a);
    setFormSocieteId(a.societe.id);
    setFormNom(a.nom);
    setFormPrenom(a.prenom || '');
    setFormNSS(a.nSS || '');
    setFormMatricule(a.matricule || '');
    setFormTypeBenef(a.typeBeneficiaire || 'ASSURE');
    setFormAssurePrincipalId(a.assurePrincipalId || '');
    setFormCodeFamille(a.codeFamille || '');
    setFormDateNaissance(a.dateNaissance ? a.dateNaissance.split('T')[0] : '');
    setFormSexe(a.sexe || '');
    setFormDateEffet(a.dateEffet ? a.dateEffet.split('T')[0] : '');
    setFormBareme(a.bareme !== null ? String(a.bareme) : '0.8');
    setFormTelephone(a.telephone || '');
    setFormEmail(a.email || '');
    setFormAdresse(a.adresse || '');
    setFormActif(a.actif);
    setDialogOpen(true);
  }

  async function enregistrer() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        societeId: formSocieteId,
        nom: formNom,
        prenom: formPrenom || null,
        nSS: formNSS || null,
        matricule: formMatricule || null,
        typeBeneficiaire: formTypeBenef,
        assurePrincipalId: formTypeBenef !== 'ASSURE' ? (formAssurePrincipalId || null) : null,
        codeFamille: formCodeFamille || null,
        dateNaissance: formDateNaissance || null,
        sexe: formSexe || null,
        dateEffet: formDateEffet || null,
        bareme: formBareme ? parseFloat(formBareme) : null,
        telephone: formTelephone || null,
        email: formEmail || null,
        adresse: formAdresse || null,
        actif: formActif,
      };

      const method = editingAssure ? 'PUT' : 'POST';
      if (editingAssure) body.id = editingAssure.id;

      const res = await fetch('/api/assures', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.erreur) {
        toast.error(data?.erreur || 'Erreur');
        return;
      }

      setDialogOpen(false);
      fetchAssures();
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function supprimer(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/assures?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.erreur) {
        toast.error(data?.erreur || 'Erreur');
        return;
      }
      setDeleteConfirm(null);
      fetchAssures();
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  // ─── Import Excel (POST FormData) — l'UI du dialogue gère ses propres états ──
  async function importerFichier(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/assures/import', { method: 'POST', body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.erreur) throw new Error(data?.erreur || "Erreur lors de l'import");
    fetchAssures();
    return data as ImportResult;
  }

  // ─── Toggle famille ───
  const toggleFamily = (id: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Dérivés ───
  const nbPrincipaux = countsByType['ASSURE'] || 0;
  const nbConjoints = countsByType['CONJOINT'] || 0;
  const nbEnfants = countsByType['ENFANT'] || 0;
  const societesCouvertes = new Set(assures.map(a => a.societe.id)).size;

  // Assurés principaux avec leurs ayants droit
  const assurePrincipalRows = useMemo(() => {
    const principals = assures.filter(a => a.typeBeneficiaire === 'ASSURE' || !a.assurePrincipalId);
    return principals.map(p => ({
      principal: p,
      ayantsDroit: ayantsDroitMap[p.id] || [],
    }));
  }, [assures, ayantsDroitMap]);

  // Filtrer les familles selon le filtre type
  const filteredFamilies = useMemo(() => {
    if (!filterType) return assurePrincipalRows;
    if (filterType === 'ASSURE') return assurePrincipalRows;
    return assurePrincipalRows.filter(f =>
      f.principal.typeBeneficiaire === filterType ||
      f.ayantsDroit.some(ad => ad.typeBeneficiaire === filterType)
    );
  }, [assurePrincipalRows, filterType]);

  return {
    // données + filtres
    assures, countsByType, societes, loading,
    search, changerRecherche, filterSociete, changerFiltreSociete, filterType, changerFiltreType,
    pagination, changerPage,
    // familles
    assurePrincipalRows, filteredFamilies, toggleFamily, expandedFamilies,
    // dérivés
    nbPrincipaux, nbConjoints, nbEnfants, societesCouvertes,
    // formulaire
    dialogOpen, setDialogOpen, editingAssure, saving,
    openCreate, openEdit, enregistrer, supprimer,
    deleteConfirm, setDeleteConfirm,
    formSocieteId, setFormSocieteId, formNom, setFormNom, formPrenom, setFormPrenom,
    formNSS, setFormNSS, formMatricule, setFormMatricule, formTypeBenef, setFormTypeBenef,
    formAssurePrincipalId, setFormAssurePrincipalId, formCodeFamille, setFormCodeFamille,
    formDateNaissance, setFormDateNaissance, formSexe, setFormSexe,
    formDateEffet, setFormDateEffet, formBareme, setFormBareme,
    formTelephone, setFormTelephone, formEmail, setFormEmail, formAdresse, setFormAdresse,
    formActif, setFormActif, principaux,
    // import
    importerFichier,
  };
}
