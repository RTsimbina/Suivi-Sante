'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stethoscope, Plus, Pencil, Trash2, Search, Loader2, X, Building2, FileText,
  CheckCircle2, AlertTriangle, ChevronRight, Phone, Link2, Unlink, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  HOPITAL: 'Hôpital',
  CLINIQUE: 'Clinique',
  PHARMACIE: 'Pharmacie',
  CABINET_MEDICAL: 'Cabinet médical',
  LABORATOIRE: 'Laboratoire',
  DENTAIRE: 'Dentaire',
  OPTICIEN: 'Opticien',
  AUTRE: 'Autre',
};

const TYPE_COLORS: Record<string, string> = {
  HOPITAL: 'bg-red-100 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  CLINIQUE: 'bg-blue-100 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  PHARMACIE: 'bg-green-100 text-green-700 border-green-200',
  CABINET_MEDICAL: 'bg-purple-100 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  LABORATOIRE: 'bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  DENTAIRE: 'bg-pink-100 text-pink-700 border-pink-200',
  OPTICIEN: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  AUTRE: 'bg-muted text-muted-foreground border-border',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Prestataire {
  id: string;
  nom: string;
  type: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  statut: string | null;
  rib: string | null;
  actif: boolean;
  _count: { dossiers: number };
  createdAt: string;
  updatedAt: string;
}

interface SocieteItem {
  id: string;
  nom: string;
  actif: boolean;
}

interface LienPS {
  id: string;
  prestataireId: string;
  societeId: string;
  actif: boolean;
  prestataire: { id: string; nom: string; type: string; telephone: string | null; actif: boolean };
  societe: { id: string; nom: string; actif: boolean };
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function PrestatairesView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';

  // ─── État ───────────────────────────────────────────────────────────────
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [societes, setSocietes] = useState<SocieteItem[]>([]);
  const [liens, setLiens] = useState<LienPS[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  // Sélection maître-détail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'societes' | 'info'>('societes');

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSocieteId, setLinkSocieteId] = useState('');

  // Form prestataire
  const [formNom, setFormNom] = useState('');
  const [formType, setFormType] = useState('HOPITAL');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formNif, setFormNif] = useState('');
  const [formStatut, setFormStatut] = useState('');
  const [formRib, setFormRib] = useState('');
  const [formActif, setFormActif] = useState(true);

  // ─── Fetches ────────────────────────────────────────────────────────────
  const fetchPrestataires = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/prestataires?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setPrestataires(data.prestataires || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search, filterType]);

  const fetchSocietes = useCallback(async () => {
    try {
      const res = await fetch('/api/technique/societes');
      if (res.ok) {
        const data = await res.json();
        setSocietes((Array.isArray(data) ? data : data.societes || []).map((s: { id: string; nom: string; actif: boolean }) => ({ id: s.id, nom: s.nom, actif: s.actif })));
      }
    } catch { /* silent */ }
  }, []);

  const fetchLiens = useCallback(async () => {
    try {
      const res = await fetch('/api/prestataires/societes');
      if (res.ok) {
        const data = await res.json();
        setLiens(data.liens || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchPrestataires(); }, [fetchPrestataires]);
  useEffect(() => { fetchSocietes(); fetchLiens(); }, [fetchSocietes, fetchLiens]);

  // Auto-sélection
  useEffect(() => {
    if (prestataires.length > 0 && !selectedId) {
      setSelectedId(prestataires[0].id);
    }
  }, [prestataires, selectedId]);

  // ─── Dérivés ────────────────────────────────────────────────────────────
  const selected = prestataires.find(p => p.id === selectedId);
  const selectedLiens = useMemo(() =>
    liens.filter(l => l.prestataireId === selectedId),
    [liens, selectedId]
  );

  const filteredPrestataires = useMemo(() =>
    prestataires, // already filtered by API
    [prestataires]
  );

  // Sociétés non encore liées au prestataire sélectionné
  const availableSocietes = useMemo(() => {
 const linkedIds = new Set(selectedLiens.map(l => l.societeId));
    return societes.filter(s => !linkedIds.has(s.id));
  }, [societes, selectedLiens]);

  // ─── Actions ────────────────────────────────────────────────────────────
  function resetForm() {
    setFormNom(''); setFormType('HOPITAL'); setFormTelephone('');
    setFormEmail(''); setFormAdresse(''); setFormNif('');
    setFormStatut(''); setFormRib(''); setFormActif(true);
  }

  function openCreate() {
    setEditing(null); resetForm(); setDialogOpen(true);
  }

  function openEdit(p: Prestataire) {
    setEditing(p);
    setFormNom(p.nom); setFormType(p.type);
    setFormTelephone(p.telephone || ''); setFormEmail(p.email || '');
    setFormAdresse(p.adresse || ''); setFormNif(p.nif || '');
    setFormStatut(p.statut || ''); setFormRib(p.rib || '');
    setFormActif(p.actif);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nom: formNom, type: formType,
        telephone: formTelephone || null, email: formEmail || null,
        adresse: formAdresse || null, nif: formNif || null,
        statut: formStatut || null, rib: formRib || null,
        actif: formActif,
      };
      const method = editing ? 'PUT' : 'POST';
      if (editing) body.id = editing.id;
      const res = await fetch('/api/prestataires', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); alert(err.erreur || 'Erreur'); return; }
      setDialogOpen(false); fetchPrestataires();
    } catch { alert('Erreur réseau'); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/prestataires?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); alert(err.erreur || 'Erreur'); return; }
      setDeleteConfirm(null);
      if (selectedId === id) setSelectedId(null);
      fetchPrestataires();
    } catch { alert('Erreur réseau'); } finally { setSaving(false); }
  }

  async function handleLinkSociete() {
    if (!selectedId || !linkSocieteId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/prestataires/societes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prestataireId: selectedId, societeId: linkSocieteId }),
      });
      if (res.ok) {
        setLinkDialogOpen(false); setLinkSocieteId('');
        fetchLiens();
      }
    } catch { /* silent */ } finally { setSaving(false); }
  }

  async function handleToggleActif(lienId: string, newActif: boolean) {
    try {
      const res = await fetch('/api/prestataires/societes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lienId, actif: newActif }),
      });
      if (res.ok) fetchLiens();
    } catch { /* silent */ }
  }

  async function handleUnlink(lienId: string) {
    try {
      const res = await fetch(`/api/prestataires/societes?id=${lienId}`, { method: 'DELETE' });
      if (res.ok) fetchLiens();
    } catch { /* silent */ }
  }

  // Stats
  const totalPrestataires = prestataires.length;
  const activePrestataires = prestataires.filter(p => p.actif).length;
  const totalLiens = liens.length;
  const inactifsDansSocietes = liens.filter(l => !l.actif).length;

  // ─── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center"><Stethoscope className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-lg font-bold">{totalPrestataires}</p><p className="text-[11px] text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-lg font-bold text-emerald-600">{activePrestataires}</p><p className="text-[11px] text-muted-foreground">Actifs (global)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center"><Link2 className="h-4 w-4 text-blue-600" /></div>
          <div><p className="text-lg font-bold">{totalLiens}</p><p className="text-[11px] text-muted-foreground">Liens sociétés</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-lg font-bold text-red-600">{inactifsDansSocietes}</p><p className="text-[11px] text-muted-foreground">Inactifs / société</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center"><FileText className="h-4 w-4 text-purple-600" /></div>
          <div><p className="text-lg font-bold">{prestataires.reduce((s, p) => s + p._count.dossiers, 0)}</p><p className="text-[11px] text-muted-foreground">Dossiers liés</p></div>
        </CardContent></Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9 text-sm" />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {canEdit && (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Nouveau prestataire
          </Button>
        )}
      </div>

      {/* ─── Layout maître-détail ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : prestataires.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-muted-foreground">
          <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Aucun prestataire trouvé</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── Colonne gauche : liste ─── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-1.5 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
            {filteredPrestataires.map(p => {
              const isSelected = selectedId === p.id;
              const nbSocietes = liens.filter(l => l.prestataireId === p.id).length;
              return (
                <button key={p.id} onClick={() => { setSelectedId(p.id); setActiveTab('societes'); }}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all duration-150',
                    isSelected ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm' : 'border-transparent hover:bg-muted/60 hover:border-muted'
                  )}>
                  <div className="flex items-start gap-2.5">
                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                      p.actif ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-muted'
                    )}>
                      <Stethoscope className={cn('h-4 w-4', p.actif ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn('text-sm font-medium truncate', !p.actif && 'text-muted-foreground')}>{p.nom}</p>
                        {!p.actif && <Badge variant="destructive" className="text-[8px] px-1 h-3.5">Inactif</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{TYPE_LABELS[p.type] || p.type}</span>
                        <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{nbSocietes}</span>
                        <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{p._count.dossiers}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {canEdit && (
                        <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); openEdit(p); }} onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), openEdit(p))}
                          className="p-1 rounded hover:bg-muted/80 cursor-pointer">
                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </span>
                      )}
                      <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', isSelected && 'text-emerald-600 dark:text-emerald-400 translate-x-0.5')} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ─── Colonne droite : détail ─── */
          <div className="lg:col-span-8 xl:col-span-9">
            {selected && <PrestataireDetail
              prestataire={selected}
              liens={selectedLiens}
              availableSocietes={availableSocietes}
              canEdit={canEdit}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onToggleActif={handleToggleActif}
              onUnlink={handleUnlink}
              onLinkSociete={() => setLinkDialogOpen(true)}
            />}
            {!selected && (
              <Card><CardContent className="text-center py-16 text-muted-foreground">
                <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Sélectionnez un prestataire</p>
                <p className="text-xs mt-1">Cliquez sur un prestataire pour voir ses sociétés et son statut</p>
              </CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Dialog : Créer / Modifier prestataire ─── */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
                      <Stethoscope className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold">{selected.nom}</h3>
                        <Badge variant="outline" className={cn('text-[10px]', TYPE_COLORS[selected.type])}>
                          {TYPE_LABELS[selected.type] || selected.type}
                        </Badge>
                        {selected.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif (global)
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Inactif (global)</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        {selected.telephone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selected.telephone}</span>}
                        {selected.email && <span>{selected.email}</span>}
                      </div>
                    </div>
                  </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b mb-4">
                  <button onClick={() => setActiveTab('societes')}
                    className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                      activeTab === 'societes' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}>
                    <Building2 className="h-3.5 w-3.5" /> Sociétés ({selectedLiens.length})
                  </button>
                  <button onClick={() => setActiveTab('info')}
                    className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                      activeTab === 'info' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}>
                    Informations
                  </button>
                </div>

                {/* Tab Sociétés */}
                {activeTab === 'societes' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-muted-foreground">
                        Statut par société : <span className="font-medium text-foreground">Actif</span> = prestataire autorisé,
                        <span className="font-medium text-red-600"> Inactif</span> = actes refusés automatiquement
                      </p>
                      {canEdit && availableSocietes.length > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinkDialogOpen(true)}>
                          <UserPlus className="h-3 w-3 mr-1" /> Ajouter à une société
                        </Button>
                      )}
                    </div>

                    {selectedLiens.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
                        <Unlink className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Ce prestataire n&apos;est lié à aucune société</p>
                        {canEdit && availableSocietes.length > 0 && (
                          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={() => setLinkDialogOpen(true)}>
                            <UserPlus className="h-3 w-3 mr-1" /> Lier à une société
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50">
                            <tr className="text-left">
                              <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs">Société</th>
                              <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Statut</th>
                              <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Action</th>
                              {canEdit && <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-right">Retirer</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedLiens.map(l => (
                              <tr key={l.id} className={cn('border-b last:border-0 transition-colors', !l.actif && 'bg-red-50/40 dark:bg-red-950/10')}>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 rounded-md bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                                      <Building2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-xs">{l.societe.nom}</p>
                                      {l.societe.actif && <span className="text-[10px] text-muted-foreground">Société active</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {canEdit ? (
                                    <button
                                      onClick={() => handleToggleActif(l.id, !l.actif)}
                                      className={cn(
                                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                                        l.actif
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-200'
                                          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 hover:bg-red-200'
                                      )}
                                    >
                                      {l.actif ? <><CheckCircle2 className="h-3 w-3" /> Actif</> : <><X className="h-3 w-3" /> Inactif</>}
                                    </button>
                                  ) : (
                                    l.actif
                                      ? <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif</Badge>
                                      : <Badge variant="destructive" className="text-[10px]"><X className="h-2.5 w-2.5 mr-0.5" /> Inactif</Badge>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {!l.actif && (
                                    <span className="text-[10px] text-red-500 font-medium">Actes refusés automatiquement</span>
                                  )}
                                  {l.actif && (
                                    <span className="text-[10px] text-emerald-600">Prestataire autorisé</span>
                                  )}
                                </td>
                                {canEdit && (
                                  <td className="py-2.5 px-3 text-right">
                                    <button onClick={() => handleUnlink(l.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
                                      <Unlink className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Info */}
                {activeTab === 'info' && selected && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <InfoField label="Téléphone" value={selected.telephone} />
                    <InfoField label="Email" value={selected.email} />
                    <InfoField label="NIF" value={selected.nif} />
                    <InfoField label="Statut juridique" value={selected.statut} />
                    <InfoField label="RIB" value={selected.rib} />
                    <InfoField label="Adresse" value={selected.adresse} />
                    <InfoField label="Dossiers liés" value={String(selected._count.dossiers)} />
                    <InfoField label="Créé le" value={new Date(selected.createdAt).toLocaleDateString('fr-FR')} />
                    <InfoField label="Modifié le" value={new Date(selected.updatedAt).toLocaleDateString('fr-FR')} />
                  </div>
                )}
              </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Dialog : Créer / Modifier prestataire ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier le prestataire' : 'Nouveau prestataire'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="p-nom">Nom *</Label><Input id="p-nom" value={formNom} onChange={e => setFormNom(e.target.value)} placeholder="Clinique Sainte Marie" /></div>
              <div className="space-y-2"><Label htmlFor="p-type">Type *</Label>
                <select id="p-type" value={formType} onChange={e => setFormType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="p-tel">Téléphone</Label><Input id="p-tel" value={formTelephone} onChange={e => setFormTelephone(e.target.value)} placeholder="+261 20 00 000 00" /></div>
              <div className="space-y-2"><Label htmlFor="p-email">E-mail</Label><Input id="p-email" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="contact@clinique.mg" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="p-adresse">Adresse</Label><Input id="p-adresse" value={formAdresse} onChange={e => setFormAdresse(e.target.value)} placeholder="Lot XVII A, Antananarivo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="p-nif">NIF</Label><Input id="p-nif" value={formNif} onChange={e => setFormNif(e.target.value)} placeholder="00000000000" /></div>
              <div className="space-y-2"><Label htmlFor="p-statut">Statut juridique</Label><Input id="p-statut" value={formStatut} onChange={e => setFormStatut(e.target.value)} placeholder="SA, SARL, etc." /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="p-rib">RIB</Label><Input id="p-rib" value={formRib} onChange={e => setFormRib(e.target.value)} placeholder="MG0000000000000000000000" /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="p-actif" checked={formActif} onChange={e => setFormActif(e.target.checked)} className="h-4 w-4 rounded border-border" />
              <Label htmlFor="p-actif">Prestataire actif (global)</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving || !formNom}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : Lier à une société ─── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lier à une société</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ajouter <span className="font-medium text-foreground">{selected?.nom}</span> à une société. Il sera Actif par défaut.
            </p>
            <select value={linkSocieteId} onChange={e => setLinkSocieteId(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choisir une société...</option>
              {availableSocietes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setLinkDialogOpen(false)}>Annuler</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleLinkSociete} disabled={!linkSocieteId || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Lier
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sous-composant ──────────────────────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/30">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs font-medium">{value || '—'}</p>
    </div>
  );
}
