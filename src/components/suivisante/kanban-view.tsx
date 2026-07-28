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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { statutColor, statutLabel, formatMontant, formatDate, typeDossierLabel } from './format';
import { GripVertical, UserPlus, Loader2, Users, AlertTriangle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Gestionnaire {
  id: string;
  nom: string;
  service: string;
}

interface Dossier {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  typeDossier: string;
  statut: string;
  montantReclame: number;
  societe: { nom: string };
  gestionnaireAccueilId: string | null;
  gestionnaireTechniqueId: string | null;
  gestionnaireComptaId: string | null;
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

/** Quel champ gestionnaire est pertinent selon le statut du dossier */
function champPourStatut(statut: string): 'ACCUEIL' | 'TECHNIQUE' | 'COMPTABILITE' | null {
  if (['RECU'].includes(statut)) return 'ACCUEIL';
  if (['EN_ANALYSE', 'VALIDE'].includes(statut)) return 'TECHNIQUE';
  if (['EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'].includes(statut)) return 'COMPTABILITE';
  return null;
}

function champVersGestionnaireId(statut: string, d: Dossier): string | null {
  const champ = champPourStatut(statut);
  if (champ === 'ACCUEIL') return d.gestionnaireAccueilId;
  if (champ === 'TECHNIQUE') return d.gestionnaireTechniqueId;
  if (champ === 'COMPTABILITE') return d.gestionnaireComptaId;
  return null;
}

const SERVICE_LABELS: Record<string, string> = {
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Technique',
  COMPTABILITE: 'Comptabilité',
};

// ── Sortable Card ────────────────────────────────────────────────────────────

function SortableCard({ dossier, showUnassigned }: { dossier: Dossier; showUnassigned: boolean }) {
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

// ── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
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

// ── Assign Dialog ────────────────────────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  nonAssignes,
  gestionnaires,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nonAssignes: Dossier[];
  gestionnaires: Gestionnaire[];
  onAssigned: () => void;
}) {
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedGestionnaire, setSelectedGestionnaire] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Gestionnaires filtrés par service
  const filteredGestionnaires = gestionnaires.filter(
    (g) => !selectedService || g.service === selectedService
  );

  // Grouper les non-assignés par service cible
  const nonAssignesParService = nonAssignes.reduce<Record<string, Dossier[]>>((acc, d) => {
    const champ = champPourStatut(d.statut);
    if (champ) {
      if (!acc[champ]) acc[champ] = [];
      acc[champ].push(d);
    }
    return acc;
  }, {});

  const totalNonAssignes = nonAssignes.length;

  const toggleAll = () => {
    if (selectedIds.size === totalNonAssignes) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(nonAssignes.map((d) => d.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (!selectedGestionnaire || selectedIds.size === 0) return;

    // Déterminer le champ à partir du service du gestionnaire
    const gest = gestionnaires.find((g) => g.id === selectedGestionnaire);
    if (!gest) return;

    setAssigning(true);
    try {
      const res = await fetch('/api/dossiers/assigner-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossierIds: Array.from(selectedIds),
          champ: gest.service,
          gestionnaireId: gest.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'assignation");
      } else {
        toast.success(data.message || `${data.updated} dossier(s) assigné(s)`);
        onAssigned();
        onOpenChange(false);
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setAssigning(false);
    }
  };

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedService('');
      setSelectedGestionnaire('');
      setSelectedIds(new Set());
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Assigner les dossiers non assignés
          </DialogTitle>
          <DialogDescription>
            {totalNonAssignes} dossier(s) sans gestionnaire. Sélectionnez les dossiers et le gestionnaire cible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Résumé par service */}
          {Object.entries(nonAssignesParService).map(([service, ds]) => (
            <div key={service} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Service {SERVICE_LABELS[service] || service}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {ds.length} dossier(s)
                </Badge>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {ds.map((d) => (
                  <label
                    key={d.id}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-muted/60 ${
                      selectedIds.has(d.id) ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    <Checkbox
                      checked={selectedIds.has(d.id)}
                      onCheckedChange={() => toggleOne(d.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-mono text-xs">{d.numeroDossier}</span>
                    <span className="text-xs text-muted-foreground truncate">{d.beneficiaire}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto shrink-0">
                      {statutLabel(d.statut)}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Sélection gestionnaire */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assigner à
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Service</label>
                <Select value={selectedService} onValueChange={(v) => { setSelectedService(v); setSelectedGestionnaire(''); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tous les services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCUEIL">Accueil</SelectItem>
                    <SelectItem value="TECHNIQUE">Technique</SelectItem>
                    <SelectItem value="COMPTABILITE">Comptabilité</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Gestionnaire</label>
                <Select value={selectedGestionnaire} onValueChange={setSelectedGestionnaire}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choisir un gestionnaire" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredGestionnaires.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nom}{' '}
                        <span className="text-muted-foreground">({SERVICE_LABELS[g.service] || g.service})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={selectedIds.size === totalNonAssignes && totalNonAssignes > 0}
              onCheckedChange={toggleAll}
              className="h-3.5 w-3.5"
            />
            Tout sélectionner ({totalNonAssignes})
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              disabled={!selectedGestionnaire || selectedIds.size === 0 || assigning}
              onClick={handleAssign}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {assigning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Assignation…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Assigner
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Kanban View ──────────────────────────────────────────────────────────────

export default function KanbanView() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);

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

  const fetchGestionnaires = useCallback(async () => {
    try {
      const res = await fetch('/api/dossiers/gestionnaires');
      if (res.ok) setGestionnaires(await res.json());
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    fetchDossiers();
    fetchGestionnaires();
  }, [fetchDossiers, fetchGestionnaires]);

  // Compter les non-assignés par statut
  const nonAssignesParStatut = useCallback(
    (statut: string) =>
      dossiers.filter((d) => d.statut === statut && !champVersGestionnaireId(statut, d)).length,
    [dossiers]
  );

  const totalNonAssignes = dossiers.filter(
    (d) => !champVersGestionnaireId(d.statut, d)
  ).length;

  const nonAssignes = dossiers.filter(
    (d) => !champVersGestionnaireId(d.statut, d)
  );

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

    let targetStatut: string | undefined;

    const overDossier = dossiers.find((d) => d.id === over.id);
    if (overDossier) {
      targetStatut = overDossier.statut;
    }

    if (!targetStatut && typeof over.id === 'string' && STATUTS_ORDER.includes(over.id as typeof STATUTS_ORDER[number])) {
      targetStatut = over.id;
    }

    if (!targetStatut || targetStatut === draggedDossier.statut) return;

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
            {totalNonAssignes > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {totalNonAssignes}
              </Badge>
            )}
          </button>
        </div>
        {totalNonAssignes > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAssignDialogOpen(true)}
            className="text-xs gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assigner en masse
          </Button>
        )}
      </div>

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
              nonAssignesCount={nonAssignesParStatut(statut)}
              showUnassigned={showUnassigned}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDossier ? <DragOverlayCard dossier={activeDossier} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Dialog d'assignation */}
      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        nonAssignes={nonAssignes}
        gestionnaires={gestionnaires}
        onAssigned={fetchDossiers}
      />
    </div>
  );
}
