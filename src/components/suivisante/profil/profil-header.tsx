'use client';

/**
 * Présentateur de l'en-tête du profil (refactoring P2 — extrait du monolithe
 * profil-view.tsx) : avatar courant avec initiales, nom/e-mail, badge de rôle
 * et statut, plus les détails du compte (dernière connexion, création,
 * modification, identifiant).
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, getInitials, ROLE_COLORS, AVATARS } from './types';
import type { ProfilData } from './types';

interface ProfilHeaderProps {
  profil: ProfilData;
  roleLabel: string;
}

export default function ProfilHeader({ profil, roleLabel }: ProfilHeaderProps) {
  const initials = getInitials(profil.nom);
  const currentAvatarInfo = AVATARS.find(a => a.key === profil.avatar);

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-5">
          {/* Avatar affiché */}
          <div className={cn(
            'h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ring-2 ring-offset-2 ring-offset-background',
            currentAvatarInfo ? `${currentAvatarInfo.bg} text-white ${currentAvatarInfo.ring}`
              : 'bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 ring-brand-300 dark:ring-brand-700',
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
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
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
  );
}
