'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Currency,
  Plus,
  Pencil,
  Trash2,
  Upload,
  FileSpreadsheet,
  Calculator,
  Building2,
  AlertTriangle,
  CheckCircle,
  XCircle as XCircleIcon,
  ShieldAlert,
  TrendingDown,
  Filter,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';
import { formatMontant, formatMontantCourt } from './format';

interface TechniqueViewProps {
  kpis: {
    technique: { totalAnalyses: number; totalValides: number; totalRejetes: number; delaiMoyenAnalyse: number; montantTotalValide: number; enCours: number };
    productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  } | null;
  loading: boolean;
}

const PRESTATIONS = [
  'HOSPITALISATION',
  'CONSULTATION',
  'PHARMACIE',
  'MATERNITE',
  'CHIRURGIE',
  'EXAMEN',
  'SOINS DENTAIRES',
  'OPTIQUE',
] as const;

type PrestationType = (typeof PRESTATIONS)[number];

const PRESTATION_LABELS: Record<PrestationType, string> = {
  HOSPITALISATION: 'Hospitalisation',
  CONSULTATION: 'Consultation',
  PHARMACIE: 'Pharmacie',
  MATERNITE: 'Maternité',
  CHIRURGIE: 'Chirurgie',
  EXAMEN: 'Examen',
  'SOINS DENTAIRES': 'Soins Dentaires',
  OPTIQUE: 'Optique',
};

interface BaremeRow {
  prestation: PrestationType;
  tauxCouverture: number;
  plafond: number;
  description: string;
}

interface Societe {
  id: string;
  nom: string;
  baremes: BaremeRow[];
  nbDossiers?: number;
  nbBaremes?: number;
}

interface CalculResult {
  bareme: { tauxCouverture: number; plafond: number };
  montantCouvert: number;
  montantRembourse: number;
  ticketModerateur: number;
  explication: string;
}

interface ImportResult {
  nbLignes: number;
  nbSucces: number;
  nbErreurs: number;
  tauxSucces: number;
  erreurs: { ligne: number; message: string }[];
}

const emptyBaremes = (): BaremeRow[] =>
  PRESTATIONS.map((p) => ({
    prestation: p,
    tauxCouverture: 0,
    plafond: 0,
    description: '',
  }));

const kpiDefs = [
  { key: 'totalAnalyses', label: 'Dossiers analysés', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'totalValides', label: 'Validés', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'totalRejetes', label: 'Rejetés', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'enCours', label: 'En cours', icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'delaiMoyenAnalyse', label: 'Délai moyen (j)', icon: Clock, color: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'montantTotalValide', label: 'Montant validé', icon: Currency, color: 'text-emerald-600', bg: 'bg-emerald-50', format: true },
];

const PIE_COLORS = ['#f59e0b', '#10b981', '#ef4444'];

export default function TechniqueView({ kpis, loading }: TechniqueViewProps) {
  // ─── State: Sociétés & Barèmes ───
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [societesLoading, setSocietesLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSociete, setEditingSociete] = useState<Societe | null>(null);
  const [societeNom, setSocieteNom] = useState('');
  const [baremesForm, setBaremesForm] = useState<BaremeRow[]>(emptyBaremes());
  const [savingSociete, setSavingSociete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── State: Calcul Ticket Modérateur ───
  const [calcSocieteId, setCalcSocieteId] = useState('');
  const [calcPrestation, setCalcPrestation] = useState('');
  const [calcMontant, setCalcMontant] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<CalculResult | null>(null);

  // ─── State: Import ISA ───
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── State: Exclusions / Dépassements ───
  const [exclusions, setExclusions] = useState<Array<{
    id: string; numeroDossier: string; beneficiaire: string; societeNom: string;
    typeDossier: string; montantReclame: number; montantValide: number | null;
    ticketModerateur: number | null; statut: string; motifRejet: string | null;
  }>>([]);
  const [exclusionsLoading, setExclusionsLoading] = useState(false);
  const [exclusionFilter, setExclusionFilter] = useState<'all' | 'depassement' | 'exclusion' | 'rejete'>('all');

  // ─── Fetch sociétés ───
  const fetchSocietes = useCallback(async () => {
    setSocietesLoading(true);
    try {
      const res = await fetch('/api/technique/societes');
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setSocietes(Array.isArray(data) ? data : data.societes ?? []);
    } catch {
      toast.error('Impossible de charger les sociétés');
    } finally {
      setSocietesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocietes();
  }, [fetchSocietes]);

  // ─── Fetch Exclusions / Dépassements ───
  const fetchExclusions = useCallback(async () => {
    setExclusionsLoading(true);
    try {
      const res = await fetch('/api/dossiers?limit=500&statut=VALIDE,REJETE');
      if (res.ok) {
        const data = await res.json();
        const allDossiers = data.dossiers || [];
        // Identifier les dépassements (montantValide < montantReclame) et exclusions (montantValide = 0)
        const exclus = allDossiers.filter((d: { montantReclame: number; montantValide: number | null; statut: string }) =>
          d.statut === 'REJETE' ||
          (d.montantValide !== null && d.montantValide < d.montantReclame) ||
          (d.montantValide === 0 && d.montantReclame > 0)
        );
        setExclusions(exclus.map((d: { id: string; numeroDossier: string; beneficiaire: string; societe: { nom: string } | null; typeDossier: string; montantReclame: number; montantValide: number | null; ticketModerateur: number | null; statut: string; motifRejet: string | null }) => ({
          id: d.id,
          numeroDossier: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          societeNom: d.societe?.nom || '—',
          typeDossier: d.typeDossier,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          ticketModerateur: d.ticketModerateur,
          statut: d.statut,
          motifRejet: d.motifRejet,
        })));
      }
    } catch {
      // silencieux
    } finally {
      setExclusionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExclusions();
  }, [fetchExclusions]);

  // ─── Handlers: Sociétés & Barèmes ───
  const openCreateDialog = () => {
    setEditingSociete(null);
    setSocieteNom('');
    setBaremesForm(emptyBaremes());
    setDialogOpen(true);
  };

  const openEditDialog = (societe: Societe) => {
    setEditingSociete(societe);
    setSocieteNom(societe.nom);
    setBaremesForm(
      PRESTATIONS.map((p) => {
        const existing = societe.baremes?.find((b) => b.prestation === p);
        return existing ?? { prestation: p, tauxCouverture: 0, plafond: 0, description: '' };
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
      const body = { nom: societeNom.trim(), baremes: baremesForm };
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la sauvegarde');
      }
      toast.success(editingSociete ? 'Société mise à jour' : 'Société créée avec succès');
      setDialogOpen(false);
      fetchSocietes();
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

  // ─── Handlers: Calcul ───
  const handleCalculer = async () => {
    if (!calcSocieteId || !calcPrestation || !calcMontant) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    const montant = parseFloat(calcMontant);
    if (isNaN(montant) || montant <= 0) {
      toast.error('Le montant doit être un nombre positif');
      return;
    }
    setCalculating(true);
    setCalcResult(null);
    try {
      const res = await fetch('/api/technique/baremes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societeId: calcSocieteId,
          prestation: calcPrestation,
          montantReclame: montant,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur de calcul');
      }
      const data = await res.json();
      setCalcResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du calcul');
    } finally {
      setCalculating(false);
    }
  };

  // ─── Handlers: Import ISA ───
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.xlsx')) {
      setImportFile(file);
      setImportResult(null);
    } else {
      toast.error('Veuillez déposer un fichier .xlsx');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('source', 'ISA');
      const res = await fetch('/api/technique/import-isa', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur lors de l'import");
      }
      const data = await res.json();
      setImportResult(data);
      if (data.nbErreurs === 0) {
        toast.success(`Import réussi : ${data.nbSucces} lignes traitées`);
      } else {
        toast.warning(`Import partiel : ${data.nbSucces} succès, ${data.nbErreurs} erreurs`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  // ─── Render: Loading state ───
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const pieData = [
    { name: 'En cours', value: kpis.technique.enCours },
    { name: 'Validés', value: kpis.technique.totalValides },
    { name: 'Rejetés', value: kpis.technique.totalRejetes },
  ].filter((d) => d.value > 0);

  const techGestionnaires = kpis.productivite.filter((p) => p.service === 'TECHNIQUE');

  return (
    <div className="space-y-6">
      {/* ─── Section 1: KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.technique[def.key as keyof typeof kpis.technique] as number;
          const Icon = def.icon;
          return (
            <Card key={def.key}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${def.bg}`}>
                    <Icon className={`h-4 w-4 ${def.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{def.label}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {def.format ? formatMontantCourt(val) : val.toLocaleString('fr-FR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Pie Chart + Performance Table ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Répartition des statuts</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Performance gestionnaires techniques</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nom</th>
                  <th className="pb-2 font-medium text-right">Dossiers</th>
                  <th className="pb-2 font-medium text-right">Montant</th>
                  <th className="pb-2 font-medium text-right">Tps moyen (j)</th>
                </tr>
              </thead>
              <tbody>
                {techGestionnaires.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.gestionnaireNom}</td>
                    <td className="py-2 text-right">{p.nbDossiers}</td>
                    <td className="py-2 text-right">{formatMontantCourt(p.montantTraite)}</td>
                    <td className="py-2 text-right">{p.tempsMoyenTraitement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ─── Section 2: Tabs ─── */}
      <Tabs defaultValue="societes" className="w-full">
        <TabsList>
          <TabsTrigger value="societes" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Sociétés &amp; Barèmes</span>
            <span className="sm:hidden">Sociétés</span>
          </TabsTrigger>
          <TabsTrigger value="calcul" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Calcul Ticket Modérateur</span>
            <span className="sm:hidden">Calcul TM</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import ISA</span>
            <span className="sm:hidden">Import</span>
          </TabsTrigger>
          <TabsTrigger value="exclusions" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Exclusions / Dépassements</span>
            <span className="sm:hidden">Exclusions</span>
          </TabsTrigger>
        </TabsList>

        {/* ────────────────────────────────────────────────
            Tab 1: Sociétés & Barèmes
        ──────────────────────────────────────────────── */}
        <TabsContent value="societes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base font-semibold">Sociétés &amp; Barèmes</CardTitle>
              <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Ajouter une société
              </Button>
            </CardHeader>
            <CardContent>
              {societesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : societes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucune société enregistrée.</p>
                  <p className="text-xs mt-1">Cliquez sur &quot;Ajouter une société&quot; pour commencer.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead className="text-center">Nb Dossiers</TableHead>
                      <TableHead className="text-center">Nb Barèmes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {societes.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nom}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{s.nbDossiers ?? 0}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{s.nbBaremes ?? (s.baremes?.length ?? 0)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(s)}
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteSociete(s.id)}
                              disabled={deletingId === s.id}
                              title="Supprimer"
                            >
                              {deletingId === s.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ─── Create / Edit Dialog ─── */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingSociete ? 'Modifier la société' : 'Nouvelle société'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="societe-nom">Nom de la société</Label>
                  <Input
                    id="societe-nom"
                    placeholder="Ex: CNAPS, MNS, STM..."
                    value={societeNom}
                    onChange={(e) => setSocieteNom(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Barèmes par type de prestation</Label>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Prestation</TableHead>
                          <TableHead className="text-center w-[130px]">Taux (%)</TableHead>
                          <TableHead className="text-center w-[150px]">Plafond (Ar)</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {baremesForm.map((row, idx) => (
                          <TableRow key={row.prestation}>
                            <TableCell className="font-medium text-sm">
                              {PRESTATION_LABELS[row.prestation]}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                className="h-8 text-center"
                                value={row.tauxCouverture || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateBaremeField(
                                    idx,
                                    'tauxCouverture',
                                    Math.min(100, Math.max(0, Number(e.target.value) || 0))
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="h-8 text-center"
                                value={row.plafond || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateBaremeField(
                                    idx,
                                    'plafond',
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                value={row.description}
                                placeholder="Optionnel"
                                onChange={(e) =>
                                  updateBaremeField(idx, 'description', e.target.value)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSaveSociete} disabled={savingSociete} className="gap-1.5">
                  {savingSociete ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {savingSociete ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 2: Calcul Ticket Modérateur
        ──────────────────────────────────────────────── */}
        <TabsContent value="calcul">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-emerald-600" />
                  Calcul du Ticket Modérateur
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="calc-societe">Société</Label>
                  <Select value={calcSocieteId} onValueChange={setCalcSocieteId}>
                    <SelectTrigger id="calc-societe" className="w-full">
                      <SelectValue placeholder="Sélectionner une société" />
                    </SelectTrigger>
                    <SelectContent>
                      {societes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="calc-prestation">Type de prestation</Label>
                  <Select value={calcPrestation} onValueChange={setCalcPrestation}>
                    <SelectTrigger id="calc-prestation" className="w-full">
                      <SelectValue placeholder="Sélectionner un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESTATIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRESTATION_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="calc-montant">Montant réclamé (Ar)</Label>
                  <Input
                    id="calc-montant"
                    type="number"
                    min={0}
                    placeholder="Ex: 250000"
                    value={calcMontant}
                    onChange={(e) => setCalcMontant(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleCalculer}
                  disabled={calculating || !calcSocieteId || !calcPrestation || !calcMontant}
                  className="w-full gap-2"
                >
                  {calculating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                  {calculating ? 'Calcul en cours...' : 'Calculer'}
                </Button>
              </CardContent>
            </Card>

            {calcResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Résultat du calcul</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Barème appliqué</span>
                      <span className="font-medium">
                        {calcResult.bareme.tauxCouverture}% — Plafond : {formatMontant(calcResult.bareme.plafond)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Montant couvert</span>
                      <span className="font-medium">{formatMontant(calcResult.montantCouvert)}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-700 mb-1 font-medium">Montant remboursé</p>
                    <p className="text-3xl font-bold text-emerald-700">
                      {formatMontant(calcResult.montantRembourse)}
                    </p>
                  </div>

                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <p className="text-xs text-orange-700 mb-1 font-medium">Ticket modérateur</p>
                    <p className="text-3xl font-bold text-orange-700">
                      {formatMontant(calcResult.ticketModerateur)}
                    </p>
                  </div>

                  {calcResult.explication && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Explication</p>
                      <p className="text-sm text-muted-foreground">{calcResult.explication}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!calcResult && !calculating && (
              <Card className="flex items-center justify-center min-h-[200px]">
                <div className="text-center text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Remplissez le formulaire et cliquez sur &quot;Calculer&quot;</p>
                  <p className="text-xs mt-1">Le résultat s&apos;affichera ici.</p>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 3: Import ISA
        ──────────────────────────────────────────────── */}
        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                Import fichier ISA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
                  cursor-pointer transition-colors
                  ${isDragging
                    ? 'border-emerald-500 bg-emerald-50'
                    : importFile
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {importFile ? (
                  <>
                    <FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" />
                    <p className="text-sm font-medium">{importFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(importFile.size / 1024).toFixed(1)} Ko — Cliquez ou déposez pour changer
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium">
                      Glissez-déposez votre fichier <span className="text-emerald-600 font-semibold">.xlsx</span> ici
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
                  </>
                )}
              </div>

              <Button
                onClick={handleImport}
                disabled={importing || !importFile}
                className="w-full gap-2 sm:w-auto"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importing ? 'Import en cours...' : 'Importer le fichier'}
              </Button>

              {/* Results */}
              {importResult && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground">Lignes traitées</p>
                      <p className="text-2xl font-bold">{importResult.nbLignes}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-emerald-600">Succès</p>
                      <p className="text-2xl font-bold text-emerald-700">{importResult.nbSucces}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-red-500">Erreurs</p>
                      <p className="text-2xl font-bold text-red-600">{importResult.nbErreurs}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-xs text-muted-foreground">Taux de succès</p>
                      <p className="text-2xl font-bold">{importResult.tauxSucces.toFixed(1)}%</p>
                    </Card>
                  </div>

                  {importResult.erreurs && importResult.erreurs.length > 0 && (
                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <p className="text-sm font-semibold">Détail des erreurs</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {importResult.erreurs.map((err, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-sm rounded-md border border-red-100 bg-red-50 p-2"
                          >
                            <XCircleIcon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-red-700">Ligne {err.ligne} :</span>{' '}
                              <span className="text-red-600">{err.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {importResult.nbErreurs === 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm text-emerald-700 font-medium">
                        Toutes les lignes ont été importées avec succès !
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 4: Exclusions / Dépassements de plafond
        ──────────────────────────────────────────────── */}
        <TabsContent value="exclusions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                Exclusions & Dépassements de plafond
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={exclusionFilter}
                  onChange={(e) => setExclusionFilter(e.target.value as typeof exclusionFilter)}
                  className="h-8 text-xs rounded-md border bg-transparent px-2"
                >
                  <option value="all">Tous</option>
                  <option value="depassement">Dépassements</option>
                  <option value="exclusion">Exclusions totales</option>
                  <option value="rejete">Rejetés</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {exclusionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (() => {
                const filtered = exclusions.filter((d) => {
                  if (exclusionFilter === 'depassement') return d.montantValide !== null && d.montantValide > 0 && d.montantValide < d.montantReclame;
                  if (exclusionFilter === 'exclusion') return d.montantValide === 0 && d.montantReclame > 0;
                  if (exclusionFilter === 'rejete') return d.statut === 'REJETE';
                  return true;
                });

                // KPI résumé
                const totalDepassement = filtered.filter(d => d.montantValide !== null && d.montantValide > 0 && d.montantValide < d.montantReclame).length;
                const totalExclusion = filtered.filter(d => d.montantValide === 0 && d.montantReclame > 0).length;
                const totalRejete = filtered.filter(d => d.statut === 'REJETE').length;
                const montantPerdu = filtered.reduce((acc, d) => {
                  if (d.montantValide !== null) return acc + (d.montantReclame - d.montantValide);
                  return acc + d.montantReclame;
                }, 0);

                return (
                  <div className="space-y-4">
                    {/* KPI exclusions */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                        <p className="text-[10px] text-amber-600 uppercase tracking-wide font-medium">Dépassements</p>
                        <p className="text-xl font-bold text-amber-700">{totalDepassement}</p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                        <p className="text-[10px] text-red-600 uppercase tracking-wide font-medium">Exclusions totales</p>
                        <p className="text-xl font-bold text-red-700">{totalExclusion}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wide font-medium">Rejetés</p>
                        <p className="text-xl font-bold text-gray-700">{totalRejete}</p>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-center">
                        <p className="text-[10px] text-violet-600 uppercase tracking-wide font-medium">Montant non couvert</p>
                        <p className="text-xl font-bold text-violet-700">{formatMontantCourt(montantPerdu)}</p>
                      </div>
                    </div>

                    {/* Tableau */}
                    {filtered.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Aucune exclusion ou dépassement détecté.</p>
                        <p className="text-xs mt-1">Tous les dossiers validés sont dans les plafonds.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° Dossier</TableHead>
                            <TableHead>Bénéficiaire</TableHead>
                            <TableHead>Société</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Réclamé</TableHead>
                            <TableHead className="text-right">Validé</TableHead>
                            <TableHead className="text-right">Écart</TableHead>
                            <TableHead>Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.slice(0, 100).map((d) => {
                            const ecart = d.montantValide !== null ? d.montantReclame - d.montantValide : d.montantReclame;
                            const isExclusion = d.montantValide === 0 && d.montantReclame > 0;
                            const isRejete = d.statut === 'REJETE';
                            return (
                              <TableRow key={d.id} className={isExclusion ? 'bg-red-50/50' : isRejete ? 'bg-gray-50/50' : 'bg-amber-50/50'}>
                                <TableCell className="font-mono text-xs">{d.numeroDossier}</TableCell>
                                <TableCell className="text-xs">{d.beneficiaire}</TableCell>
                                <TableCell className="text-xs">{d.societeNom}</TableCell>
                                <TableCell className="text-xs">{d.typeDossier}</TableCell>
                                <TableCell className="text-right text-xs font-medium">{formatMontant(d.montantReclame)}</TableCell>
                                <TableCell className="text-right text-xs">{d.montantValide !== null ? formatMontant(d.montantValide) : '—'}</TableCell>
                                <TableCell className="text-right text-xs font-bold" style={{color: isExclusion ? '#dc2626' : '#d97706'}}>
                                  {formatMontant(ecart)}
                                </TableCell>
                                <TableCell>
                                  {isRejete ? (
                                    <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">
                                      Rejeté
                                    </Badge>
                                  ) : isExclusion ? (
                                    <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">
                                      Exclusion
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50">
                                      Dépassement
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}