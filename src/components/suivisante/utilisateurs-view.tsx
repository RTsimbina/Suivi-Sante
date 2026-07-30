'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Pencil, Trash2, Search, Loader2, X, Shield, Eye, EyeOff,
  CheckCircle, XCircle, UserCog, Lock, Unlock, AlertTriangle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: string;
  roleLabel: string;
  actif: boolean;
  avatar: string | null;
  dernierLogin: string | null;
  failedAttempts: number | null;
  lockoutUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  email: string;
  nom: string;
  password: string;
  role: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'ADMINISTRATEUR', label: 'Administrateur', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { value: 'ACCUEIL', label: 'Accueil', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { value: 'TECHNIQUE', label: 'Service Technique', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { value: 'COMPTABILITE', label: 'Comptabilite', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  { value: 'SANTE', label: 'Controle Sante', color: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { value: 'PORTEAIL_CLIENT', label: 'Portail Client', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { value: 'CONTACT_ENTREPRISE', label: 'Contact Entreprise', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
];

const EMPTY_FORM: FormData = { email: '', nom: '', password: '', role: 'ACCUEIL' };

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function UtilisateursView() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtreRole, setFiltreRole] = useState('');
  const [filtreActif, setFiltreActif] = useState('');

  // Dialog etat
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Suppression
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchUtilisateurs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filtreRole) params.set('role', filtreRole);
      if (filtreActif !== '') params.set('actif', filtreActif);

      const res = await fetch(`/api/utilisateurs?${params.toString()}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setUtilisateurs(data.utilisateurs || []);
    } catch {
      toast.error('Erreur de chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [search, filtreRole, filtreActif]);

  useEffect(() => { fetchUtilisateurs(); }, [fetchUtilisateurs]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openCreateDialog() {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowPassword(false);
    setDialogOpen(true);
  }

  function openEditDialog(user: Utilisateur) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      nom: user.nom,
      password: '',
      role: user.role,
    });
    setShowPassword(false);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const isEdit = !!editingUser;
      const url = '/api/utilisateurs';
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        email: formData.email,
        nom: formData.nom,
        role: formData.role,
      };

      if (isEdit) {
        body.id = editingUser.id;
        if (formData.password) body.password = formData.password;
      } else {
        body.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.erreur || 'Erreur lors de l\'operation');
        return;
      }

      toast.success(data.message || (isEdit ? 'Utilisateur modifie.' : 'Utilisateur cree.'));
      setDialogOpen(false);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActif(user: Utilisateur) {
    const newActif = !user.actif;
    const action = newActif ? 'activer' : 'desactiver';

    try {
      const res = await fetch('/api/utilisateurs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, actif: newActif }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.erreur || `Erreur lors de l'${action}ion`);
        return;
      }
      toast.success(data.message || `Utilisateur ${action}.`);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/utilisateurs?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.erreur || 'Erreur lors de la suppression');
        return;
      }
      toast.success(data.message || 'Utilisateur supprime.');
      setDeleteConfirm(null);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setDeleting(false);
    }
  }

  // ─── Stats rapides ────────────────────────────────────────────────────────

  const totalUsers = utilisateurs.length;
  const actifs = utilisateurs.filter(u => u.actif).length;
  const inactifs = totalUsers - actifs;
  const lockedUsers = utilisateurs.filter(
    u => u.lockoutUntil && new Date(u.lockoutUntil) > new Date()
  ).length;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{totalUsers}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Total comptes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{actifs}</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400">Actifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{inactifs}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Inactifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{lockedUsers}</p>
                <p className="text-[10px] text-red-600 dark:text-red-400">Verrouilles</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barre de filtres + bouton creation */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou e-mail..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={filtreRole} onValueChange={v => setFiltreRole(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm w-full md:w-44">
                <SelectValue placeholder="Tous les roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les roles</SelectItem>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtreActif} onValueChange={v => setFiltreActif(v)}>
              <SelectTrigger className="h-9 text-sm w-full md:w-32">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous</SelectItem>
                <SelectItem value="true">Actif</SelectItem>
                <SelectItem value="false">Inactif</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreateDialog} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm shrink-0">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nouvel utilisateur
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : utilisateurs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Aucun utilisateur trouve</p>
              <p className="text-xs mt-1">Modifiez les filtres ou creez un nouvel utilisateur</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Utilisateur</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Role</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Statut</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">Derniere connexion</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase hidden lg:table-cell">Cree le</th>
                    <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {utilisateurs.map(user => {
                    const isLocked = user.lockoutUntil && new Date(user.lockoutUntil) > new Date();
                    const roleInfo = ROLES.find(r => r.value === user.role);
                    return (
                      <tr key={user.id} className={cn(
                        'hover:bg-muted/20 transition-colors',
                        !user.actif && 'opacity-60'
                      )}>
                        {/* Nom + email */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                              user.actif ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                       : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            )}>
                              {user.nom.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{user.nom}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-2.5 px-3">
                          <Badge className={cn('text-[10px] font-medium', roleInfo?.color || '')}>
                            {user.roleLabel}
                          </Badge>
                          {isLocked && (
                            <Badge className="ml-1 text-[10px] bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> Verrouille
                            </Badge>
                          )}
                        </td>

                        {/* Statut */}
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => toggleActif(user)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                              user.actif
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60'
                            )}
                            title={user.actif ? 'Cliquer pour desactiver' : 'Cliquer pour activer'}
                          >
                            {user.actif ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {user.actif ? 'Actif' : 'Inactif'}
                          </button>
                        </td>

                        {/* Derniere connexion */}
                        <td className="py-2.5 px-3 text-xs text-muted-foreground hidden md:table-cell">
                          {user.dernierLogin || 'Jamais'}
                        </td>

                        {/* Cree le */}
                        <td className="py-2.5 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(user.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                              onClick={() => openEditDialog(user)}
                              title="Modifier"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {deleteConfirm === user.id ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-[10px] px-2"
                                  onClick={() => handleDelete(user.id)}
                                  disabled={deleting}
                                >
                                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setDeleteConfirm(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                onClick={() => setDeleteConfirm(user.id)}
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Creation / Modification */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? (
                <><Pencil className="h-4 w-4 text-emerald-600" /> Modifier l'utilisateur</>
              ) : (
                <><UserCog className="h-4 w-4 text-emerald-600" /> Nouvel utilisateur</>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom */}
            <div className="space-y-1.5">
              <Label htmlFor="user-nom" className="text-sm font-medium">Nom complet</Label>
              <Input
                id="user-nom"
                placeholder="Ex: Jean Dupont"
                value={formData.nom}
                onChange={e => setFormData(f => ({ ...f, nom: e.target.value }))}
                required
                className="h-9"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="user-email" className="text-sm font-medium">Adresse e-mail</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="nom@suivisante.mg"
                value={formData.email}
                onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                required
                className="h-9"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="user-role" className="text-sm font-medium">Role</Label>
              <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir un role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn('inline-block h-2 w-2 rounded-full', r.value === 'ADMINISTRATEUR' ? 'bg-red-500' : r.value === 'ACCUEIL' ? 'bg-blue-500' : r.value === 'TECHNIQUE' ? 'bg-amber-500' : r.value === 'COMPTABILITE' ? 'bg-green-500' : r.value === 'SANTE' ? 'bg-teal-500' : r.value === 'PORTEAIL_CLIENT' ? 'bg-violet-500' : 'bg-indigo-500')} />
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.role === 'PORTEAIL_CLIENT' && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  L'e-mail doit correspondre a un assure existant dans la base.
                </p>
              )}
              {formData.role === 'CONTACT_ENTREPRISE' && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  L'e-mail doit correspondre a un contact d'entreprise existant.
                </p>
              )}
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <Label htmlFor="user-password" className="text-sm font-medium">
                Mot de passe {editingUser && <span className="text-muted-foreground font-normal">(laisser vide pour ne pas modifier)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={editingUser ? 'Nouveau mot de passe (optionnel)' : 'Minimum 6 caracteres'}
                  value={formData.password}
                  onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                  required={!editingUser}
                  minLength={6}
                  className="h-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={submitting}>
                {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editingUser ? 'Enregistrer' : 'Creer l\'utilisateur'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
