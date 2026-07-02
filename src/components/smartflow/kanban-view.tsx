'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { statutColor, statutLabel, formatMontant, formatDate, typeDossierLabel } from './format';
import { GripVertical } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Dossier {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  typeDossier: string;
  statut: string;
  montantReclame: number;
  societe: { nom: string };
}

const STATUTS_ORDER = [
  'RECU',
  'EN_ANALYSE',
  'VALIDE',
  'EN_COMPTABILITE',
  'EN_PAIEMENT',
  'PAYE',
  'REJETE',
] as const;

// ── Sortable Card ────────────────────────────────────────────────────────────

function SortableCard({ dossier }: { dossier: Dossier }) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 hover:shadow-md transition bg-white cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <span className="font-mono text-xs font-medium truncate">
          {dossier.numeroDossier}
        </span>
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
        <span className="text-xs font-semibold text-emerald-700">
          {formatMontant(dossier.montantReclame)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        {formatDate(dossier.dateReception)}
      </p>
    </div>
  );
}

// ── Drag Overlay Card ────────────────────────────────────────────────────────

function DragOverlayCard({ dossier }: { dossier: Dossier }) {
  return (
    <div className="border rounded-lg p-3 bg-white shadow-lg rotate-2 w-72">
      <p className="font-mono text-xs font-medium">{dossier.numeroDossier}</p>
      <p className="text-sm font-medium mt-1">{dossier.beneficiaire}</p>
      <p className="text-xs text-muted-foreground">{dossier.societe?.nom}</p>
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  statut,
  dossiers,
}: {
  statut: string;
  dossiers: Dossier[];
}) {
  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <Badge variant="outline" className={`${statutColor(statut)} text-xs font-medium`}>
          {statutLabel(statut)}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{dossiers.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 rounded-xl bg-muted/40 p-2 min-h-[120px]">
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <SortableContext
            items={dossiers.map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {dossiers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Aucun dossier
                </p>
              ) : (
                dossiers.map((dossier) => (
                  <SortableCard key={dossier.id} dossier={dossier} />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────────────────────────

export default function KanbanView() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchDossiers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      const res = await fetch(`/api/dossiers?${params}`);
      const data = await res.json();
      setDossiers(data.dossiers || []);
    } catch {
      setDossiers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDossiers();
  }, [fetchDossiers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const dossiersByStatut = useCallback(
    (statut: string) => dossiers.filter((d) => d.statut === statut),
    [dossiers]
  );

  const activeDossier = activeId ? dossiers.find((d) => d.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedDossier = dossiers.find((d) => d.id === active.id);
    if (!draggedDossier) return;

    // Determine target statut: if dropped over another card, use that card's statut
    let targetStatut: string | undefined;

    const overDossier = dossiers.find((d) => d.id === over.id);
    if (overDossier) {
      targetStatut = overDossier.statut;
    }

    // Also check if dropped over a column (statut string as ID)
    if (!targetStatut && typeof over.id === 'string' && STATUTS_ORDER.includes(over.id as typeof STATUTS_ORDER[number])) {
      targetStatut = over.id;
    }

    if (!targetStatut || targetStatut === draggedDossier.statut) return;

    // Optimistic update
    setDossiers((prev) =>
      prev.map((d) =>
        d.id === draggedDossier.id ? { ...d, statut: targetStatut! } : d
      )
    );

    try {
      const res = await fetch(`/api/dossiers/${draggedDossier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: targetStatut }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la mise à jour');
        // Revert
        setDossiers((prev) =>
          prev.map((d) =>
            d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
          )
        );
        return;
      }

      toast.success(
        `Dossier ${draggedDossier.numeroDossier} déplacé vers « ${statutLabel(targetStatut)} »`
      );
    } catch {
      toast.error('Erreur réseau lors de la mise à jour');
      setDossiers((prev) =>
        prev.map((d) =>
          d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
        )
      );
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUTS_ORDER.map((statut) => (
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

  // ── Board ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUTS_ORDER.map((statut) => (
            <KanbanColumn
              key={statut}
              statut={statut}
              dossiers={dossiersByStatut(statut)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDossier ? <DragOverlayCard dossier={activeDossier} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}