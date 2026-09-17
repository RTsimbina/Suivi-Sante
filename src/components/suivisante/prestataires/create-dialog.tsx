'use client';

/**
 * Dialog « Nouveau prestataire » : création d'un prestataire avec
 * rattachement optionnel à des sociétés clientes.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé.
 */

import { Plus, CheckCircle2, AlertTriangle, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { SocieteItem, CreateFormState, TYPE_LABELS } from './types';

export default function CreateDialog({
  open,
  onOpenChange,
  societes,
  filteredCreateSocietes,
  createSocieteSearch,
  onSocieteSearchChange,
  createSelectedSocietes,
  onToggleSociete,
  onClearSelectedSocietes,
  createForm,
  onCreateFormChange,
  createError,
  createSuccess,
  creating,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  societes: SocieteItem[];
  filteredCreateSocietes: SocieteItem[];
  createSocieteSearch: string;
  onSocieteSearchChange: (value: string) => void;
  createSelectedSocietes: string[];
  onToggleSociete: (societeId: string) => void;
  onClearSelectedSocietes: () => void;
  createForm: CreateFormState;
  onCreateFormChange: (updater: (f: CreateFormState) => CreateFormState) => void;
  createError: string;
  createSuccess: string;
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-600" /> Nouveau prestataire
          </DialogTitle>
        </DialogHeader>

        {createSuccess ? (
          <div className="flex items-center gap-2.5 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{createSuccess}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Erreur */}
            {createError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300">{createError}</p>
              </div>
            )}

            {/* Nom * */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nom <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex : Centre Hospitalier Universitaire de..."
                value={createForm.nom}
                onChange={e => onCreateFormChange(f => ({ ...f, nom: e.target.value }))}
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            {/* Type * */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Type / Catégorie <span className="text-red-500">*</span></Label>
              <select
                value={createForm.type}
                onChange={e => onCreateFormChange(f => ({ ...f, type: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sélectionner un type...</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Téléphone + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Téléphone</Label>
                <Input
                  placeholder="034 00 000 00"
                  value={createForm.telephone}
                  onChange={e => onCreateFormChange(f => ({ ...f, telephone: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  type="email"
                  placeholder="contact@prestataire.mg"
                  value={createForm.email}
                  onChange={e => onCreateFormChange(f => ({ ...f, email: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Adresse */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Adresse</Label>
              <Input
                placeholder="Ex : Lot XYZ, Antananarivo"
                value={createForm.adresse}
                onChange={e => onCreateFormChange(f => ({ ...f, adresse: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            {/* NIF + Num STAT */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">NIF</Label>
                <Input
                  placeholder="3000 123 456"
                  value={createForm.nif}
                  onChange={e => onCreateFormChange(f => ({ ...f, nif: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Num STAT</Label>
                <Input
                  placeholder="Numéro statistique"
                  value={createForm.stat}
                  onChange={e => onCreateFormChange(f => ({ ...f, stat: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Statut juridique + RIB */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Statut juridique</Label>
                <Input
                  placeholder="Ex : SARL, SA, ONG..."
                  value={createForm.statutJuridique}
                  onChange={e => onCreateFormChange(f => ({ ...f, statutJuridique: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">RIB (Relevé d'Identité Bancaire)</Label>
                <Input
                  placeholder="Numéro de compte bancaire"
                  value={createForm.rib}
                  onChange={e => onCreateFormChange(f => ({ ...f, rib: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Séparation */}
            <div className="border-t pt-3">
              <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <Building2 className="h-3.5 w-3.5" />
                Rattacher à des sociétés clientes
                <span className="text-muted-foreground font-normal">(optionnel)</span>
              </Label>
              {societes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center rounded-lg border border-dashed">
                  Aucune société enregistrée. Vous pourrez rattacher ce prestataire plus tard.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      placeholder="Rechercher une société..."
                      value={createSocieteSearch}
                      onChange={e => onSocieteSearchChange(e.target.value)}
                      className="h-8 text-xs"
                    />
                    {createSelectedSocietes.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                        onClick={onClearSelectedSocietes}
                      >
                        Tout retirer
                      </Button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                    {filteredCreateSocietes.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">Aucune société trouvée</p>
                    ) : (
                      filteredCreateSocietes.map(s => {
                        const selected = createSelectedSocietes.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onToggleSociete(s.id)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors cursor-pointer',
                              selected
                                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                : 'hover:bg-muted/60'
                            )}
                          >
                            <div className={cn(
                              'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              selected
                                ? 'bg-emerald-600 border-emerald-600'
                                : 'border-muted-foreground/30'
                            )}>
                              {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                            </div>
                            <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span className={cn('truncate', selected && 'font-medium text-emerald-700 dark:text-emerald-300')}>
                              {s.nom}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {createSelectedSocietes.length > 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">
                      {createSelectedSocietes.length} société(s) sélectionnée(s)
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={creating}
              >
                Annuler
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onCreate}
                disabled={creating}
              >
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {createSelectedSocietes.length > 0
                  ? `Créer et rattacher (${createSelectedSocietes.length})`
                  : 'Créer le prestataire'
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
