'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Heart, Plus, Pencil, Trash2, Search, Loader2, X, Building2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface Societe {
  id: string;
  nom: string;
}

interface Assure {
  id: string;
  nom: string;
  prenom: string | null;
  nSS: string | null;
  dateNaissance: string | null;
  sexe: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  actif: boolean;
  societe: Societe;
  _count: { dossiers: number };
  createdAt: string;
  updatedAt: string;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

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

export default function AssuresView() {
  const [assures, setAssures] = useState<Assure[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSociete, setFilterSociete] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssure, setEditingAssure] = useState<Assure | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form
  const [formSocieteId, setFormSocieteId] = useState('');
  const [formNom, setFormNom] = useState('');
  const [formPrenom, setFormPrenom] = useState('');
  const [formNSS, setFormNSS] = useState('');
  const [formDateNaissance, setFormDateNaissance] = useState('');
  const [formSexe, setFormSexe] = useState('');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formActif, setFormActif] = useState(true);

  const fetchAssures = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSociete) params.set('societeId', filterSociete);
      const res = await fetch(`/api/assures?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setAssures(data.assures || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search, filterSociete]);

  useEffect(() => {
    fetch('/api/technique/societes')
      .then(r => r.json())
      .then(data => setSocietes(data.societes || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchAssures(); }, [fetchAssures]);

  function resetForm() {
    setFormSocieteId('');
    setFormNom('');
    setFormPrenom('');
    setFormNSS('');
    setFormDateNaissance('');
    setFormSexe('');
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
    setFormDateNaissance(a.dateNaissance ? a.dateNaissance.split('T')[0] : '');
    setFormSexe(a.sexe || '');
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
        dateNaissance: formDateNaissance || null,
        sexe: formSexe || null,
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

      if (!res.ok) {
        const err = await res.json();
        alert(err.erreur || 'Erreur');
        return;
      }

      setDialogOpen(false);
      fetchAssures();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/assures?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.erreur || 'Erreur');
        return;
      }
      setDeleteConfirm(null);
      fetchAssures();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  const totalAssures = assures.length;
  const activeAssures = assures.filter(a => a.actif).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Total assurés</p>
                <p className="text-2xl font-bold">{totalAssures}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Heart className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Actifs</p>
                <p className="text-2xl font-bold text-emerald-600">{activeAssures}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Heart className="h-5 w-5 text-emerald-600" />
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
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
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
            value={filterSociete}
            onChange={(e) => setFilterSociete(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Toutes les sociétés</option>
            {societes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvel assuré
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAssure ? "Modifier l'assuré" : 'Nouvel assuré'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="a-nom">Nom *</Label>
                  <Input id="a-nom" value={formNom} onChange={(e) => setFormNom(e.target.value)} placeholder="Rakoto" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-prenom">Prénom</Label>
                  <Input id="a-prenom" value={formPrenom} onChange={(e) => setFormPrenom(e.target.value)} placeholder="Jean" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-societe">Société *</Label>
                <select id="a-societe" value={formSocieteId} onChange={(e) => setFormSocieteId(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" required>
                  <option value="">-- Sélectionner --</option>
                  {societes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="a-nss">N° Sécurité Sociale</Label>
                  <Input id="a-nss" value={formNSS} onChange={(e) => setFormNSS(e.target.value)} placeholder="SS-123456" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-datenaiss">Date de naissance</Label>
                  <Input id="a-datenaiss" type="date" value={formDateNaissance} onChange={(e) => setFormDateNaissance(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="a-sexe">Sexe</Label>
                  <select id="a-sexe" value={formSexe} onChange={(e) => setFormSexe(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">--</option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-tel">Téléphone</Label>
                  <Input id="a-tel" value={formTelephone} onChange={(e) => setFormTelephone(e.target.value)} placeholder="+261 34 00 000 00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-email">E-mail</Label>
                <Input id="a-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="assure@email.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-adresse">Adresse</Label>
                <Input id="a-adresse" value={formAdresse} onChange={(e) => setFormAdresse(e.target.value)} placeholder="Antananarivo, Madagascar" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="a-actif" checked={formActif} onChange={(e) => setFormActif(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <Label htmlFor="a-actif">Assuré actif</Label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving || !formNom || !formSocieteId}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingAssure ? 'Enregistrer' : 'Créer'}
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
            Registre des assurés ({assures.length})
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Assuré</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden md:table-cell">Société</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">N° SS</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Téléphone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dossiers</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assures.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {a.nom[0]}{a.prenom ? a.prenom[0] : ''}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{a.prenom ? `${a.prenom} ${a.nom}` : a.nom}</p>
                            <p className="text-xs text-muted-foreground truncate">{a.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline" className="text-[11px] bg-blue-50 text-blue-700 border-blue-200">
                          {a.societe.nom}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell font-mono">{a.nSS || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{a.telephone || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          {a._count.dossiers}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={a.actif ? 'default' : 'destructive'} className={`text-[11px] ${a.actif ? 'bg-emerald-600 text-white' : ''}`}>
                          {a.actif ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {deleteConfirm === a.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDelete(a.id)} disabled={saving}>
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirm(a.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assures.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Heart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun assuré trouvé</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}