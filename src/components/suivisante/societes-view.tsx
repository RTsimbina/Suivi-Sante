'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Search, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Users, FileText, DollarSign, X, Loader2, CheckCircle2,
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

export default function SocietesView() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contratsMap, setContratsMap] = useState<Record<string, { reference: string; budgetAnnuel: number; budgetUtilise: number; solde: number; statut: string; dateFin: string }[]>>({});

  // Formulaire
  const [formNom, setFormNom] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNif, setFormNif] = useState('');
  const [formContact, setFormContact] = useState('');
  const [saving, setSaving] = useState(false);

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
  const societesActives = societes.filter(s => s.actif).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
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
            <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-purple-600" />
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
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle société
        </Button>
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
          {societes.map(soc => (
            <Card key={soc.id} className={cn(!soc.actif && 'opacity-60')}>
              <CardContent className="p-0">
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
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                    <Badge variant="outline" className="text-[10px]">{soc._count.assures} assurés</Badge>
                    <Badge variant="outline" className="text-[10px]">{soc._count.dossiers} dossiers</Badge>
                    <Badge variant="outline" className="text-[10px]">{soc._count.baremes} barèmes</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(expanded === soc.id ? null : soc.id)}>
                      {expanded === soc.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(soc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setDeleteConfirm(soc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Détails étendus */}
                {expanded === soc.id && (
                  <div className="px-3 pb-3 pt-0 border-t bg-muted/10">
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
                    {/* Contrats associés et solde */}
                    {(contratsMap[soc.id] || []).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-foreground mb-2">Contrats et soldes disponibles</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="border-b">
                              <tr className="text-left">
                                <th className="py-1.5 pr-2 font-medium text-muted-foreground">Référence</th>
                                <th className="py-1.5 pr-2 font-medium text-muted-foreground text-right">Budget</th>
                                <th className="py-1.5 pr-2 font-medium text-muted-foreground text-right">Utilisé</th>
                                <th className="py-1.5 pr-2 font-medium text-muted-foreground text-right">Solde</th>
                                <th className="py-1.5 font-medium text-muted-foreground text-center">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {contratsMap[soc.id]!.map(c => (
                                <tr key={c.reference} className="border-b last:border-0">
                                  <td className="py-1.5 pr-2 font-mono">{c.reference}</td>
                                  <td className="py-1.5 pr-2 text-right">{c.budgetAnnuel.toLocaleString('fr-FR')} Ar</td>
                                  <td className="py-1.5 pr-2 text-right text-amber-600">{c.budgetUtilise.toLocaleString('fr-FR')} Ar</td>
                                  <td className={`py-1.5 pr-2 text-right font-medium ${c.solde < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{c.solde.toLocaleString('fr-FR')} Ar</td>
                                  <td className="py-1.5 text-center">
                                    <Badge variant="outline" className={`text-[9px] ${c.statut === 'ACTIF' ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : c.statut === 'EXPIRE' ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>{c.statut}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmation suppression */}
                {deleteConfirm === soc.id && (
                  <div className="px-3 pb-3 border-t bg-red-50 dark:bg-red-950/40/50">
                    <div className="flex items-center justify-between pt-3">
                      <p className="text-xs text-red-700 dark:text-red-300">
                        Supprimer {soc.nom} ? ({soc._count.dossiers} dossiers, {soc._count.assures} assurés seront affectés)
                      </p>
                      <div className="flex gap-2">
                        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(soc.id)}>
                          Confirmer
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(null)}>
                          <X className="h-3 w-3 mr-1" /> Annuler
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogue Formulaire */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la société' : 'Nouvelle société client'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom de la société *</Label>
                <Input value={formNom} onChange={e => setFormNom(e.target.value)} placeholder="Ex: TELMA" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">NIF</Label>
                <Input value={formNif} onChange={e => setFormNif(e.target.value)} placeholder="Numéro d'identification fiscale" className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse</Label>
              <Input value={formAdresse} onChange={e => setFormAdresse(e.target.value)} placeholder="Adresse physique" className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Téléphone</Label>
                <Input value={formTelephone} onChange={e => setFormTelephone(e.target.value)} placeholder="+261 34 00 000 00" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="contact@societe.mg" className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact principal</Label>
              <Input value={formContact} onChange={e => setFormContact(e.target.value)} placeholder="Nom du responsable" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="h-9 text-sm">Annuler</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formNom.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm"
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Enregistrer' : 'Créer la société'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}