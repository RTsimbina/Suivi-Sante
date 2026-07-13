'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Pencil, Trash2, Search, Shield, ShieldCheck,
  ShieldAlert, UserCog, UserCheck, Loader2, X, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ROLE_LABELS } from '@/lib/auth-context';
import type { RoleType } from '@/lib/auth-context';

interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: string;
  actif: boolean;
  avatar: string | null;
  dernierLogin: string | null;
  createdAt: string;
  updatedAt: string;
  nbDossiersCrees: number;
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  ADMINISTRATEUR: ShieldAlert,
  ACCUEIL: UserCog,
  TECHNIQUE: Shield,
  COMPTABILITE: ShieldCheck,
  UTILISATEUR: UserCheck,
};

const ROLE_COLORS: Record<string, string> = {
  ADMINISTRATEUR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ACCUEIL: 'bg-blue-100 text-blue-700 border-blue-200',
  TECHNIQUE: 'bg-amber-100 text-amber-700 border-amber-200',
  COMPTABILITE: 'bg-purple-100 text-purple-700 border-purple-200',
  UTILISATEUR: 'bg-gray-100 text-gray-700 border-gray-200',
};

function getInitials(nom: string): string {
  return nom.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function UsersView() {
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formNom, setFormNom] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('UTILISATEUR');
  const [formActif, setFormActif] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/utilisateurs');
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setUsers(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditingUser(null);
    setFormEmail('');
    setFormNom('');
    setFormPassword('');
    setFormRole('UTILISATEUR');
    setFormActif(true);
    setShowPassword(false);
    setDialogOpen(true);
  }

  function openEdit(user: Utilisateur) {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormNom(user.nom);
    setFormPassword('');
    setFormRole(user.role);
    setFormActif(user.actif);
    setShowPassword(false);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        email: formEmail,
        nom: formNom,
        role: formRole,
        actif: formActif,
      };
      if (formPassword) body.password = formPassword;

      if (editingUser) {
        body.id = editingUser.id;
        const res = await fetch('/api/utilisateurs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const err = await res.json();
          alert(err.erreur || 'Erreur lors de la modification');
          return;
        }
      } else {
        if (!formPassword) {
          alert('Le mot de passe est requis pour un nouvel utilisateur');
          return;
        }
        const res = await fetch('/api/utilisateurs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const err = await res.json();
          alert(err.erreur || 'Erreur lors de la création');
          return;
        }
      }

      setDialogOpen(false);
      fetchUsers();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/utilisateurs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.erreur || 'Erreur lors de la suppression');
        return;
      }
      setDeleteConfirm(null);
      fetchUsers();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter(u =>
    u.nom.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.actif).length;
  const rolesCount = new Map<string, number>();
  users.forEach(u => rolesCount.set(u.role, (rolesCount.get(u.role) || 0) + 1));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Total</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Actifs</p>
                <p className="text-2xl font-bold text-emerald-600">{activeUsers}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Inactifs</p>
                <p className="text-2xl font-bold text-red-500">{totalUsers - activeUsers}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <UserCog className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Rôles</p>
                <p className="text-2xl font-bold">{rolesCount.size}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email ou rôle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvel utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="u-nom">Nom complet</Label>
                <Input id="u-nom" value={formNom} onChange={e => setFormNom(e.target.value)} placeholder="Jean Dupont" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-email">Adresse e-mail</Label>
                <Input id="u-email" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="nom@suivisante.mg" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-password">
                  Mot de passe {editingUser && <span className="text-muted-foreground font-normal">(laisser vide pour ne pas changer)</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="u-password"
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    placeholder={editingUser ? 'Nouveau mot de passe...' : 'Minimum 8 caractères'}
                    minLength={8}
                    required={!editingUser}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-role">Rôle</Label>
                <select
                  id="u-role"
                  value={formRole}
                  onChange={e => setFormRole(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="u-actif"
                  checked={formActif}
                  onChange={e => setFormActif(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="u-actif">Compte actif</Label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {editingUser ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Liste des utilisateurs ({filtered.length})
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Utilisateur</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden md:table-cell">Rôle</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dernière connexion</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dossiers créés</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => {
                    const RoleIcon = ROLE_ICONS[user.role] || Shield;
                    return (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {getInitials(user.nom)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{user.nom}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge variant="outline" className={`${ROLE_COLORS[user.role] || ''} text-[11px]`}>
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {ROLE_LABELS[user.role as RoleType] || user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(user.dernierLogin)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-sm font-medium">{user.nbDossiersCrees}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={user.actif ? 'default' : 'destructive'} className={`text-[11px] ${user.actif ? 'bg-emerald-600 text-white' : ''}`}>
                            {user.actif ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {deleteConfirm === user.id ? (
                              <div className="flex items-center gap-1">
                                <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDelete(user.id)} disabled={saving}>
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmer'}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirm(user.id)}>
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
              {filtered.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun utilisateur trouvé</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}