'use client';

/**
 * Dialog « Ajouter un prestataire » : liaison d'un prestataire existant à la
 * société sélectionnée.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé.
 */

import { Loader2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { PrestataireItem, TYPE_LABELS } from './types';

export default function LinkDialog({
  open,
  onOpenChange,
  societeNom,
  availablePrestataires,
  linkPrestataireId,
  onLinkPrestataireChange,
  onLink,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  societeNom: string | undefined;
  availablePrestataires: PrestataireItem[];
  linkPrestataireId: string;
  onLinkPrestataireChange: (value: string) => void;
  onLink: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajouter un prestataire</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Lier un prestataire à <span className="font-medium text-foreground">{societeNom}</span>.{' '}
            Il sera <span className="font-medium text-emerald-600">Actif</span> par défaut.
          </p>
          {availablePrestataires.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground rounded-lg border border-dashed">
              <Stethoscope className="h-7 w-7 mx-auto mb-1.5 opacity-20" />
              <p className="text-xs">Tous les prestataires sont déjà liés à cette société</p>
            </div>
          ) : (
            <>
              <select
                value={linkPrestataireId}
                onChange={e => onLinkPrestataireChange(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choisir un prestataire...</option>
                {availablePrestataires.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nom} — {TYPE_LABELS[p.type] || p.type}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={onLink}
                  disabled={!linkPrestataireId || saving}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Lier
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
