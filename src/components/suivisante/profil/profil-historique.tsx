'use client';

/**
 * Présentateur de l'historique des modifications du profil (refactoring P2 —
 * extrait du monolithe profil-view.tsx) : traçabilité des changements
 * (mot de passe, avatar, etc.) avec libellés de champs partagés.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAMP_LABELS, formatDate } from './types';
import type { HistoriqueEntry } from './types';

interface ProfilHistoriqueProps {
  historique: HistoriqueEntry[];
  loading: boolean;
}

export default function ProfilHistorique({ historique, loading }: ProfilHistoriqueProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-blue-500" />
          Historique des modifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de l&apos;historique...
          </div>
        ) : historique.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Aucune modification enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {historique.map(entry => (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/40 border border-border/50 text-sm"
              >
                <div className="shrink-0 mt-0.5">
                  <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                    <History className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs">
                      {CHAMP_LABELS[entry.champ] || entry.champ}
                    </span>
                    <span className="text-muted-foreground text-xs">modifié</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(entry.dateModification)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium',
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                  )}>
                    {entry.nouvelleValeur}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
