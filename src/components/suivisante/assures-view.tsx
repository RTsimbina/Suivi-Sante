'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Heart, Plus, Pencil, Trash2, Search, Loader2, X, Building2, FileText,
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle as XCircleIcon,
  Users, UserCheck, Baby, ChevronRight, ChevronDown, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SharedPagination, PAGE_SIZE, type PaginationState } from '@/components/ui/shared-pagination';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Societe { id: string; nom: string; }

interface Assure {
  id: string;
  nom: string;
  prenom: string | null;
  nSS: string | null;
  matricule: string | null;
  typeBeneficiaire: string;
  assurePrincipalId: string | null;
  codeFamille: string | null;
  dateNaissance: string | null;
  sexe: string | null;
  dateEffet: string | null;
  bareme: number | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  actif: boolean;
  societe: Societe;
  _count: { dossiers: number };
  createdAt: string;
  updatedAt: string;
}

interface ImportResult {
  nbLignes: number;
  nbSucces: number;
  nbErreurs: number;
  tauxSucces: number;
  erreurs: { ligne: number; message: string }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_BENEF_LABELS: Record<string, string> = {
  ASSURE: 'Assuré principal',
  CONJOINT: 'Conjoint',
  ENFANT: 'Enfant',
};

const TYPE_BENEF_ICONS: Record<string, typeof UserCheck> = {
  ASSURE: UserCheck,
  CONJOINT: Heart,
  ENFANT: Baby,
};

const TYPE_BENEF_COLORS: Record<string, string> = {
  ASSURE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  CONJOINT: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  ENFANT: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatAge(d: string | null): string {
  if (!d) return '';
  const birth = new Date(d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age} ans` : '';
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function AssuresView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';
  const [assures, setAssures] = useState<Assure[]>([]);
  const [ayantsDroitMap, setAyantsDroitMap] = useState<Record<string, Assure[]>>({});
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSociete, setFilterSociete] = useState('');
  const [filterType, setFilterType] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssure, setEditingAssure] = useState<Assure | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  // ─── State: Import ───
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleSave() {
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

  async function handleDelete(id: string) {
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

  // ─── Handlers: Import ───
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setImportFile(file); setImportResult(null);
    } else { toast.error('Veuillez déposer un fichier .xlsx'); }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImportFile(file); setImportResult(null); }
  };

  const handleImport = async () => {
    if (!importFile) { toast.error('Veuillez sélectionner un fichier'); return; }
    setImporting(true); setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/assures/import', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.erreur) throw new Error(data?.erreur || "Erreur lors de l'import");
      setImportResult(data);
      if (data.nbErreurs === 0) {
        toast.success(`Import réussi : ${data.nbSucces} bénéficiaires importés`);
      } else {
        toast.warning(`Import partiel : ${data.nbSucces} succès, ${data.nbErreurs} erreurs`);
      }
      fetchAssures();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally { setImporting(false); }
  };

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
  const totalAssures = assures.length;
  const activeAssures = assures.filter(a => a.actif).length;

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

  return (
    <div className="space-y-6">
      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Total bénéficiaires</p>
                <p className="text-2xl font-bold">{nbPrincipaux + nbConjoints + nbEnfants}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Assurés principaux</p>
                <p className="text-2xl font-bold text-emerald-600">{nbPrincipaux}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
          <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Conjoints</p>
                <p className="text-2xl font-bold text-pink-600">{nbConjoints}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-pink-50 dark:bg-pink-950/40 flex items-center justify-center">
                <Heart className="h-5 w-5 text-pink-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Enfants</p>
                <p className="text-2xl font-bold text-blue-600">{nbEnfants}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <Baby className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Sociétés couvertes</p>
                <p className="text-2xl font-bold">{new Set(assures.map(a => a.societe.id)).size}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Actions ─── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }} className="pl-10 h-9 text-sm" />
          </div>
          <select value={filterSociete} onChange={(e) => { setFilterSociete(e.target.value); setPagination(p => ({ ...p, page: 1 })); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Toutes les sociétés</option>
            {societes.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
          </select>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPagination(p => ({ ...p, page: 1 })); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Tous les types</option>
            <option value="ASSURE">Assurés principaux</option>
            <option value="CONJOINT">Conjoints</option>
            <option value="ENFANT">Enfants</option>
          </select>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {/* Bouton Import */}
            <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setImportFile(null); setImportResult(null); } }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 h-9 text-sm"><Upload className="h-4 w-4" />Importer</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    Importer des bénéficiaires
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800">
                    <p className="font-medium mb-1">Colonnes attendues :</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <strong>Matricule *</strong>, <strong>Nom *</strong>, Prénoms, <strong>Statut</strong> (Assuré/Conjoint/Enfant), <strong>Société client *</strong>,
                      Assuré(e) (matricule principal), Famille, Genre, Date de naissance, Date d'effet, Barème (ex: 0,8), Téléphone, Email, NSS
                    </p>
                    <p className="text-xs text-amber-600 mt-1">* = obligatoire. Les assurés principaux sont créés en premier, puis les ayants droit sont rattachés automatiquement.</p>
                  </div>
                  <div
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors
                      ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                        : importFile ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50'
                        : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'}`}
                  >
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                    {importFile ? (
                      <><FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" /><p className="text-sm font-medium">{importFile.name}</p><p className="text-xs text-muted-foreground mt-1">{(importFile.size / 1024).toFixed(1)} Ko</p></>
                    ) : (
                      <><Upload className="h-10 w-10 text-muted-foreground/40 mb-2" /><p className="text-sm font-medium">Glissez-déposez votre fichier <span className="text-emerald-600 font-semibold">.xlsx</span> ici</p><p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p></>
                    )}
                  </div>
                  <Button onClick={handleImport} disabled={importing || !importFile} className="w-full gap-2">
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importing ? 'Import en cours...' : 'Importer le fichier'}
                  </Button>
                  {importResult && (
                    <div className="space-y-4 mt-2">
                      <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">Lignes</p><p className="text-xl font-bold">{importResult.nbLignes}</p></Card>
                        <Card className="p-3 text-center"><p className="text-xs text-emerald-600">Succès</p><p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.nbSucces}</p></Card>
                        <Card className="p-3 text-center"><p className="text-xs text-red-500">Erreurs</p><p className="text-xl font-bold text-red-600">{importResult.nbErreurs}</p></Card>
                      </div>
                      {importResult.erreurs && importResult.erreurs.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-1.5">
                          {importResult.erreurs.map((err, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm rounded-md border border-red-100 bg-red-50 dark:bg-red-950/40 p-2">
                              <XCircleIcon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                              <div><span className="font-medium text-red-700 dark:text-red-300">Ligne {err.ligne} :</span>{' '}<span className="text-red-600">{err.message}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                      {importResult.nbErreurs === 0 && (
                        <div className="flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3">
                          <CheckCircle className="h-5 w-5 text-emerald-600" /><p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Tous les bénéficiaires ont été importés avec succès !</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fermer</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Nouveau bénéficiaire
            </Button>
          </div>
        )}
      </div>

      {/* ─── Table des familles ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Registre des bénéficiaires ({nbPrincipaux + nbConjoints + nbEnfants})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase w-8"></th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Bénéficiaire</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Société</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Matricule</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden xl:table-cell">Date d'effet</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden xl:table-cell">Barème</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dossiers</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Statut</th>
                    {canEdit && <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredFamilies.map(({ principal, ayantsDroit }) => {
                    const isExpanded = expandedFamilies.has(principal.id);
                    const hasAyantsDroit = ayantsDroit.length > 0;
                    return (
                      <AssureFamilyRow
                        key={principal.id}
                        assure={principal}
                        ayantsDroit={ayantsDroit}
                        isExpanded={isExpanded}
                        hasAyantsDroit={hasAyantsDroit}
                        canEdit={canEdit}
                        deleteConfirm={deleteConfirm}
                        saving={saving}
                        onToggle={() => toggleFamily(principal.id)}
                        onEdit={openEdit}
                        onDelete={setDeleteConfirm}
                        handleDelete={handleDelete}
                      />
                    );
                  })}
                </tbody>
              </table>
              {filteredFamilies.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun bénéficiaire trouvé</p>
                </div>
              )}
              </div>
              <SharedPagination
                pagination={pagination}
                onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
                label="bénéficiaire"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Dialog : Formulaire ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAssure ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom *</Label>
                <Input value={formNom} onChange={(e) => setFormNom(e.target.value)} placeholder="Rakoto" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prénom</Label>
                <Input value={formPrenom} onChange={(e) => setFormPrenom(e.target.value)} placeholder="Jean" className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Société *</Label>
                <select value={formSocieteId} onChange={(e) => setFormSocieteId(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">-- Sélectionner --</option>
                  {societes.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type de bénéficiaire *</Label>
                <select value={formTypeBenef} onChange={(e) => setFormTypeBenef(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ASSURE">Assuré principal</option>
                  <option value="CONJOINT">Conjoint</option>
                  <option value="ENFANT">Enfant</option>
                </select>
              </div>
            </div>
            {formTypeBenef !== 'ASSURE' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Assuré principal (rattachement)</Label>
                <select value={formAssurePrincipalId} onChange={(e) => setFormAssurePrincipalId(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">-- Sélectionner --</option>
                  {principaux.filter(p => p.societe.id === formSocieteId).map((p) => (
                    <option key={p.id} value={p.id}>{p.matricule ? `[${p.matricule}] ` : ''}{p.prenom ? `${p.prenom} ` : ''}{p.nom}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Matricule</Label>
                <Input value={formMatricule} onChange={(e) => setFormMatricule(e.target.value)} placeholder="74735" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Code famille</Label>
                <Input value={formCodeFamille} onChange={(e) => setFormCodeFamille(e.target.value)} placeholder="Famille 12" className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">N° Sécurité Sociale</Label>
                <Input value={formNSS} onChange={(e) => setFormNSS(e.target.value)} placeholder="SS-123456" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date de naissance</Label>
                <Input type="date" value={formDateNaissance} onChange={(e) => setFormDateNaissance(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Genre</Label>
                <select value={formSexe} onChange={(e) => setFormSexe(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">--</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date d'effet</Label>
                <Input type="date" value={formDateEffet} onChange={(e) => setFormDateEffet(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Barème (coefficient)</Label>
                <Input type="number" step="0.1" min="0" max="1" value={formBareme} onChange={(e) => setFormBareme(e.target.value)} placeholder="0.8" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Téléphone</Label>
                <Input value={formTelephone} onChange={(e) => setFormTelephone(e.target.value)} placeholder="+261 34 00 000 00" className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="assure@email.com" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse</Label>
              <Input value={formAdresse} onChange={(e) => setFormAdresse(e.target.value)} placeholder="Antananarivo, Madagascar" className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="a-actif" checked={formActif} onChange={(e) => setFormActif(e.target.checked)} className="h-4 w-4 rounded border-border" />
              <Label htmlFor="a-actif" className="text-xs">Bénéficiaire actif</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-8 text-sm" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm" onClick={handleSave} disabled={saving || !formNom || !formSocieteId}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingAssure ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sous-composant : Ligne famille ──────────────────────────────────────────

function AssureFamilyRow({
  assure: principal,
  ayantsDroit,
  isExpanded,
  hasAyantsDroit,
  canEdit,
  deleteConfirm,
  saving,
  onToggle,
  onEdit,
  onDelete,
  handleDelete,
}: {
  assure: Assure;
  ayantsDroit: Assure[];
  isExpanded: boolean;
  hasAyantsDroit: boolean;
  canEdit: boolean;
  deleteConfirm: string | null;
  saving: boolean;
  onToggle: () => void;
  onEdit: (a: Assure) => void;
  onDelete: (id: string | null) => void;
  handleDelete: (id: string) => void;
}) {
  const age = formatAge(principal.dateNaissance);

  return (
    <>
      <tr className={cn(
        'border-b hover:bg-muted/20 transition-colors',
        hasAyantsDroit && 'cursor-pointer',
      )} onClick={hasAyantsDroit ? onToggle : undefined}>
        <td className="px-4 py-3">
          {hasAyantsDroit && (
            isExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {principal.nom[0]}{principal.prenom ? principal.prenom[0] : ''}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{principal.prenom ? `${principal.prenom} ${principal.nom}` : principal.nom}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {principal.matricule && <span className="font-mono">{principal.matricule}</span>}
                {age && <span>{age}</span>}
                {principal.dateEffet && <span className="text-emerald-600">Effet: {formatDate(principal.dateEffet)}</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <Badge className={cn('text-[10px]', TYPE_BENEF_COLORS[principal.typeBeneficiaire] || 'bg-muted text-muted-foreground')}>
            {TYPE_BENEF_LABELS[principal.typeBeneficiaire] || principal.typeBeneficiaire}
          </Badge>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <Badge variant="outline" className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            {principal.societe.nom}
          </Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell font-mono">{principal.matricule || '—'}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">{formatDate(principal.dateEffet)}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell font-mono">{principal.bareme ?? '—'}</td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="text-sm font-medium flex items-center gap-1">
            <FileText className="h-3 w-3 text-muted-foreground" />{principal._count.dossiers}
          </span>
        </td>
        <td className="px-4 py-3">
          <Badge variant={principal.actif ? 'default' : 'destructive'} className={cn('text-[11px]', principal.actif ? 'bg-emerald-600 text-white' : '')}>
            {principal.actif ? 'Actif' : 'Inactif'}
          </Badge>
        </td>
        {canEdit && (
          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(principal)}><Pencil className="h-3.5 w-3.5" /></Button>
              {deleteConfirm === principal.id ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDelete(principal.id)} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(null)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:bg-red-950/40" onClick={() => onDelete(principal.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* Ayants droit (expandables) */}
      {isExpanded && ayantsDroit.map(ad => (
        <tr key={ad.id} className="border-b last:border-0 bg-muted/10 hover:bg-muted/30 transition-colors">
          <td className="px-4 py-2.5"></td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-3 ml-4">
              <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0', TYPE_BENEF_COLORS[ad.typeBeneficiaire] || 'bg-muted')}>
                {ad.nom[0]}{ad.prenom ? ad.prenom[0] : ''}
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{ad.prenom ? `${ad.prenom} ${ad.nom}` : ad.nom}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {ad.matricule && <span className="font-mono">{ad.matricule}</span>}
                  {formatAge(ad.dateNaissance) && <span>{formatAge(ad.dateNaissance)}</span>}
                </div>
              </div>
            </div>
          </td>
          <td className="px-4 py-2.5 hidden md:table-cell">
            <Badge className={cn('text-[10px]', TYPE_BENEF_COLORS[ad.typeBeneficiaire] || 'bg-muted text-muted-foreground')}>
              {TYPE_BENEF_LABELS[ad.typeBeneficiaire] || ad.typeBeneficiaire}
            </Badge>
          </td>
          <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">—</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell font-mono">{ad.matricule || '—'}</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden xl:table-cell">{formatDate(ad.dateEffet)}</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden xl:table-cell">{ad.bareme ?? '—'}</td>
          <td className="px-4 py-2.5 hidden lg:table-cell">
            <span className="text-sm font-medium flex items-center gap-1">
              <FileText className="h-3 w-3 text-muted-foreground" />{ad._count.dossiers}
            </span>
          </td>
          <td className="px-4 py-2.5">
            <Badge variant={ad.actif ? 'default' : 'destructive'} className={cn('text-[11px]', ad.actif ? 'bg-emerald-600 text-white' : '')}>
              {ad.actif ? 'Actif' : 'Inactif'}
            </Badge>
          </td>
          {canEdit && (
            <td className="px-4 py-2.5 text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(ad)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:bg-red-950/40" onClick={() => handleDelete(ad.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
