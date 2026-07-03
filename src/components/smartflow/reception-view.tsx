'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileInput, Timer, AlertTriangle, ChevronRight, ChevronDown, Database, ArrowRight,
  Mail, Plus, Search, CheckCircle2, XCircle, Eye, Pencil, Trash2, ChevronLeft,
  FileText, Receipt, ClipboardList, Filter,
} from 'lucide-react';
import { formatMontantCourt, formatDate, statutLabel, statutColor } from './format';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceptionViewProps {
  kpis: {
    reception: { totalEnregistres: number; tempsMoyenAvantTransfert: number; enAttente: number };
  } | null;
  loading: boolean;
}

interface CourrielItem {
  id: string;
  type: string;
  expediteur: string;
  objet: string;
  societeId: string | null;
  societe: { id: string; nom: string } | null;
  beneficiaire: string | null;
  montant: number | null;
  dateCourriel: string;
  dateSoins: string | null;
  prestataire: string | null;
  statut: string;
  traitePar: string | null;
  dateTraitement: string | null;
  observations: string | null;
  dossierId: string | null;
  dossier: { id: string; numeroDossier: string } | null;
  createdAt: string;
}

interface SocieteOption {
  id: string;
  nom: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  FACTURE_PRESTATAIRE: 'Facture prestataire',
  DOSSIER_REMBOURSEMENT: 'Dossier remboursement',
};

const TYPE_COLORS: Record<string, string> = {
  FACTURE_PRESTATAIRE: 'bg-orange-50 text-orange-700 border-orange-200',
  DOSSIER_REMBOURSEMENT: 'bg-sky-50 text-sky-700 border-sky-200',
};

const COURRIEL_STATUT_COLORS: Record<string, string> = {
  RECU: 'bg-amber-50 text-amber-700 border-amber-200',
  TRAITE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJETE: 'bg-red-50 text-red-700 border-red-200',
};

const COURRIEL_STATUT_LABELS: Record<string, string> = {
  RECU: 'Reçu',
  TRAITE: 'Traité',
  REJETE: 'Rejeté',
};

const steps = [
  { title: 'Réception', desc: 'Saisie dans Excel, création ID unique', icon: FileInput, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
  { title: 'Service Technique', desc: 'Traitement via ISA', icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { title: 'Comptabilité', desc: 'Décompte Excel + Paiement SAGE', icon: ArrowRight, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  { title: 'Paiement', desc: 'Virement effectué', icon: Timer, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceptionView({ kpis, loading }: ReceptionViewProps) {
  // Courriels state
  const [courriels, setCourriels] = useState<CourrielItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
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
      params.set('limit', '20');
      if (filterType !== 'TOUS') params.set('type', filterType);
      if (filterStatut !== 'TOUS') params.set('statut', filterStatut);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/reception/courriels?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCourriels(data.courriels || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch {
      toast.error('Erreur lors du chargement des courriels.');
    } finally {
      setLoadingCourriels(false);
    }
  }, [filterType, filterStatut, searchQuery]);

  useEffect(() => {
    fetchCourriels(1);
  }, [fetchCourriels]);

  // ─── Create courriel ────────────────────────────────────────────────────
  async function handleCreate() {
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

  // ─── Open detail ────────────────────────────────────────────────────────
  function openDetail(c: CourrielItem) {
    setSelectedCourriel(c);
    setEditStatut(c.statut);
    setEditObservations(c.observations || '');
    setEditDossierId(c.dossierId || '');
    setEditMode(false);
    setDetailOpen(true);
  }

  // ─── Update courriel ────────────────────────────────────────────────────
  async function handleUpdate() {
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
  async function handleDelete() {
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

  // ─── Counts for tabs ────────────────────────────────────────────────────
  const totalReçus = courriels.length > 0 || loadingCourriels ? null : 0;

  // ─── Render: loading state ───────────────────────────────────────────────
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-sky-50"><FileInput className="h-6 w-6 text-sky-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total enregistrés</p>
              <p className="text-2xl font-bold">{kpis.reception.totalEnregistres}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50"><Timer className="h-6 w-6 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Temps moyen avant transfert</p>
              <p className="text-2xl font-bold">{kpis.reception.tempsMoyenAvantTransfert} <span className="text-sm font-normal text-muted-foreground">jours</span></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">En attente de transfert</p>
              <p className="text-2xl font-bold">{kpis.reception.enAttente}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Pipeline ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Pipeline de traitement des dossiers</CardTitle></CardHeader>
        <CardContent>
          <div className="hidden md:flex items-center justify-between gap-2">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 p-4 rounded-xl border ${step.border} ${step.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <step.icon className={`h-5 w-5 ${step.color}`} />
                    <span className="font-semibold text-sm">{step.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < steps.length - 1 && <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-center gap-2">
                <div className={`flex-1 p-4 rounded-xl border ${step.border} ${step.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <step.icon className={`h-5 w-5 ${step.color}`} />
                    <span className="font-semibold text-sm">{step.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < steps.length - 1 && <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Courriels Section ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-sky-600" />
              <CardTitle className="text-sm font-medium">Courriels</CardTitle>
              {pagination.total > 0 && (
                <Badge variant="outline" className="text-[10px] border-sky-200 text-sky-600 bg-sky-50">
                  {pagination.total}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8"
              onClick={() => { resetForm(); setCreateOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nouveau courriel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* ─── Filters ──────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par expéditeur, objet, bénéficiaire..."
                className="pl-9 h-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 w-auto min-w-[160px] text-sm">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les types</SelectItem>
                  <SelectItem value="FACTURE_PRESTATAIRE">Facture prestataire</SelectItem>
                  <SelectItem value="DOSSIER_REMBOURSEMENT">Dossier remboursement</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger className="h-9 w-auto min-w-[130px] text-sm">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les statuts</SelectItem>
                  <SelectItem value="RECU">Reçu</SelectItem>
                  <SelectItem value="TRAITE">Traité</SelectItem>
                  <SelectItem value="REJETE">Rejeté</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Table ────────────────────────────────────────────────────── */}
          {loadingCourriels ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : courriels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Mail className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Aucun courriel trouvé</p>
              <p className="text-xs mt-1">Commencez par enregistrer un nouveau courriel.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="text-xs font-semibold h-9">Type</TableHead>
                        <TableHead className="text-xs font-semibold h-9">Expéditeur</TableHead>
                        <TableHead className="text-xs font-semibold h-9">Objet</TableHead>
                        <TableHead className="text-xs font-semibold h-9 hidden md:table-cell">Société</TableHead>
                        <TableHead className="text-xs font-semibold h-9 hidden lg:table-cell">Montant</TableHead>
                        <TableHead className="text-xs font-semibold h-9">Date</TableHead>
                        <TableHead className="text-xs font-semibold h-9">Statut</TableHead>
                        <TableHead className="text-xs font-semibold h-9 w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {courriels.map((c) => (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => openDetail(c)}
                        >
                          <TableCell className="py-2.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${TYPE_COLORS[c.type] || ''}`}
                            >
                              {c.type === 'FACTURE_PRESTATAIRE' ? (
                                <Receipt className="h-3 w-3 mr-1" />
                              ) : (
                                <ClipboardList className="h-3 w-3 mr-1" />
                              )}
                              {TYPE_LABELS[c.type] || c.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5 text-sm font-medium max-w-[150px] truncate">
                            {c.expediteur}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm text-muted-foreground max-w-[200px] truncate">
                            {c.objet}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm hidden md:table-cell">
                            {c.societe?.nom || '—'}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm font-medium hidden lg:table-cell">
                            {c.montant ? formatMontantCourt(c.montant) : '—'}
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(c.dateCourriel)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${COURRIEL_STATUT_COLORS[c.statut] || ''}`}
                            >
                              {COURRIEL_STATUT_LABELS[c.statut] || c.statut}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openDetail(c); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ─── Pagination ────────────────────────────────────────────── */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    {pagination.total} courriel{pagination.total > 1 ? 's' : ''} • Page {pagination.page} sur {pagination.totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchCourriels(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchCourriels(pagination.page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Informations capturées à la réception ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Informations capturées à la réception</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Numéro dossier', value: 'DOS-2026-XXXXXX', auto: true },
              { label: 'Nom bénéficiaire', value: 'Saisie manuelle' },
              { label: 'Société', value: 'Sélection client' },
              { label: 'Date réception', value: 'Date du jour' },
              { label: 'Type de dossier', value: 'Hosp., Consult., Pharm., etc.' },
              { label: 'Source', value: 'Excel (Power Automate)' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                  {item.auto && <Badge variant="outline" className="mt-1 text-emerald-600 border-emerald-200 text-[10px]">Auto-généré par IA</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          DIALOG: Create Courriel
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-sky-600" />
              Enregistrer un courriel
            </DialogTitle>
            <DialogDescription>
              Saisissez les informations du courriel reçu au service de réception.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Type de courriel *</Label>
              <Tabs value={formType} onValueChange={setFormType} className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="FACTURE_PRESTATAIRE" className="text-xs gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    Facture prestataire
                  </TabsTrigger>
                  <TabsTrigger value="DOSSIER_REMBOURSEMENT" className="text-xs gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Dossier remboursement
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[11px] text-muted-foreground">
                {formType === 'FACTURE_PRESTATAIRE'
                  ? 'Facture d\'un prestataire de santé (clinique, pharmacie, laboratoire...) pour paiement.'
                  : 'Dossier de remboursement envoyé par un assuré ou son entreprise.'}
              </p>
            </div>

            {/* Expéditeur + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Expéditeur *</Label>
                <Input
                  placeholder={formType === 'FACTURE_PRESTATAIRE' ? 'Ex: Clinique Sainte-Marie' : 'Ex: Jean Dupont'}
                  value={formExpediteur}
                  onChange={(e) => setFormExpediteur(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Date du courriel</Label>
                <Input
                  type="date"
                  value={formDateCourriel}
                  onChange={(e) => setFormDateCourriel(e.target.value)}
                />
              </div>
            </div>

            {/* Objet */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Objet *</Label>
              <Input
                placeholder={formType === 'FACTURE_PRESTATAIRE' ? 'Ex: Facture #FAC-2026-0451' : 'Ex: Demande remboursement hospitalisation'}
                value={formObjet}
                onChange={(e) => setFormObjet(e.target.value)}
              />
            </div>

            {/* Société + Bénéficiaire (for remboursement) */}
            {formType === 'DOSSIER_REMBOURSEMENT' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Société</Label>
                  <Select value={formSocieteId} onValueChange={setFormSocieteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une société" />
                    </SelectTrigger>
                    <SelectContent>
                      {societes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Bénéficiaire</Label>
                  <Input
                    placeholder="Nom du patient / assuré"
                    value={formBeneficiaire}
                    onChange={(e) => setFormBeneficiaire(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Prestataire + Montant */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Prestataire de santé</Label>
                <Input
                  placeholder="Ex: Dr. Rakoto, Pharmacie Centrale..."
                  value={formPrestataire}
                  onChange={(e) => setFormPrestataire(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Montant (Ariary)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formMontant}
                  onChange={(e) => setFormMontant(e.target.value)}
                />
              </div>
            </div>

            {/* Date des soins */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date des soins</Label>
              <Input
                type="date"
                value={formDateSoins}
                onChange={(e) => setFormDateSoins(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCreate}
              disabled={formSubmitting || !formExpediteur.trim() || !formObjet.trim()}
            >
              {formSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          DIALOG: Detail / Edit Courriel
         ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) setEditMode(false); setDetailOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedCourriel && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-sky-600" />
                  Détails du courriel
                </DialogTitle>
                <DialogDescription>
                  Consultation et traitement du courriel entrant.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Header: Type + Statut */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={TYPE_COLORS[selectedCourriel.type] || ''}>
                    {selectedCourriel.type === 'FACTURE_PRESTATAIRE' ? (
                      <Receipt className="h-3 w-3 mr-1" />
                    ) : (
                      <ClipboardList className="h-3 w-3 mr-1" />
                    )}
                    {TYPE_LABELS[selectedCourriel.type] || selectedCourriel.type}
                  </Badge>
                  <Badge variant="outline" className={COURRIEL_STATUT_COLORS[selectedCourriel.statut] || ''}>
                    {COURRIEL_STATUT_LABELS[selectedCourriel.statut] || selectedCourriel.statut}
                  </Badge>
                  {selectedCourriel.dossier && (
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[10px]">
                      <FileText className="h-3 w-3 mr-1" />
                      {selectedCourriel.dossier.numeroDossier}
                    </Badge>
                  )}
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Expéditeur</p>
                    <p className="text-sm font-medium">{selectedCourriel.expediteur}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Date du courriel</p>
                    <p className="text-sm font-medium">{formatDate(selectedCourriel.dateCourriel)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                    <p className="text-[11px] text-muted-foreground">Objet</p>
                    <p className="text-sm font-medium">{selectedCourriel.objet}</p>
                  </div>
                  {selectedCourriel.societe && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Société</p>
                      <p className="text-sm font-medium">{selectedCourriel.societe.nom}</p>
                    </div>
                  )}
                  {selectedCourriel.beneficiaire && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Bénéficiaire</p>
                      <p className="text-sm font-medium">{selectedCourriel.beneficiaire}</p>
                    </div>
                  )}
                  {selectedCourriel.prestataire && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Prestataire</p>
                      <p className="text-sm font-medium">{selectedCourriel.prestataire}</p>
                    </div>
                  )}
                  {selectedCourriel.montant !== null && selectedCourriel.montant > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Montant</p>
                      <p className="text-sm font-bold text-emerald-700">{formatMontantCourt(selectedCourriel.montant)}</p>
                    </div>
                  )}
                  {selectedCourriel.dateSoins && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Date des soins</p>
                      <p className="text-sm font-medium">{formatDate(selectedCourriel.dateSoins)}</p>
                    </div>
                  )}
                  {selectedCourriel.traitePar && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Traité par</p>
                      <p className="text-sm font-medium">{selectedCourriel.traitePar}</p>
                    </div>
                  )}
                  {selectedCourriel.dateTraitement && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[11px] text-muted-foreground">Date de traitement</p>
                      <p className="text-sm font-medium">{formatDate(selectedCourriel.dateTraitement)}</p>
                    </div>
                  )}
                </div>

                {/* Observations */}
                {selectedCourriel.observations && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-[11px] text-muted-foreground mb-1">Observations</p>
                    <p className="text-sm">{selectedCourriel.observations}</p>
                  </div>
                )}

                {/* ─── Edit Section ─────────────────────────────────────── */}
                {editMode ? (
                  <div className="space-y-4 pt-2 border-t">
                    <p className="text-sm font-semibold text-amber-700">Mode édition</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Statut</Label>
                        <Select value={editStatut} onValueChange={setEditStatut}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RECU">Reçu</SelectItem>
                            <SelectItem value="TRAITE">Traité</SelectItem>
                            <SelectItem value="REJETE">Rejeté</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Lier à un dossier</Label>
                        <Input
                          placeholder="ID du dossier (optionnel)"
                          value={editDossierId}
                          onChange={(e) => setEditDossierId(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Observations</Label>
                      <Textarea
                        placeholder="Ajouter des observations..."
                        value={editObservations}
                        onChange={(e) => setEditObservations(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setEditMode(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => setEditMode(false)}>Annuler</Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleUpdate}
                      disabled={editSubmitting}
                    >
                      {editSubmitting ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Enregistrer
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => { setEditMode(false); setDetailOpen(false); }}>
                    Fermer
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          ALERT DIALOG: Delete Confirmation
         ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce courriel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le courriel de <strong>{selectedCourriel?.expediteur}</strong> sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}