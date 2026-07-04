'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, Plus, Pencil, Trash2, Search, Loader2, X, Building2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

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
  HOPITAL: 'bg-red-100 text-red-700 border-red-200',
  CLINIQUE: 'bg-blue-100 text-blue-700 border-blue-200',
  PHARMACIE: 'bg-green-100 text-green-700 border-green-200',
  CABINET_MEDICAL: 'bg-purple-100 text-purple-700 border-purple-200',
  LABORATOIRE: 'bg-amber-100 text-amber-700 border-amber-200',
  DENTAIRE: 'bg-pink-100 text-pink-700 border-pink-200',
  OPTICIEN: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  AUTRE: 'bg-gray-100 text-gray-700 border-gray-200',
};

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

export default function PrestatairesView() {
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form
  const [formNom, setFormNom] = useState('');
  const [formType, setFormType] = useState('HOPITAL');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formNif, setFormNif] = useState('');
  const [formStatut, setFormStatut] = useState('');
  const [formRib, setFormRib] = useState('');
  const [formActif, setFormActif] = useState(true);

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

  useEffect(() => { fetchPrestataires(); }, [fetchPrestataires]);

  function resetForm() {
    setFormNom('');
    setFormType('HOPITAL');
    setFormTelephone('');
    setFormEmail('');
    setFormAdresse('');
    setFormNif('');
    setFormStatut('');
    setFormRib('');
    setFormActif(true);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(p: Prestataire) {
    setEditing(p);
    setFormNom(p.nom);
    setFormType(p.type);
    setFormTelephone(p.telephone || '');
    setFormEmail(p.email || '');
    setFormAdresse(p.adresse || '');
    setFormNif(p.nif || '');
    setFormStatut(p.statut || '');
    setFormRib(p.rib || '');
    setFormActif(p.actif);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nom: formNom,
        type: formType,
        telephone: formTelephone || null,
        email: formEmail || null,
        adresse: formAdresse || null,
        nif: formNif || null,
        statut: formStatut || null,
        rib: formRib || null,
        actif: formActif,
      };

      const method = editing ? 'PUT' : 'POST';
      if (editing) body.id = editing.id;

      const res = await fetch('/api/prestataires', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.erreur || 'Erreur');
        return;
      }

      setDialogOpen(false);
      fetchPrestataires();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/prestataires?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.erreur || 'Erreur');
        return;
      }
      setDeleteConfirm(null);
      fetchPrestataires();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  const totalPrestataires = prestataires.length;
  const activePrestataires = prestataires.filter(p => p.actif).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Total</p>
                <p className="text-2xl font-bold">{totalPrestataires}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Actifs</p>
                <p className="text-2xl font-bold text-emerald-600">{activePrestataires}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Types</p>
                <p className="text-2xl font-bold">{new Set(prestataires.map(p => p.type)).size}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Dossiers liés</p>
                <p className="text-2xl font-bold">{prestataires.reduce((s, p) => s + p._count.dossiers, 0)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau prestataire
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Modifier le prestataire' : 'Nouveau prestataire'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="p-nom">Nom *</Label>
                  <Input id="p-nom" value={formNom} onChange={(e) => setFormNom(e.target.value)} placeholder="Clinique Sainte Marie" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-type">Type *</Label>
                  <select id="p-type" value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" required>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="p-tel">Téléphone</Label>
                  <Input id="p-tel" value={formTelephone} onChange={(e) => setFormTelephone(e.target.value)} placeholder="+261 20 00 000 00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-email">E-mail</Label>
                  <Input id="p-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="contact@clinique.mg" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-adresse">Adresse</Label>
                <Input id="p-adresse" value={formAdresse} onChange={(e) => setFormAdresse(e.target.value)} placeholder="Lot XVII A, Antananarivo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="p-nif">NIF</Label>
                  <Input id="p-nif" value={formNif} onChange={(e) => setFormNif(e.target.value)} placeholder="00000000000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-statut">Statut juridique</Label>
                  <Input id="p-statut" value={formStatut} onChange={(e) => setFormStatut(e.target.value)} placeholder="SA, SARL, etc." />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-rib">RIB (Relevé d'identité bancaire)</Label>
                <Input id="p-rib" value={formRib} onChange={(e) => setFormRib(e.target.value)} placeholder="MG0000000000000000000000" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="p-actif" checked={formActif} onChange={(e) => setFormActif(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <Label htmlFor="p-actif">Prestataire actif</Label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving || !formNom}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editing ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Annuaire des prestataires ({prestataires.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Prestataire</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Téléphone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dossiers</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prestataires.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                            <Stethoscope className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.nom}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.email || p.telephone || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline" className={`text-[11px] ${TYPE_COLORS[p.type] || ''}`}>
                          {TYPE_LABELS[p.type] || p.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{p.telephone || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          {p._count.dossiers}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.actif ? 'default' : 'destructive'} className={`text-[11px] ${p.actif ? 'bg-emerald-600 text-white' : ''}`}>
                          {p.actif ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {deleteConfirm === p.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDelete(p.id)} disabled={saving}>
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirm(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {prestataires.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun prestataire trouvé</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}