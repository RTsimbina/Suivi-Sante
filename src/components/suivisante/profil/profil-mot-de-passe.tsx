'use client';

/**
 * Présentateur du changement de mot de passe du profil (refactoring P2 —
 * extrait du monolithe profil-view.tsx) : ancien/nouveau/confirmation avec
 * affichage/masquage, alerte de non-correspondance et bouton désactivé tant
 * que la politique n'est pas remplissable. La validation (motDePasseSchema)
 * reste dans le hook use-profil.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, Eye, EyeOff, Lock } from 'lucide-react';

interface ProfilMotDePasseProps {
  ancienMdp: string;
  onAncienChange: (valeur: string) => void;
  nouveauMdp: string;
  onNouveauChange: (valeur: string) => void;
  confirmMdp: string;
  onConfirmChange: (valeur: string) => void;
  submittingMdp: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ProfilMotDePasse({
  ancienMdp, onAncienChange,
  nouveauMdp, onNouveauChange,
  confirmMdp, onConfirmChange,
  submittingMdp,
  onSubmit,
}: ProfilMotDePasseProps) {
  const [showAncien, setShowAncien] = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4 text-amber-500" />
          Changer le mot de passe
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="old-mdp" className="text-sm font-medium">Ancien mot de passe</Label>
            <div className="relative">
              <Input
                id="old-mdp"
                type={showAncien ? 'text' : 'password'}
                placeholder="Votre mot de passe actuel"
                value={ancienMdp}
                onChange={e => onAncienChange(e.target.value)}
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
                onChange={e => onNouveauChange(e.target.value)}
                required
                minLength={8}
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
              onChange={e => onConfirmChange(e.target.value)}
              required
              minLength={8}
              className="h-9"
            />
            {confirmMdp && nouveauMdp !== confirmMdp && (
              <p className="text-[11px] text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white"
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
  );
}
