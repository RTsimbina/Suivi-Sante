'use client';

/**
 * Dialogue « Enregistrer un courriel » : choix du type (facture prestataire /
 * dossier remboursement), champs de saisie conditionnels et validation
 * expéditeur + objet obligatoires. Présentateur pur — extraits tels quels de
 * l'ancien monolithe reception-view.tsx.
 */
import { Mail, Plus, Receipt, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { SocieteOption } from './types';

interface CourrielCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  societes: SocieteOption[];
  formType: string;
  onFormTypeChange: (v: string) => void;
  formExpediteur: string;
  onFormExpediteurChange: (v: string) => void;
  formObjet: string;
  onFormObjetChange: (v: string) => void;
  formSocieteId: string;
  onFormSocieteIdChange: (v: string) => void;
  formBeneficiaire: string;
  onFormBeneficiaireChange: (v: string) => void;
  formMontant: string;
  onFormMontantChange: (v: string) => void;
  formDateCourriel: string;
  onFormDateCourrielChange: (v: string) => void;
  formDateSoins: string;
  onFormDateSoinsChange: (v: string) => void;
  formPrestataire: string;
  onFormPrestataireChange: (v: string) => void;
  submitting: boolean;
  onCreer: () => void;
}

export default function CourrielCreateDialog({
  open, onOpenChange, societes,
  formType, onFormTypeChange,
  formExpediteur, onFormExpediteurChange,
  formObjet, onFormObjetChange,
  formSocieteId, onFormSocieteIdChange,
  formBeneficiaire, onFormBeneficiaireChange,
  formMontant, onFormMontantChange,
  formDateCourriel, onFormDateCourrielChange,
  formDateSoins, onFormDateSoinsChange,
  formPrestataire, onFormPrestataireChange,
  submitting, onCreer,
}: CourrielCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-sky-600" />
            Enregistrer un courriel
          </DialogTitle>
          <DialogDescription>
            Saisissez les informations du courriel reçu au service de réception.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Type de courriel *</Label>
            <Tabs value={formType} onValueChange={onFormTypeChange} className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="FACTURE_PRESTATAIRE" className="text-xs gap-1.5">
                  <Receipt className="h-3.5 w-3.5" />
                  Facture prestataire
                </TabsTrigger>
                <TabsTrigger value="DOSSIER_REMBOURSEMENT" className="text-xs gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Dossier remboursement
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground">
              {formType === 'FACTURE_PRESTATAIRE'
                ? 'Facture d\'un prestataire de santé (clinique, pharmacie, laboratoire...) pour paiement.'
                : 'Dossier de remboursement envoyé par un assuré ou son entreprise.'}
            </p>
          </div>

          {/* Expéditeur + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Expéditeur *</Label>
              <Input
                placeholder={formType === 'FACTURE_PRESTATAIRE' ? 'Ex: Clinique Sainte-Marie' : 'Ex: Jean Dupont'}
                value={formExpediteur}
                onChange={(e) => onFormExpediteurChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date du courriel</Label>
              <Input
                type="date"
                value={formDateCourriel}
                onChange={(e) => onFormDateCourrielChange(e.target.value)}
              />
            </div>
          </div>

          {/* Objet */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Objet *</Label>
            <Input
              placeholder={formType === 'FACTURE_PRESTATAIRE' ? 'Ex: Facture #FAC-2026-0451' : 'Ex: Demande remboursement hospitalisation'}
              value={formObjet}
              onChange={(e) => onFormObjetChange(e.target.value)}
            />
          </div>

          {/* Société + Bénéficiaire (for remboursement) */}
          {formType === 'DOSSIER_REMBOURSEMENT' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Société</Label>
                <Select value={formSocieteId} onValueChange={onFormSocieteIdChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une société" />
                  </SelectTrigger>
                  <SelectContent>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Bénéficiaire</Label>
                <Input
                  placeholder="Nom du patient / assuré"
                  value={formBeneficiaire}
                  onChange={(e) => onFormBeneficiaireChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Prestataire + Montant */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Prestataire de santé</Label>
              <Input
                placeholder="Ex: Dr. Rakoto, Pharmacie Centrale..."
                value={formPrestataire}
                onChange={(e) => onFormPrestataireChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Montant (Ariary)</Label>
              <Input
                type="number"
                placeholder="0"
                value={formMontant}
                onChange={(e) => onFormMontantChange(e.target.value)}
              />
            </div>
          </div>

          {/* Date des soins */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Date des soins</Label>
            <Input
              type="date"
              value={formDateSoins}
              onChange={(e) => onFormDateSoinsChange(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={onCreer}
            disabled={submitting || !formExpediteur.trim() || !formObjet.trim()}
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
