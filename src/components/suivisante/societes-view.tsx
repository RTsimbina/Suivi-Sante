'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Search, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Users, FileText, DollarSign, Loader2, CheckCircle2,
  Stethoscope, Percent, X, AlertTriangle,
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
  nom: string;
  type: string;
  telephone?: string;
  actif: boolean;
  nbDossiers: number;
  montantTotal: number;
}

interface SocieteDetails {
  baremes: BaremeDetail[];
  assures: AssureDetail[];
  prestataires: PrestataireDetail[];
}

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

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contratsMap, setContratsMap] = useState<Record<string, { reference: string; budgetAnnuel: number; budgetUtilise: number; solde: number; statut: string; dateFin: string }[]>>({});

  // Détails étendus par société
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

  // Filtres dans les sections
  const [assureSearch, setAssureSearch] = useState('');
  const [prestataireSearch, setPrestataireSearch] = useState('');
  const [baremeSearch, setBaremeSearch] = useState('');

  const fetchSocietes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/technique/societes?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setSocietes(Array.isArray(data) ? data : data.societes || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchSocietes(); }, [fetchSocietes]);

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

  // Charger les détails d'une société au dépliage
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

  function handleToggleExpand(soc: Societe) {
    const newExpanded = expanded === soc.id ? null : soc.id;
    setExpanded(newExpanded);
    if (newExpanded) {
      fetchDetails(soc.id);
    }
  }

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
      if (res.ok) { setDeleteConfirm(null); fetchSocietes(); }
    } catch { /* silent */ }
  }

  const totalDossiers = societes.reduce((s, soc) => s + soc._count.dossiers, 0);
  const totalAssures = societes.reduce((s, soc) => s + soc._count.assures, 0);
  const totalContrats = societes.reduce((s, soc) => s + soc._count.contrats, 0);
  const totalBaremes = societes.reduce((s, soc) => s + soc._count.baremes, 0);
  const societesActives = societes.filter(s => s.actif).length;

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

      {/* Liste des sociétés */}
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
        <div className="space-y-2">
          {societes.map(soc => {
            const details = detailsMap[soc.id];
            const isLoading = detailsLoading[soc.id];
            const isExpanded = expanded === soc.id;

            // Filtrage des sous-listes
            const filteredBaremes = (details?.baremes || []).filter(b =>
              !baremeSearch || b.prestation.toLowerCase().includes(baremeSearch.toLowerCase())
            );
            const filteredAssures = (details?.assures || []).filter(a => {
              const q = assureSearch.toLowerCase();
              if (!q) return true;
              return `${a.nom} ${a.prenom || ''} ${a.nSS || ''}`.toLowerCase().includes(q);
            });
            const filteredPrestataires = (details?.prestataires || []).filter(p => {
              const q = prestataireSearch.toLowerCase();
              if (!q) return true;
              return `${p.nom} ${p.type || ''}`.toLowerCase().includes(q);
            });

            return (
              <Card key={soc.id} className={cn(!soc.actif && 'opacity-60')}>
                <CardContent className="p-0">
                  {/* En-tête de la carte société */}
                  <div className="flex items-center gap-3 p-3">
                    <div className={cn(
                      'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                      soc.actif ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-muted'
                    )}>
                      <Building2 className={cn('h-5 w-5', soc.actif ? 'text-emerald-600' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{soc.nom}</p>
                        {soc.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[9px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                        {soc.telephone && <span>Tél: {soc.telephone}</span>}
                        {soc.email && <span>{soc.email}</span>}
                        {soc.nif && <span>NIF: {soc.nif}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        <Users className="h-2.5 w-2.5 mr-0.5" />{details?.assures.length ?? soc._count.assures}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        <Stethoscope className="h-2.5 w-2.5 mr-0.5" />{details?.prestataires.length ?? '...'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        <Percent className="h-2.5 w-2.5 mr-0.5" />{soc._count.baremes}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        <FileText className="h-2.5 w-2.5 mr-0.5" />{soc._count.dossiers}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleExpand(soc)}>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(soc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setDeleteConfirm(soc.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Détails étendus — 3 sections simultanées */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t bg-muted/10">
                      {/* Infos générales + Contrats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Adresse</p>
                          <p className="font-medium">{soc.adresse || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contact principal</p>
                          <p className="font-medium">{soc.contactPrincipal || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contrats</p>
                          <p className="font-medium">{soc._count.contrats}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Créée le</p>
                          <p className="font-medium">{new Date(soc.createdAt).toLocaleDateString('fr-FR')}</p>
                        </div>
                      </div>

                      {/* Contrats et soldes */}
                      {(contratsMap[soc.id] || []).length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-rose-500" />
                            Contrats et soldes
                          </p>
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-xs">
                              <thead className="border-b bg-muted/50">
                                <tr className="text-left">
                                  <th className="py-1.5 px-2 font-medium text-muted-foreground">Référence</th>
                                  <th className="py-1.5 px-2 font-medium text-muted-foreground text-right">Budget</th>
                                  <th className="py-1.5 px-2 font-medium text-muted-foreground text-right">Utilisé</th>
                                  <th className="py-1.5 px-2 font-medium text-muted-foreground text-right">Solde</th>
                                  <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {contratsMap[soc.id]!.map((c, i) => (
                                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="py-1.5 px-2 font-mono">{c.reference}</td>
                                    <td className="py-1.5 px-2 text-right">{c.budgetAnnuel.toLocaleString('fr-FR')} Ar</td>
                                    <td className="py-1.5 px-2 text-right text-amber-600">{c.budgetUtilise.toLocaleString('fr-FR')} Ar</td>
                                    <td className={cn('py-1.5 px-2 text-right font-medium', c.solde < 0 ? 'text-red-600' : 'text-emerald-600')}>{c.solde.toLocaleString('fr-FR')} Ar</td>
                                    <td className="py-1.5 px-2 text-center">
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

                      {/* Sections : Barèmes + Assurés + Prestataires simultanément */}
                      <div className="border-t mt-3 pt-3 space-y-4">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                            <span className="ml-2 text-xs text-muted-foreground">Chargement des données...</span>
                          </div>
                        ) : details ? (
                          <>
                            {/* ━━━ Section 1 : Barèmes ━━━ */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Percent className="h-3.5 w-3.5 text-emerald-500" />
                                  Barèmes
                                  <Badge variant="outline" className="text-[9px] ml-1">{details.baremes.length}</Badge>
                                </p>
                                {details.baremes.length > 3 && (
                                  <div className="relative w-48">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                      placeholder="Filtrer..."
                                      value={baremeSearch}
                                      onChange={e => setBaremeSearch(e.target.value)}
                                      className="pl-7 h-6 text-[11px]"
                                    />
                                  </div>
                                )}
                              </div>
                              {filteredBaremes.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground rounded-lg border border-dashed">
                                  <Percent className="h-6 w-6 mx-auto mb-1 opacity-30" />
                                  <p className="text-[11px]">Aucun barème configuré</p>
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border">
                                  <table className="w-full text-xs">
                                    <thead className="border-b bg-muted/50">
                                      <tr className="text-left">
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Prestation</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Taux</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-right">Plafond</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Statut</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredBaremes.map(b => (
                                        <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                                          <td className="py-1.5 px-2">
                                            <Badge className={cn('text-[10px]', PRESTATION_COLORS[b.prestation] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
                                              {b.prestation}
                                            </Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-center font-mono font-medium">{b.tauxCouverture}%</td>
                                          <td className="py-1.5 px-2 text-right font-mono">{b.plafond.toLocaleString('fr-FR')} Ar</td>
                                          <td className="py-1.5 px-2 text-center">
                                            {b.active ? (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* ━━━ Section 2 : Assurés ━━━ */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Users className="h-3.5 w-3.5 text-blue-500" />
                                  Assurés
                                  <Badge variant="outline" className="text-[9px] ml-1">{details.assures.length}</Badge>
                                </p>
                                {details.assures.length > 3 && (
                                  <div className="relative w-48">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                      placeholder="Filtrer..."
                                      value={assureSearch}
                                      onChange={e => setAssureSearch(e.target.value)}
                                      className="pl-7 h-6 text-[11px]"
                                    />
                                  </div>
                                )}
                              </div>
                              {filteredAssures.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground rounded-lg border border-dashed">
                                  <Users className="h-6 w-6 mx-auto mb-1 opacity-30" />
                                  <p className="text-[11px]">Aucun assuré trouvé</p>
                                </div>
                              ) : (
                                <div className="max-h-64 overflow-y-auto rounded-lg border">
                                  <table className="w-full text-xs">
                                    <thead className="border-b bg-muted/50 sticky top-0">
                                      <tr className="text-left">
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Nom complet</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">N° SS</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Téléphone</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Dossiers</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Statut</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredAssures.map(a => (
                                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                                          <td className="py-1.5 px-2">
                                            <div className="flex items-center gap-1.5">
                                              <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                                                <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-300">
                                                  {a.prenom?.[0]}{a.nom[0]}
                                                </span>
                                              </div>
                                              <div>
                                                <p className="font-medium">{a.prenom} {a.nom}</p>
                                                {a.email && <p className="text-[10px] text-muted-foreground">{a.email}</p>}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-2 font-mono text-muted-foreground">{a.nSS || '-'}</td>
                                          <td className="py-1.5 px-2">{a.telephone || '-'}</td>
                                          <td className="py-1.5 px-2 text-center">
                                            <Badge variant="outline" className="text-[9px]">{a._count.dossiers}</Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-center">
                                            {a.actif ? (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* ━━━ Section 3 : Prestataires ━━━ */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Stethoscope className="h-3.5 w-3.5 text-purple-500" />
                                  Prestataires
                                  <Badge variant="outline" className="text-[9px] ml-1">{details.prestataires.length}</Badge>
                                </p>
                                {details.prestataires.length > 3 && (
                                  <div className="relative w-48">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                      placeholder="Filtrer..."
                                      value={prestataireSearch}
                                      onChange={e => setPrestataireSearch(e.target.value)}
                                      className="pl-7 h-6 text-[11px]"
                                    />
                                  </div>
                                )}
                              </div>
                              {filteredPrestataires.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground rounded-lg border border-dashed">
                                  <Stethoscope className="h-6 w-6 mx-auto mb-1 opacity-30" />
                                  <p className="text-[11px]">Aucun prestataire lié</p>
                                </div>
                              ) : (
                                <div className="max-h-64 overflow-y-auto rounded-lg border">
                                  <table className="w-full text-xs">
                                    <thead className="border-b bg-muted/50 sticky top-0">
                                      <tr className="text-left">
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Prestataire</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Type</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground">Téléphone</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Dossiers</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-right">Montant total</th>
                                        <th className="py-1.5 px-2 font-medium text-muted-foreground text-center">Statut</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredPrestataires.map(p => (
                                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                                          <td className="py-1.5 px-2">
                                            <div className="flex items-center gap-1.5">
                                              <div className="h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center shrink-0">
                                                <Stethoscope className="h-3 w-3 text-purple-700 dark:text-purple-300" />
                                              </div>
                                              <p className="font-medium">{p.nom}</p>
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <Badge variant="outline" className="text-[9px]">{p.type || '-'}</Badge>
                                          </td>
                                          <td className="py-1.5 px-2">{p.telephone || '-'}</td>
                                          <td className="py-1.5 px-2 text-center">
                                            <Badge variant="outline" className="text-[9px]">{p.nbDossiers}</Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-mono font-medium">
                                            {p.montantTotal.toLocaleString('fr-FR')} Ar
                                          </td>
                                          <td className="py-1.5 px-2 text-center">
                                            {p.actif ? (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                            ) : (
                                              <X className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
