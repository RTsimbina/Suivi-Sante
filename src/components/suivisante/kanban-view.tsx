'use client';

/**
 * Vue Kanban — page d'assemblage (refactoring P2 : le monolithe de 664 lignes
 * est découpé dans le dossier `kanban/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-kanban-board (dossiers, gestionnaires,
 *    drag & drop avec rollback) et les états d'affichage (mode non assignés,
 *    dialog d'assignation, sensors dnd) ;
 *  - affichage transverse : toolbar, squelette de chargement, DragOverlay ;
 *  - délégation : KanbanColumn, kanban-cards et AssignDialog.
 */
import { useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, UserPlus } from 'lucide-react';
import { KanbanColumn, KanbanSkeleton } from './kanban/kanban-column';
import { DragOverlayCard } from './kanban/kanban-cards';
import AssignDialog from './kanban/assign-dialog';
import { useKanbanBoard } from './kanban/use-kanban-board';
import { STATUTS_ORDER } from './kanban/types';

export default function KanbanView() {
  const board = useKanbanBoard();
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (board.loading) {
    return <KanbanSkeleton statuts={STATUTS_ORDER} />;
  }

  // ── Erreur de chargement (A-01) : distinct d'un board vide ───────────────
  if (board.erreur) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{board.erreur}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={board.fetchDossiers}>
          <RefreshCw className="h-4 w-4 mr-1" />Réessayer
        </Button>
      </div>
    );
  }

  // ── Board ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnassigned(!showUnassigned)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              showUnassigned
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Non assignés uniquement
            {board.totalNonAssignes > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {board.totalNonAssignes}
              </Badge>
            )}
          </button>
        </div>
        {board.totalNonAssignes > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAssignDialogOpen(true)}
            className="text-xs gap-1.5 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/30"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assigner en masse
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={board.handleDragStart}
        onDragEnd={board.handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUTS_ORDER.map((statut) => (
            <KanbanColumn
              key={statut}
              statut={statut}
              dossiers={board.dossiersByStatut(statut)}
              nonAssignesCount={board.nonAssignesParStatut(statut)}
              showUnassigned={showUnassigned}
            />
          ))}
        </div>

        <DragOverlay>
          {board.activeDossier ? <DragOverlayCard dossier={board.activeDossier} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Dialog d'assignation */}
      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        nonAssignes={board.nonAssignes}
        gestionnaires={board.gestionnaires}
        onAssigned={board.fetchDossiers}
      />
    </div>
  );
}
