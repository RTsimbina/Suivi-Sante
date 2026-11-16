'use client';

/**
 * Présentateurs de cartes du Kanban (refactoring P2 — extraits du monolithe
 * kanban-view.tsx) : carte triable (drag natif dnd-kit, indicateur « non
 * assigné ») et carte d'aperçu pendant le déplacement (DragOverlay).
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { GripVertical } from 'lucide-react';
import { formatMontant, formatDate, typeDossierLabel } from '../format';
import { champVersGestionnaireId } from './types';
import type { Dossier } from './types';

export function SortableCard({ dossier, showUnassigned }: { dossier: Dossier; showUnassigned: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dossier.id, data: { statut: dossier.statut } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isUnassigned = showUnassigned && !champVersGestionnaireId(dossier.statut, dossier);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-3 hover:shadow-md transition bg-card cursor-grab active:cursor-grabbing ${
        isUnassigned ? 'border-amber-300 dark:border-amber-700 border-dashed' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isUnassigned && (
            <span className="shrink-0 h-2 w-2 rounded-full bg-amber-400" title="Non assigné" />
          )}
          <span className="font-mono text-xs font-medium truncate">
            {dossier.numeroDossier}
          </span>
        </div>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" {...attributes} {...listeners} />
      </div>
      <p className="text-sm font-medium truncate mb-1">{dossier.beneficiaire}</p>
      <p className="text-xs text-muted-foreground truncate mb-2">
        {dossier.societe?.nom}
      </p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
          {typeDossierLabel(dossier.typeDossier)}
        </Badge>
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {formatMontant(dossier.montantReclame)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        {formatDate(dossier.dateReception)}
      </p>
    </div>
  );
}

export function DragOverlayCard({ dossier }: { dossier: Dossier }) {
  return (
    <div className="border rounded-lg p-3 bg-card shadow-lg rotate-2 w-72">
      <p className="font-mono text-xs font-medium">{dossier.numeroDossier}</p>
      <p className="text-sm font-medium mt-1">{dossier.beneficiaire}</p>
      <p className="text-xs text-muted-foreground">{dossier.societe?.nom}</p>
    </div>
  );
}
