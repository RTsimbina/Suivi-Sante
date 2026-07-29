'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stethoscope, Plus, Pencil, Trash2, Search, Loader2, X, Building2, FileText,
  CheckCircle2, AlertTriangle, ChevronRight, Phone, Link2, Unlink, UserPlus,
  Users, Filter, Ban, ToggleLeft, ToggleRight, Info,
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

interface SocieteItem {
  id: string;
  nom: string;
  actif: boolean;
}

interface PrestataireItem {
  id: string;
  nom: string;
  type: string;
  telephone: string | null;
  email: string | null;
  actif: boolean;
}

interface LienPS {
  id: string;
  prestataireId: string;
  societeId: string;
  actif: boolean;
  prestataire: PrestataireItem;
  societe: SocieteItem;
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function PrestatairesView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';

  // ─── État ───────────────────────────────────────────────────────────────
  const [societes, setSocietes] = useState<SocieteItem[]>([]);
  const [liens, setLiens] = useState<LienPS[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSociete, setSearchSociete] = useState('');
  const [searchPrestataire, setSearchPrestataire] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState<'' | 'actif' | 'inactif'>('');

  // Sélection maître-détail
  const [selectedSocieteId, setSelectedSocieteId] = useState<string | null>(null);

  // Dialogs
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkPrestataireId, setLinkPrestataireId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ─── Fetches ────────────────────────────────────────────────────────────
  const fetchSocietes = useCallback(async () => {
    try {
      const res = await fetch('/api/technique/societes');
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        const list = (Array.isArray(data) ? data : data.societes || []).map(
          (s: { id: string; nom: string; actif: boolean }) => ({ id: s.id, nom: s.nom, actif: s.actif })
        );
        setSocietes(list);
      }
    } catch { /* silent */ }
  }, []);

  const fetchLiens = useCallback(async () => {
    try {
      const res = await fetch('/api/prestataires/societes');
      if (res.status === 401 || res.status === 403) return;
      if (res.ok) {
        const data = await res.json();
        setLiens(data.liens || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocietes();
    fetchLiens();
  }, [fetchSocietes, fetchLiens]);

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
    const stats: Record<string, { total: number; actifs: number; inactifs: number }> = {};
    for (const l of liens) {
      if (!stats[l.societeId]) stats[l.societeId] = { total: 0, actifs: 0, inactifs: 0 };
      stats[l.societeId].total++;
      if (l.actif) stats[l.societeId].actifs++;
      else stats[l.societeId].inactifs++;
    }
    return stats;
  }, [liens]);

  // Tous les prestataires existants (pour le dialog d'ajout)
  const allPrestataires = useMemo(() => {
    const seen = new Map<string, PrestataireItem>();
    for (const l of liens) {
      if (!seen.has(l.prestataireId)) {
        seen.set(l.prestataireId, l.prestataire);
      }
    }
    return Array.from(seen.values());
  }, [liens]);

  // Prestataires disponibles à lier (pas encore liés à cette société)
  const availablePrestataires = useMemo(() => {
    const linkedIds = new Set(selectedLiens.map(l => l.prestataireId));
    return allPrestataires.filter(p => !linkedIds.has(p.id) && p.actif);
  }, [allPrestataires, selectedLiens]);

  // Stats globales
  const totalSocietesAvecPresta = Object.keys(societeStats).length;
  const totalLiens = liens.length;
  const totalActifs = liens.filter(l => l.actif).length;
  const totalInactifs = liens.filter(l => !l.actif).length;
  const totalPrestatairesUniques = allPrestataires.length;

  const selectedSociete = societes.find(s => s.id === selectedSocieteId);

  // ─── Actions ────────────────────────────────────────────────────────────
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

  // ─── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-lg font-bold">{totalSocietesAvecPresta}</p>
            <p className="text-[11px] text-muted-foreground">Sociétés liées</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-lg font-bold">{totalPrestatairesUniques}</p>
            <p className="text-[11px] text-muted-foreground">Prestataires</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            <Link2 className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-lg font-bold">{totalLiens}</p>
            <p className="text-[11px] text-muted-foreground">Total liens</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">{totalActifs}</p>
            <p className="text-[11px] text-muted-foreground">Actifs</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <Ban className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{totalInactifs}</p>
            <p className="text-[11px] text-muted-foreground">Inactifs / société</p>
          </div>
        </CardContent></Card>
      </div>

      {/* ─── Info banner ─── */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <span className="font-semibold">Statut par société :</span>{' '}
          <span className="font-medium text-emerald-700 dark:text-emerald-300">Actif</span> = le prestataire est autorisé pour cette société.{' '}
          <span className="font-medium text-red-700 dark:text-red-300">Inactif</span> = les actes de ce prestataire seront{' '}
          <span className="font-semibold">refusés automatiquement</span> pour cette société.
        </p>
      </div>

      {/* ─── Layout maître-détail ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : societes.length === 0 ? (
        <Card><CardContent className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune société enregistrée</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── Colonne gauche : liste des sociétés ─── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-2">
            {/* Recherche sociétés */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher une société..."
                value={searchSociete}
                onChange={e => setSearchSociete(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Liste des sociétés */}
            <div className="space-y-1 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
              {filteredSocietes.map(s => {
                const isSelected = selectedSocieteId === s.id;
                const stats = societeStats[s.id] || { total: 0, actifs: 0, inactifs: 0 };
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSocieteId(s.id)}
                    className={cn(
                      'w-full text-left rounded-lg border p-3 transition-all duration-150',
                      isSelected
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm'
                        : 'border-transparent hover:bg-muted/60 hover:border-muted'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center shrink-0 mt-0.5">
                        <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.nom}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Stethoscope className="h-2.5 w-2.5" />{stats.total}
                          </span>
                          {stats.actifs > 0 && (
                            <span className="text-emerald-600 font-medium">{stats.actifs} act.</span>
                          )}
                          {stats.inactifs > 0 && (
                            <span className="text-red-500 font-medium">{stats.inactifs} inact.</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1',
                        isSelected && 'text-emerald-600 dark:text-emerald-400 translate-x-0.5'
                      )} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Colonne droite : détail société ─── */}
          <div className="lg:col-span-8 xl:col-span-9">
            {selectedSociete ? (
              <Card>
                <CardContent className="p-4">
                  {/* En-tête société */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold">{selectedSociete.nom}</h3>
                          <Badge className="bg-blue-100 text-blue-700 dark:text-blue-300 text-[10px] border-blue-200 dark:border-blue-800 hover:bg-blue-100">
                            <Users className="h-2.5 w-2.5 mr-0.5" />{selectedLiens.length} prestataire{selectedLiens.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="text-emerald-600 font-medium">{selectedLiens.filter(l => l.actif).length} actif(s)</span>
                          <span>·</span>
                          <span className="text-red-500 font-medium">{selectedLiens.filter(l => !l.actif).length} inactif(s)</span>
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                        onClick={() => setLinkDialogOpen(true)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" /> Ajouter un prestataire
                      </Button>
                    )}
                  </div>

                  {/* Filtres prestataires */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un prestataire..."
                        value={searchPrestataire}
                        onChange={e => setSearchPrestataire(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="">Tous les types</option>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <select
                      value={filterStatut}
                      onChange={e => setFilterStatut(e.target.value as '' | 'actif' | 'inactif')}
                      className="h-8 rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="">Tous les statuts</option>
                      <option value="actif">Actif seulement</option>
                      <option value="inactif">Inactif seulement</option>
                    </select>
                  </div>

                  {/* Liste des prestataires */}
                  {selectedLiens.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed">
                      <Unlink className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">Aucun prestataire lié à cette société</p>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 h-7 text-xs"
                          onClick={() => setLinkDialogOpen(true)}
                        >
                          <UserPlus className="h-3 w-3 mr-1" /> Lier un prestataire
                        </Button>
                      )}
                    </div>
                  ) : filteredLiens.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
                      <Filter className="h-7 w-7 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">Aucun prestataire ne correspond à vos filtres</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-muted/50">
                          <tr className="text-left">
                            <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs">Prestataire</th>
                            <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs">Type</th>
                            <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Statut</th>
                            <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Action</th>
                            {canEdit && (
                              <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-right">Retirer</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLiens.map(l => (
                            <tr
                              key={l.id}
                              className={cn(
                                'border-b last:border-0 transition-colors',
                                !l.actif && 'bg-red-50/40 dark:bg-red-950/10'
                              )}
                            >
                              {/* Nom + contact */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={cn(
                                    'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                                    l.actif ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-muted'
                                  )}>
                                    <Stethoscope className={cn(
                                      'h-3.5 w-3.5',
                                      l.actif ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                                    )} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      'font-medium text-xs truncate',
                                      !l.actif && 'text-muted-foreground'
                                    )}>
                                      {l.prestataire.nom}
                                    </p>
                                    {l.prestataire.telephone && (
                                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                        <Phone className="h-2.5 w-2.5" />{l.prestataire.telephone}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Type */}
                              <td className="py-2.5 px-3">
                                <Badge variant="outline" className={cn('text-[10px]', TYPE_COLORS[l.prestataire.type])}>
                                  {TYPE_LABELS[l.prestataire.type] || l.prestataire.type}
                                </Badge>
                              </td>

                              {/* Statut actif/inactif */}
                              <td className="py-2.5 px-3 text-center">
                                {canEdit ? (
                                  <button
                                    onClick={() => handleToggleActif(l.id, !l.actif)}
                                    className={cn(
                                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                                      l.actif
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-950/60'
                                        : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-950/60'
                                    )}
                                  >
                                    {l.actif ? (
                                      <><ToggleRight className="h-3.5 w-3.5" /> Actif</>
                                    ) : (
                                      <><ToggleLeft className="h-3.5 w-3.5" /> Inactif</>
                                    )}
                                  </button>
                                ) : (
                                  l.actif ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100">
                                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[10px]">
                                      <Ban className="h-2.5 w-2.5 mr-0.5" /> Inactif
                                    </Badge>
                                  )
                                )}
                              </td>

                              {/* Indication action */}
                              <td className="py-2.5 px-3 text-center">
                                {!l.actif ? (
                                  <span className="text-[10px] text-red-500 font-medium flex items-center justify-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Actes refusés
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 flex items-center justify-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Autorisé
                                  </span>
                                )}
                              </td>

                              {/* Bouton retirer */}
                              {canEdit && (
                                <td className="py-2.5 px-3 text-right">
                                  {deleteConfirm === l.id ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => handleUnlink(l.id)}
                                        className="px-2 py-1 text-[10px] rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                      >
                                        Confirmer
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="px-2 py-1 text-[10px] rounded bg-muted hover:bg-muted/80 cursor-pointer"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirm(l.id)}
                                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                                    >
                                      <Unlink className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Légende */}
                  {selectedLiens.length > 0 && (
                    <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Actif = autorisé
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" /> Inactif = actes refusés automatiquement
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Sélectionnez une société</p>
                  <p className="text-xs mt-1">Cliquez sur une société pour voir ses prestataires et gérer leur statut</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Dialog : Ajouter un prestataire à la société ─── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter un prestataire</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Lier un prestataire à <span className="font-medium text-foreground">{selectedSociete?.nom}</span>.{' '}
              Il sera <span className="font-medium text-emerald-600">Actif</span> par défaut.
            </p>
            {availablePrestataires.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground rounded-lg border border-dashed">
                <Stethoscope className="h-7 w-7 mx-auto mb-1.5 opacity-20" />
                <p className="text-xs">Tous les prestataires sont déjà liés à cette société</p>
              </div>
            ) : (
              <>
                <select
                  value={linkPrestataireId}
                  onChange={e => setLinkPrestataireId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choisir un prestataire...</option>
                  {availablePrestataires.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nom} — {TYPE_LABELS[p.type] || p.type}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setLinkDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleLinkPrestataire}
                    disabled={!linkPrestataireId || saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Lier
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
