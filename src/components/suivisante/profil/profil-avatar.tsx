'use client';

/**
 * Présentateur de la sélection d'avatar du profil (refactoring P2 — extrait
 * du monolithe profil-view.tsx) : 8 pastilles de couleur + bouton de
 * réinitialisation, désactivés pendant la requête PATCH.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AVATARS } from './types';

interface ProfilAvatarProps {
  currentAvatar: string | null;
  avatarLoading: boolean;
  onChanger: (key: string | null) => void;
}

export default function ProfilAvatar({ currentAvatar, avatarLoading, onChanger }: ProfilAvatarProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Palette className="h-4 w-4 text-accent-500" />
          Avatar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {AVATARS.map(av => (
            <button
              key={av.key}
              onClick={() => onChanger(av.key)}
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
            onClick={() => onChanger(null)}
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
  );
}
