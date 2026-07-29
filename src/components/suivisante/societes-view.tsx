'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, Search, Plus, Pencil, Trash2, ChevronRight,
  Users, FileText, DollarSign, Loader2, CheckCircle2,
  Stethoscope, Percent, X, AlertTriangle, Phone, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Societe {
  id: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  nif?: string;
  contactPrincipal?: string;
  actif: boolean;
  createdAt: string;
  _count: { dossiers: number; contrats: number; assures: number; baremes: number };
}

interface BaremeDetail {
  id: string;
  prestation: string;
  tauxCouverture: number;
  plafond: number;
  description?: string;
  active: boolean;
}

interface AssureDetail {
  id: string;
  nom: string;
  prenom?: string;
  nSS?: string;
  telephone?: string;
  email?: string;
  actif: boolean;
  _count: { dossiers: number };
}

interface PrestataireDetail {
  id: string;
  lienId: string;
  nom: string;
  type: string;
  telephone?: string;
  actifGlobal: boolean;
  actifSociete: boolean;
  nbDossiers: number;
  montantTotal: number;
}

interface SocieteDetails {
  baremes: BaremeDetail[];
  assures: AssureDetail[];
  prestataires: PrestataireDetail[];
}

type DetailTab = 'baremes' | 'assures' | 'prestataires';

// ─── Couleurs par prestation ─────────────────────────────────────────────────

const PRESTATION_COLORS: Record<string, string> = {
  HOSPITALISATION: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  CONSULTATION: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  PHARMACIE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  MATERNITE: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  CHIRURGIE: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  EXAMEN: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  'SOINS DENTAIRES': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  OPTIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

// ─── Composant principal ────────────────────────────────────────────────────

interface Props {
  userRole?: string;
}

export default function SocietesView({ userRole }: Props) {
  const canWrite = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';

  // ─── État ───────────────────────────────────────────────────────────────
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contratsMap, setContratsMap] = useState<Record<string, { reference: string; budgetAnnuel: number; budgetUtilise: number; solde: number; statut: string; dateFin: string }[]>>({});
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
          const map: Record<string, typeof contratsMap[string]> = {};
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

  // Tabs config
  const tabs: { key: DetailTab; label: string; icon: typeof Percent; count: number }[] = [
    { key: 'baremes', label: 'Barèmes', icon: Percent, count: filteredBaremes.length },
    { key: 'assures', label: 'Assurés', icon: Users, count: filteredAssures.length },
    { key: 'prestataires', label: 'Prestataires', icon: Stethoscope, count: filteredPrestataires.length },
  ];

  // ─── Rendu ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{societes.length}</p>
              <p className="text-[11px] text-muted-foreground">Sociétés ({societesActives} actives)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalAssures}</p>
              <p className="text-[11px] text-muted-foreground">Assurés totaux</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalBaremes}</p>
              <p className="text-[11px] text-muted-foreground">Barèmes configurés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalDossiers}</p>
              <p className="text-[11px] text-muted-foreground">Dossiers totaux</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalContrats}</p>
              <p className="text-[11px] text-muted-foreground">Contrats actifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barre d'actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une société..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle société
          </Button>
        )}
      </div>

      {/* ─── Layout maître-détail ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : societes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune société trouvée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── Colonne gauche : liste des sociétés ─── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-1.5 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
            {societes.map(soc => {
              const isSelected = selectedId === soc.id;
              return (
                <button
                  key={soc.id}
                  onClick={() => { setSelectedId(soc.id); setActiveTab('baremes'); }}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all duration-150',
                    isSelected
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm'
                      : 'border-transparent hover:bg-muted/60 hover:border-muted'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                      soc.actif ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-muted'
                    )}>
                      <Building2 className={cn('h-4 w-4', soc.actif ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn('text-sm font-medium truncate', !soc.actif && 'text-muted-foreground')}>{soc.nom}</p>
                        {soc.actif ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{soc._count.assures}</span>
                        <span className="flex items-center gap-0.5"><Stethoscope className="h-2.5 w-2.5" />{detailsMap[soc.id]?.prestataires?.length ?? '...'}</span>
                        <span className="flex items-center gap-0.5"><Percent className="h-2.5 w-2.5" />{soc._count.baremes}</span>
                        <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{soc._count.dossiers}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {canWrite && (
                        <>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); openEdit(soc); }}
                            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), openEdit(soc))}
                            className="p-1 rounded hover:bg-muted/80 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(soc.id); }}
                            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), setDeleteConfirm(soc.id))}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                          </span>
                        </>
                      )}
                      <ChevronRight className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform duration-150',
                        isSelected && 'text-emerald-600 dark:text-emerald-400 translate-x-0.5'
                      )} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ─── Colonne droite : détail de la société sélectionnée ─── */}
          <div className="lg:col-span-8 xl:col-span-9">
            {!selectedSociete ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Sélectionnez une société</p>
                  <p className="text-xs mt-1">Cliquez sur une société dans la liste pour voir ses détails</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  {/* En-tête société */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold">{selectedSociete.nom}</h3>
                          {selectedSociete.actif ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          {selectedSociete.telephone && (
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedSociete.telephone}</span>
                          )}
                          {selectedSociete.email && (
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedSociete.email}</span>
                          )}
                          {selectedSociete.nif && (
                            <span>NIF: {selectedSociete.nif}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Stats rapides */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs gap-1"><Users className="h-3 w-3" />{selectedSociete._count.assures} assurés</Badge>
                      <Badge variant="outline" className="text-xs gap-1"><Percent className="h-3 w-3" />{selectedSociete._count.baremes} barèmes</Badge>
                      <Badge variant="outline" className="text-xs gap-1"><FileText className="h-3 w-3" />{selectedSociete._count.dossiers} dossiers</Badge>
                    </div>
                  </div>

                  {/* Infos générales */}
                  {selectedSociete.adresse && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg bg-muted/30 text-xs">
                      <div>
                        <p className="text-muted-foreground">Adresse</p>
                        <p className="font-medium">{selectedSociete.adresse}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Contact principal</p>
                        <p className="font-medium">{selectedSociete.contactPrincipal || '-'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Contrats</p>
                        <p className="font-medium">{selectedSociete._count.contrats}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Créée le</p>
                        <p className="font-medium">{new Date(selectedSociete.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>
                  )}

                  {/* Contrats */}
                  {(contratsMap[selectedSociete.id] || []).length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-rose-500" />
                        Contrats et soldes
                      </p>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead className="border-b bg-muted/50">
                            <tr className="text-left">
                              <th className="py-2 px-3 font-medium text-muted-foreground">Référence</th>
                              <th className="py-2 px-3 font-medium text-muted-foreground text-right">Budget</th>
                              <th className="py-2 px-3 font-medium text-muted-foreground text-right">Utilisé</th>
                              <th className="py-2 px-3 font-medium text-muted-foreground text-right">Solde</th>
                              <th className="py-2 px-3 font-medium text-muted-foreground text-center">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contratsMap[selectedSociete.id]!.map((c, i) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 px-3 font-mono">{c.reference}</td>
                                <td className="py-2 px-3 text-right">{c.budgetAnnuel.toLocaleString('fr-FR')} Ar</td>
                                <td className="py-2 px-3 text-right text-amber-600">{c.budgetUtilise.toLocaleString('fr-FR')} Ar</td>
                                <td className={cn('py-2 px-3 text-right font-medium', c.solde < 0 ? 'text-red-600' : 'text-emerald-600')}>{c.solde.toLocaleString('fr-FR')} Ar</td>
                                <td className="py-2 px-3 text-center">
                                  <Badge variant="outline" className={cn('text-[9px]',
                                    c.statut === 'ACTIF' ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                    : c.statut === 'EXPIRE' ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                                    : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                                  )}>{c.statut}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── Onglets Barèmes / Assurés / Prestataires ─── */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                      <span className="ml-2 text-xs text-muted-foreground">Chargement des données...</span>
                    </div>
                  ) : details ? (
                    <div>
                      {/* Tabs */}
                      <div className="flex items-center gap-1 border-b mb-4">
                        {tabs.map(tab => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.key;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => setActiveTab(tab.key)}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                                isActive
                                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {tab.label}
                              <Badge variant="outline" className={cn(
                                'text-[9px] ml-0.5',
                                isActive && 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                              )}>{tab.count}</Badge>
                            </button>
                          );
                        })}
                      </div>

                      {/* Contenu des onglets */}
                      {activeTab === 'baremes' && (
                        <BaremesTab baremes={filteredBaremes} search={baremeSearch} onSearchChange={setBaremeSearch} totalCount={details.baremes.length} />
                      )}
                      {activeTab === 'assures' && (
                        <AssuresTab assures={filteredAssures} search={assureSearch} onSearchChange={setAssureSearch} totalCount={details.assures.length} />
                      )}
                      {activeTab === 'prestataires' && (
                        <PrestatairesTab prestataires={filteredPrestataires} search={prestataireSearch} onSearchChange={setPrestataireSearch} totalCount={details.prestataires.length} />
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Dialog : Créer / Modifier une société ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la société' : 'Nouvelle société'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nom *</Label>
              <Input value={formNom} onChange={e => setFormNom(e.target.value)} className="h-8 text-sm" placeholder="Nom de la société" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Téléphone</Label>
                <Input value={formTelephone} onChange={e => setFormTelephone(e.target.value)} className="h-8 text-sm" placeholder="034 00 000 00" />
              </div>
              <div>
                <Label className="text-xs">NIF</Label>
                <Input value={formNif} onChange={e => setFormNif(e.target.value)} className="h-8 text-sm" placeholder="NIF" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} className="h-8 text-sm" type="email" placeholder="email@exemple.com" />
            </div>
            <div>
              <Label className="text-xs">Adresse</Label>
              <Input value={formAdresse} onChange={e => setFormAdresse(e.target.value)} className="h-8 text-sm" placeholder="Adresse" />
            </div>
            <div>
              <Label className="text-xs">Contact principal</Label>
              <Input value={formContact} onChange={e => setFormContact(e.target.value)} className="h-8 text-sm" placeholder="Nom du contact" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)} className="h-8 text-sm">Annuler</Button>
              <Button onClick={handleSave} disabled={saving || !formNom.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm">
                {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : Confirmation de suppression ─── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. La société et tous ses barèmes associés seront supprimés.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="h-8 text-sm">Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="h-8 text-sm"
            >
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sous-composant : Onglet Barèmes ──────────────────────────────────────────

function BaremesTab({ baremes, search, onSearchChange, totalCount }: {
  baremes: BaremeDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  return (
    <div>
      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par prestation..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {baremes.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Percent className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun barème configuré</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Prestation</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Taux</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-right">Plafond</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {baremes.map(b => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <Badge className={cn('text-[11px]', PRESTATION_COLORS[b.prestation] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
                      {b.prestation}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">{b.tauxCouverture}%</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.plafond.toLocaleString('fr-FR')} Ar</td>
                  <td className="py-2.5 px-3 text-center">
                    {b.active ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composant : Onglet Assurés ──────────────────────────────────────────

function AssuresTab({ assures, search, onSearchChange, totalCount }: {
  assures: AssureDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  return (
    <div>
      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par nom, N° SS..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {assures.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun assuré trouvé</p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Nom complet</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">N° SS</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Téléphone</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Dossiers</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {assures.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">
                          {a.prenom?.[0]}{a.nom[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{a.prenom} {a.nom}</p>
                        {a.email && <p className="text-[11px] text-muted-foreground">{a.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-muted-foreground text-xs">{a.nSS || '-'}</td>
                  <td className="py-2.5 px-3 text-xs">{a.telephone || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant="outline" className="text-[10px]">{a._count.dossiers}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {a.actif ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composant : Onglet Prestataires ─────────────────────────────────────

const PRESTA_TYPE_LABELS: Record<string, string> = {
  HOPITAL: 'Hôpital', CLINIQUE: 'Clinique', PHARMACIE: 'Pharmacie',
  CABINET_MEDICAL: 'Cabinet médical', LABORATOIRE: 'Laboratoire',
  DENTAIRE: 'Dentaire', OPTICIEN: 'Opticien', AUTRE: 'Autre',
};

function PrestatairesTab({ prestataires, search, onSearchChange, totalCount }: {
  prestataires: PrestataireDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  const nbActifs = prestataires.filter(p => p.actifSociete).length;
  const nbInactifs = prestataires.filter(p => !p.actifSociete).length;

  return (
    <div>
      {/* Stats rapides */}
      {prestataires.length > 0 && (
        <div className="flex items-center gap-4 mb-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="font-medium text-emerald-600">{nbActifs} actif(s)</span>
          </span>
          <span className="flex items-center gap-1">
            <X className="h-3 w-3 text-red-500" />
            <span className="font-medium text-red-600">{nbInactifs} inactif(s) — actes refusés automatiquement</span>
          </span>
        </div>
      )}

      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par nom, type..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {prestataires.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun prestataire lié à cette société</p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Prestataire</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Téléphone</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Dossiers</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-right">Montant total</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut société</th>
              </tr>
            </thead>
            <tbody>
              {prestataires.map(p => (
                <tr key={p.lienId} className={cn(
                  'border-b last:border-0 transition-colors',
                  !p.actifSociete && 'bg-red-50/40 dark:bg-red-950/10'
                )}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                        p.actifSociete ? 'bg-purple-100 dark:bg-purple-950/40' : 'bg-muted'
                      )}>
                        <Stethoscope className={cn(
                          'h-4 w-4',
                          p.actifSociete ? 'text-purple-700 dark:text-purple-300' : 'text-muted-foreground'
                        )} />
                      </div>
                      <div>
                        <p className={cn('font-medium text-xs', !p.actifSociete && 'text-muted-foreground')}>{p.nom}</p>
                        {!p.actifGlobal && (
                          <p className="text-[9px] text-amber-600">Inactif (global)</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="text-[10px]">
                      {PRESTA_TYPE_LABELS[p.type] || p.type || '-'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-xs">{p.telephone || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant="outline" className="text-[10px]">{p.nbDossiers}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">
                    {p.montantTotal.toLocaleString('fr-FR')} Ar
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {p.actifSociete ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" /> Inactif
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
