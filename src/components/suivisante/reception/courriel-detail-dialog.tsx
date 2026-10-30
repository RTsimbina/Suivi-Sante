'use client';

/**
 * Dialogue « Détails du courriel » : consultation (badges type/statut/dossier,
 * grille d'informations, observations) et mode édition inline (statut,
 * observations, lien dossier). Présentateur pur — extraits tels quels de
 * l'ancien monolithe reception-view.tsx.
 */
import { FileText, Pencil, CheckCircle2, Receipt, ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatMontantCourt, formatDate } from '../format';
import type { CourrielItem } from './types';
import { TYPE_LABELS, TYPE_COLORS, COURRIEL_STATUT_COLORS, COURRIEL_STATUT_LABELS } from './types';

interface CourrielDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courriel: CourrielItem | null;
  editMode: boolean;
  onEditModeChange: (v: boolean) => void;
  editStatut: string;
  onEditStatutChange: (v: string) => void;
  editObservations: string;
  onEditObservationsChange: (v: string) => void;
  editDossierId: string;
  onEditDossierIdChange: (v: string) => void;
  editSubmitting: boolean;
  onMettreAJour: () => void;
  onSupprimer: () => void;
}

export default function CourrielDetailDialog({
  open, onOpenChange, courriel,
  editMode, onEditModeChange,
  editStatut, onEditStatutChange,
  editObservations, onEditObservationsChange,
  editDossierId, onEditDossierIdChange,
  editSubmitting, onMettreAJour, onSupprimer,
}: CourrielDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {courriel && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                Détails du courriel
              </DialogTitle>
              <DialogDescription>
                Consultation et traitement du courriel entrant.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Header: Type + Statut */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={TYPE_COLORS[courriel.type] || ''}>
                  {courriel.type === 'FACTURE_PRESTATAIRE' ? (
                    <Receipt className="h-3 w-3 mr-1" />
                  ) : (
                    <ClipboardList className="h-3 w-3 mr-1" />
                  )}
                  {TYPE_LABELS[courriel.type] || courriel.type}
                </Badge>
                <Badge variant="outline" className={COURRIEL_STATUT_COLORS[courriel.statut] || ''}>
                  {COURRIEL_STATUT_LABELS[courriel.statut] || courriel.statut}
                </Badge>
                {courriel.dossier && (
                  <Badge variant="outline" className="bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 text-[10px]">
                    <FileText className="h-3 w-3 mr-1" />
                    {courriel.dossier.numeroDossier}
                  </Badge>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-[11px] text-muted-foreground">Expéditeur</p>
                  <p className="text-sm font-medium">{courriel.expediteur}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-[11px] text-muted-foreground">Date du courriel</p>
                  <p className="text-sm font-medium">{formatDate(courriel.dateCourriel)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                  <p className="text-[11px] text-muted-foreground">Objet</p>
                  <p className="text-sm font-medium">{courriel.objet}</p>
                </div>
                {courriel.societe && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Société</p>
                    <p className="text-sm font-medium">{courriel.societe.nom}</p>
                  </div>
                )}
                {courriel.beneficiaire && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Bénéficiaire</p>
                    <p className="text-sm font-medium">{courriel.beneficiaire}</p>
                  </div>
                )}
                {courriel.prestataire && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Prestataire</p>
                    <p className="text-sm font-medium">{courriel.prestataire}</p>
                  </div>
                )}
                {courriel.montant !== null && courriel.montant > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Montant</p>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatMontantCourt(courriel.montant)}</p>
                  </div>
                )}
                {courriel.dateSoins && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Date des soins</p>
                    <p className="text-sm font-medium">{formatDate(courriel.dateSoins)}</p>
                  </div>
                )}
                {courriel.traitePar && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Traité par</p>
                    <p className="text-sm font-medium">{courriel.traitePar}</p>
                  </div>
                )}
                {courriel.dateTraitement && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[11px] text-muted-foreground">Date de traitement</p>
                    <p className="text-sm font-medium">{formatDate(courriel.dateTraitement)}</p>
                  </div>
                )}
              </div>

              {/* Observations */}
              {courriel.observations && (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-[11px] text-muted-foreground mb-1">Observations</p>
                  <p className="text-sm">{courriel.observations}</p>
                </div>
              )}

              {/* ─── Edit Section ─────────────────────────────────────── */}
              {editMode ? (
                <div className="space-y-4 pt-2 border-t">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Mode édition</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Statut</Label>
                      <Select value={editStatut} onValueChange={onEditStatutChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RECU">Reçu</SelectItem>
                          <SelectItem value="TRAITE">Traité</SelectItem>
                          <SelectItem value="REJETE">Rejeté</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Lier à un dossier</Label>
                      <Input
                        placeholder="ID du dossier (optionnel)"
                        value={editDossierId}
                        onChange={(e) => onEditDossierIdChange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Observations</Label>
                    <Textarea
                      placeholder="Ajouter des observations..."
                      value={editObservations}
                      onChange={(e) => onEditObservationsChange(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => onEditModeChange(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40"
                    onClick={onSupprimer}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Supprimer
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              {editMode ? (
                <>
                  <Button variant="outline" onClick={() => onEditModeChange(false)}>Annuler</Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={onMettreAJour}
                    disabled={editSubmitting}
                  >
                    {editSubmitting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Enregistrer
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Fermer
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
