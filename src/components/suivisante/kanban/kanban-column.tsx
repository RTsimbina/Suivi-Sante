'use client';

/**
 * Présentateur d'une colonne du Kanban (refactoring P2 — extrait du monolithe
 * kanban-view.tsx) : en-tête statut avec compteur et badge non-assignés,
 * liste triable filtrée en mode « non assignés uniquement », et squelette de
 * chargement réutilisé par la page d'assemblage.
 */
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { statutColor, statutLabel } from '../format';
import { champVersGestionnaireId } from './types';
import { SortableCard } from './kanban-cards';
import type { Dossier } from './types';

export function KanbanColumn({
  statut,
  dossiers,
  nonAssignesCount,
  showUnassigned,
}: {
  statut: string;
  dossiers: Dossier[];
  nonAssignesCount: number;
  showUnassigned: boolean;
}) {
  const displayDossiers = showUnassigned
    ? dossiers.filter((d) => !champVersGestionnaireId(statut, d))
    : dossiers;

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <Badge variant="outline" className={`${statutColor(statut)} text-xs font-medium`}>
          {statutLabel(statut)}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{displayDossiers.length}</span>
        {nonAssignesCount > 0 && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">
            {nonAssignesCount} non assigné{nonAssignesCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 rounded-xl bg-muted/40 p-2 min-h-[120px]">
        <ScrollArea className="h-[calc(100vh-18rem)]">
          <SortableContext
            items={displayDossiers.map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {displayDossiers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {showUnassigned ? 'Tous assignés' : 'Aucun dossier'}
                </p>
              ) : (
                displayDossiers.map((dossier) => (
                  <SortableCard key={dossier.id} dossier={dossier} showUnassigned={showUnassigned} />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  );
}

export function KanbanSkeleton({ statuts }: { statuts: string[] }) {
  return (
    <div className="h-full">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statuts.map((statut) => (
          <div key={statut} className="flex flex-col min-w-[280px] w-[280px] shrink-0">
            <div className="mb-3 px-1">
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <div className="flex-1 rounded-xl bg-muted/40 p-2 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
