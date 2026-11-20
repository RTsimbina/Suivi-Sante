'use client';

/**
 * Présentateur du tableau de bord KPI du Journal de Bord (refactoring P2 —
 * extrait du monolithe journal-view.tsx) : 6 cartes de statistiques.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { formatDateShort } from './types';
import type { Stats } from './types';

export default function JournalStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <Card className="border-brand-200 dark:border-brand-900">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total événements</p>
              <p className="text-xl font-bold mt-0.5">{stats.total}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-brand-600 dark:text-brand-400 uppercase tracking-wider font-medium">Créations</p>
              <p className="text-xl font-bold mt-0.5 text-brand-600 dark:text-brand-400">{stats.creations}</p>
            </div>
            <span className="text-lg">🟢</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-medium">Modifications</p>
              <p className="text-xl font-bold mt-0.5 text-amber-600 dark:text-amber-400">{stats.modifications}</p>
            </div>
            <span className="text-lg">🟡</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider font-medium">Suppressions</p>
              <p className="text-xl font-bold mt-0.5 text-red-600 dark:text-red-400">{stats.suppressions}</p>
            </div>
            <span className="text-lg">🔴</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernière modification</p>
          <p className="text-xs font-medium mt-1.5">{stats.derniereModification ? formatDateShort(stats.derniereModification) : '-'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernier administrateur</p>
          <p className="text-xs font-medium mt-1.5 truncate">{stats.dernierAdministrateur || '-'}</p>
        </CardContent>
      </Card>
    </div>
  );
}
