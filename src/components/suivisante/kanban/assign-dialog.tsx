'use client';

/**
 * Présentateur du dialog d'assignation en masse du Kanban (refactoring P2 —
 * extrait du monolithe kanban-view.tsx) : dossiers non assignés groupés par
 * service cible, sélection par cases à cocher, choix du gestionnaire puis
 * POST /api/dossiers/assigner-bulk. État local (sélections) autonome, comme
 * les autres dialogs du projet.
 */
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { UserPlus, Loader2, Users } from 'lucide-react';
import { statutLabel } from '../format';
import { SERVICE_LABELS, champPourStatut } from './types';
import type { Dossier, Gestionnaire } from './types';

interface AssignDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nonAssignes: Dossier[];
  gestionnaires: Gestionnaire[];
  onAssigned: () => void;
}

export default function AssignDialog({
  open,
  onOpenChange,
  nonAssignes,
  gestionnaires,
  onAssigned,
}: AssignDialogProps) {
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
        toast.error(data.erreur || "Erreur lors de l'assignation");
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
