'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User, Lock, Palette, Eye, EyeOff, Loader2, CheckCircle, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { ROLE_LABELS } from '@/lib/auth-context';
import type { RoleType } from '@/lib/auth-context';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfilData {
  id: string;
  email: string;
  nom: string;
  role: string;
  actif: boolean;
  avatar: string | null;
  dernierLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const AVATARS = [
  { key: 'A', label: 'Émeraude', bg: 'bg-emerald-500', ring: 'ring-emerald-300 dark:ring-emerald-700' },
  { key: 'B', label: 'Bleu',     bg: 'bg-blue-500',   ring: 'ring-blue-300 dark:ring-blue-700' },
  { key: 'C', label: 'Ambré',    bg: 'bg-amber-500',  ring: 'ring-amber-300 dark:ring-amber-700' },
  { key: 'D', label: 'Violet',   bg: 'bg-violet-500', ring: 'ring-violet-300 dark:ring-violet-700' },
  { key: 'E', label: 'Rose',     bg: 'bg-pink-500',   ring: 'ring-pink-300 dark:ring-pink-700' },
  { key: 'F', label: 'Cyan',     bg: 'bg-cyan-500',   ring: 'ring-cyan-300 dark:ring-cyan-700' },
  { key: 'G', label: 'Orange',   bg: 'bg-orange-500', ring: 'ring-orange-300 dark:ring-orange-700' },
  { key: 'H', label: 'Slate',    bg: 'bg-slate-500',  ring: 'ring-slate-300 dark:ring-slate-700' },
];

const ROLE_COLORS: Record<string, string> = {
  ADMINISTRATEUR: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  ACCUEIL: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  COMPTABILITE: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  SANTE: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  PORTEAIL_CLIENT: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  CONTACT_ENTREPRISE: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(nom: string): string {
  return nom.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ─── Composant ──────────────────────────────────────────────────────────────

export default function ProfilView() {
  const { data: session } = useSession();
  const [profil, setProfil] = useState<ProfilData | null>(null);
  const [loading, setLoading] = useState(true);

  // Mot de passe
  const [ancienMdp, setAncienMdp] = useState('');
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmMdp, setConfirmMdp] = useState('');
  const [showAncien, setShowAncien] = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);
  const [submittingMdp, setSubmittingMdp] = useState(false);

  // Avatar
  const [avatarLoading, setAvatarLoading] = useState(false);

  // ─── Fetch profil ────────────────────────────────────────────────────────

  const fetchProfil = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profil');
      if (res.status === 401) return;
      const data = await res.json();
      setProfil(data.utilisateur);
    } catch {
      toast.error('Erreur de chargement du profil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfil(); }, [fetchProfil]);

  // ─── Changement mot de passe ─────────────────────────────────────────────

  async function handleChangeMdp(e: React.FormEvent) {
    e.preventDefault();
    if (nouveauMdp !== confirmMdp) {
      toast.error('La confirmation ne correspond pas au nouveau mot de passe');
      return;
    }
    if (nouveauMdp.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setSubmittingMdp(true);
    try {
      const res = await fetch('/api/profil/changer-mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ancienMotDePasse: ancienMdp, nouveauMotDePasse: nouveauMdp }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.erreur || 'Erreur'); return; }
      toast.success('Mot de passe modifié avec succès');
      setAncienMdp(''); setNouveauMdp(''); setConfirmMdp('');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSubmittingMdp(false);
    }
  }

  // ─── Changement avatar ───────────────────────────────────────────────────

  async function handleChangeAvatar(key: string | null) {
    setAvatarLoading(true);
    try {
      const res = await fetch('/api/profil/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: key }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.erreur || 'Erreur'); return; }
      toast.success(key ? 'Avatar mis à jour' : 'Avatar supprimé');
      fetchProfil(); // rafraîchir
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setAvatarLoading(false);
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const role = (session?.user?.role as RoleType) || '';
  const roleLabel = ROLE_LABELS[role] ?? role;
  const initials = profil ? getInitials(profil.nom) : '??';
  const currentAvatar = profil?.avatar;
  const currentAvatarInfo = AVATARS.find(a => a.key === currentAvatar);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!profil) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* En-tête profil */}
      <Card className="border shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            {/* Avatar affiché */}
            <div className={cn(
              'h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ring-2 ring-offset-2 ring-offset-background',
              currentAvatarInfo ? `${currentAvatarInfo.bg} text-white ${currentAvatarInfo.ring}`
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-emerald-300 dark:ring-emerald-700',
            )}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{profil.nom}</h2>
              <p className="text-sm text-muted-foreground">{profil.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className={cn('text-[10px] font-medium', ROLE_COLORS[profil.role] || '')}>
                  {roleLabel}
                </Badge>
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                  profil.actif
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
                )}>
                  <CheckCircle className="h-2.5 w-2.5" />
                  {profil.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-6 pt-4 border-t">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Dernière connexion</p>
              <p className="text-sm mt-0.5">{formatDate(profil.dernierLogin)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Compte créé le</p>
              <p className="text-sm mt-0.5">{formatDate(profil.createdAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Dernière modification</p>
              <p className="text-sm mt-0.5">{formatDate(profil.updatedAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Identifiant</p>
              <p className="text-sm mt-0.5 font-mono text-muted-foreground">{profil.id.slice(0, 8)}...</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sélection avatar */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-violet-500" />
            Avatar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {AVATARS.map(av => (
              <button
                key={av.key}
                onClick={() => handleChangeAvatar(av.key)}
                disabled={avatarLoading}
                title={av.label}
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all cursor-pointer',
                  av.bg, 'text-white',
                  currentAvatar === av.key ? 'ring-2 ring-offset-2 ring-offset-background ' + av.ring + ' scale-110'
                    : 'opacity-60 hover:opacity-100 hover:scale-105',
                  avatarLoading && 'pointer-events-none',
                )}
              >
                {av.key}
              </button>
            ))}
            <button
              onClick={() => handleChangeAvatar(null)}
              disabled={avatarLoading}
              title="Réinitialiser l'avatar"
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all cursor-pointer',
                'bg-muted text-muted-foreground border border-dashed border-muted-foreground/30',
                !currentAvatar ? 'ring-2 ring-offset-2 ring-offset-background ring-muted-foreground' : 'hover:bg-muted/80',
                avatarLoading && 'pointer-events-none',
              )}
            >
              ✕
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Changement mot de passe */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-amber-500" />
            Changer le mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeMdp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-mdp" className="text-sm font-medium">Ancien mot de passe</Label>
              <div className="relative">
                <Input
                  id="old-mdp"
                  type={showAncien ? 'text' : 'password'}
                  placeholder="Votre mot de passe actuel"
                  value={ancienMdp}
                  onChange={e => setAncienMdp(e.target.value)}
                  required
                  className="h-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAncien(!showAncien)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAncien ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-mdp" className="text-sm font-medium">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-mdp"
                  type={showNouveau ? 'text' : 'password'}
                  placeholder="Minimum 6 caractères"
                  value={nouveauMdp}
                  onChange={e => setNouveauMdp(e.target.value)}
                  required
                  minLength={6}
                  className="h-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNouveau(!showNouveau)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNouveau ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-mdp" className="text-sm font-medium">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirm-mdp"
                type="password"
                placeholder="Retapez le nouveau mot de passe"
                value={confirmMdp}
                onChange={e => setConfirmMdp(e.target.value)}
                required
                minLength={6}
                className="h-9"
              />
              {confirmMdp && nouveauMdp !== confirmMdp && (
                <p className="text-[11px] text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={submittingMdp || !ancienMdp || !nouveauMdp || nouveauMdp !== confirmMdp}
              >
                {submittingMdp && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Mettre à jour
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
