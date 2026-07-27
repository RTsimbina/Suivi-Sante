'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { statutColor, statutLabel, formatMontant, formatDate, typeDossierLabel } from './format';
import { GripVertical, Search, Filter, X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

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

interface SocieteOption {
  id: string;
  nom: string;
}

interface FilterState {
  search: string;
  societeId: string;
  typeDossier: string;
  dateDebut: string;
  dateFin: string;
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

const TYPES_DOSSIER = [
  'HOSPITALISATION',
  'CONSULTATION',
  'PHARMACIE',
  'MATERNITE',
  'CHIRURGIE',
  'EXAMEN',
  'SOINS DENTAIRES',
  'OPTIQUE',
] as const;

const ITEMS_PER_COLUMN = 20;

const DEFAULT_FILTERS: FilterState = {
  search: '',
  societeId: '',
  typeDossier: '',
  dateDebut: '',
  dateFin: '',
};

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
      className="border rounded-lg p-3 hover:shadow-md transition bg-card cursor-grab active:cursor-grabbing"
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

// ── Drag Overlay Card ────────────────────────────────────────────────────────

function DragOverlayCard({ dossier }: { dossier: Dossier }) {
  return (
    <div className="border rounded-lg p-3 bg-card shadow-lg rotate-2 w-72">
      <p className="font-mono text-xs font-medium">{dossier.numeroDossier}</p>
      <p className="text-sm font-medium mt-1">{dossier.beneficiaire}</p>
      <p className="text-xs text-muted-foreground">{dossier.societe?.nom}</p>
    </div>
  );
}

// ── Virtualized Column ───────────────────────────────────────────────────────

function KanbanColumn({
  statut,
  dossiers,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  statut: string;
  dossiers: Dossier[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const CARD_ESTIMATED_HEIGHT = 120;
  const GAP = 8;

  const virtualizer = useVirtualizer({
    count: dossiers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ESTIMATED_HEIGHT + GAP,
    overscan: 5,
  });

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <Badge variant="outline" className={`${statutColor(statut)} text-xs font-medium`}>
          {statutLabel(statut)}
        </Badge>
        <span className="text-xs font-semibold tabular-nums">{total}</span>
      </div>

      {/* Cards with virtual scrolling */}
      <div className="flex-1 rounded-xl bg-muted/40 p-2 min-h-[120px]">
        {dossiers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Aucun dossier
          </p>
        ) : (
          <>
            <div
              ref={parentRef}
              className="overflow-y-auto"
              style={{ height: 'calc(100vh - 22rem)' }}
            >
              <SortableContext
                items={dossiers.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const dossier = dossiers[virtualRow.index];
                    return (
                      <div
                        key={dossier.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <SortableCard dossier={dossier} />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </div>

            {/* Pagination for column */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1 pt-2 border-t mt-2 border-border/50">
                <span className="text-[10px] text-muted-foreground">
                  {page}/{totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────────────────────────

export default function KanbanView() {
  const [allDossiers, setAllDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [societes, setSocietes] = useState<SocieteOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [columnPages, setColumnPages] = useState<Record<string, number>>({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(filterSearch), 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  // Fetch societes for filter dropdown
  useEffect(() => {
    fetch('/api/dossiers/societes')
      .then((r) => r.json())
      .then(setSocietes)
      .catch(() => {});
  }, []);

  // Fetch dossiers with filters
  const fetchDossiers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (searchDebounced) params.set('search', searchDebounced);
      if (filters.societeId) params.set('societeId', filters.societeId);
      if (filters.typeDossier) params.set('typeDossier', filters.typeDossier);
      if (filters.dateDebut) params.set('dateDebut', filters.dateDebut);
      if (filters.dateFin) params.set('dateFin', filters.dateFin);

      const res = await fetch(`/api/dossiers?${params}`);
      const data = await res.json();
      setAllDossiers(data.dossiers || []);
      // Reset column pages when filters change
      setColumnPages({});
    } catch {
      setAllDossiers([]);
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, filters]);

  useEffect(() => {
    fetchDossiers();
  }, [fetchDossiers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Filter dossiers by statut and apply client-side pagination per column
  const dossiersByStatutWithPagination = useMemo(() => {
    const result: Record<string, { items: Dossier[]; total: number; page: number; totalPages: number }> = {};

    for (const statut of STATUTS_ORDER) {
      const columnDossiers = allDossiers.filter((d) => d.statut === statut);
      const total = columnDossiers.length;
      const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_COLUMN));
      const page = columnPages[statut] || 1;
      const start = (page - 1) * ITEMS_PER_COLUMN;
      const items = columnDossiers.slice(start, start + ITEMS_PER_COLUMN);

      result[statut] = { items, total, page, totalPages };
    }

    return result;
  }, [allDossiers, columnPages]);

  const activeDossier = activeId ? allDossiers.find((d) => d.id === activeId) : null;

  function handleColumnPageChange(statut: string, page: number) {
    setColumnPages((prev) => ({ ...prev, [statut]: page }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setFilterSearch('');
  }

  const hasActiveFilters = filters.search || filters.societeId || filters.typeDossier || filters.dateDebut || filters.dateFin;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedDossier = allDossiers.find((d) => d.id === active.id);
    if (!draggedDossier) return;

    let targetStatut: string | undefined;

    const overDossier = allDossiers.find((d) => d.id === over.id);
    if (overDossier) {
      targetStatut = overDossier.statut;
    }

    if (!targetStatut && typeof over.id === 'string' && STATUTS_ORDER.includes(over.id as typeof STATUTS_ORDER[number])) {
      targetStatut = over.id;
    }

    if (!targetStatut || targetStatut === draggedDossier.statut) return;

    // Optimistic update
    setAllDossiers((prev) =>
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
        setAllDossiers((prev) =>
          prev.map((d) =>
            d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
          )
        );
        return;
      }

      toast.success(
        `Dossier ${draggedDossier.numeroDossier} → « ${statutLabel(targetStatut)} »`
      );
    } catch {
      toast.error('Erreur réseau lors de la mise à jour');
      setAllDossiers((prev) =>
        prev.map((d) =>
          d.id === draggedDossier.id ? { ...d, statut: draggedDossier.statut } : d
        )
      );
    }
  }

  // ── Stats summary ──────────────────────────────────────────────────────────
  const totalFiltered = allDossiers.length;
  const totalMontant = allDossiers.reduce((acc, d) => acc + (d.montantReclame || 0), 0);

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
    <div className="h-full flex flex-col gap-3">
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher dossier..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Toggle filters */}
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtres
          {hasActiveFilters && (
            <span className="h-4 w-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center">
              {[filters.societeId, filters.typeDossier, filters.dateDebut, filters.dateFin].filter(Boolean).length}
            </span>
          )}
        </Button>

        {/* Summary badge */}
        <div className="hidden md:flex items-center gap-3 ml-auto text-xs text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{totalFiltered}</strong> dossiers</span>
          <span><strong className="text-foreground tabular-nums">{formatMontant(totalMontant)}</strong></span>
        </div>

        {/* Reset */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={resetFilters}>
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </Button>
        )}
      </div>

      {/* ── Advanced filters panel ──────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg border bg-card shrink-0">
          {/* Societe filter */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Société</label>
            <Select
              value={filters.societeId}
              onValueChange={(val) => setFilters((f) => ({ ...f, societeId: val === '__all__' ? '' : val }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Toutes les sociétés" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les sociétés</SelectItem>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type dossier filter */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Type de dossier</label>
            <Select
              value={filters.typeDossier}
              onValueChange={(val) => setFilters((f) => ({ ...f, typeDossier: val === '__all__' ? '' : val }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les types</SelectItem>
                {TYPES_DOSSIER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeDossierLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date debut */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Date réception début</label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.dateDebut}
              onChange={(e) => setFilters((f) => ({ ...f, dateDebut: e.target.value }))}
            />
          </div>

          {/* Date fin */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Date réception fin</label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.dateFin}
              onChange={(e) => setFilters((f) => ({ ...f, dateFin: e.target.value }))}
            />
          </div>

          {/* Clear filters */}
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
              <X className="h-3 w-3 mr-1" />
              Effacer
            </Button>
          </div>
        </div>
      )}

      {/* ── Kanban Board ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 h-full">
            {STATUTS_ORDER.map((statut) => {
              const col = dossiersByStatutWithPagination[statut];
              return (
                <KanbanColumn
                  key={statut}
                  statut={statut}
                  dossiers={col.items}
                  page={col.page}
                  totalPages={col.totalPages}
                  total={col.total}
                  onPageChange={(p) => handleColumnPageChange(statut, p)}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeDossier ? <DragOverlayCard dossier={activeDossier} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
