'use client';

/**
 * Dialogue de création / édition d'un bénéficiaire (16 champs, sélection de
 * l'assuré principal filtrée par société, checkbox actif). Présentateur pur —
 * extraits tels quels de l'ancien monolithe assures-view.tsx.
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { Assure, Societe } from './types';

interface AssureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Assure | null;
  societes: Societe[];
  principaux: Assure[];
  saving: boolean;
  onEnregistrer: () => void;
  // champs contrôlés
  formSocieteId: string; onFormSocieteIdChange: (v: string) => void;
  formNom: string; onFormNomChange: (v: string) => void;
  formPrenom: string; onFormPrenomChange: (v: string) => void;
  formNSS: string; onFormNSSChange: (v: string) => void;
  formMatricule: string; onFormMatriculeChange: (v: string) => void;
  formTypeBenef: string; onFormTypeBenefChange: (v: string) => void;
  formAssurePrincipalId: string; onFormAssurePrincipalIdChange: (v: string) => void;
  formCodeFamille: string; onFormCodeFamilleChange: (v: string) => void;
  formDateNaissance: string; onFormDateNaissanceChange: (v: string) => void;
  formSexe: string; onFormSexeChange: (v: string) => void;
  formDateEffet: string; onFormDateEffetChange: (v: string) => void;
  formBareme: string; onFormBaremeChange: (v: string) => void;
  formTelephone: string; onFormTelephoneChange: (v: string) => void;
  formEmail: string; onFormEmailChange: (v: string) => void;
  formAdresse: string; onFormAdresseChange: (v: string) => void;
  formActif: boolean; onFormActifChange: (v: boolean) => void;
}

export default function AssureFormDialog({
  open, onOpenChange, editing, societes, principaux, saving, onEnregistrer,
  formSocieteId, onFormSocieteIdChange,
  formNom, onFormNomChange,
  formPrenom, onFormPrenomChange,
  formNSS, onFormNSSChange,
  formMatricule, onFormMatriculeChange,
  formTypeBenef, onFormTypeBenefChange,
  formAssurePrincipalId, onFormAssurePrincipalIdChange,
  formCodeFamille, onFormCodeFamilleChange,
  formDateNaissance, onFormDateNaissanceChange,
  formSexe, onFormSexeChange,
  formDateEffet, onFormDateEffetChange,
  formBareme, onFormBaremeChange,
  formTelephone, onFormTelephoneChange,
  formEmail, onFormEmailChange,
  formAdresse, onFormAdresseChange,
  formActif, onFormActifChange,
}: AssureFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom *</Label>
              <Input value={formNom} onChange={(e) => onFormNomChange(e.target.value)} placeholder="Rakoto" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prénom</Label>
              <Input value={formPrenom} onChange={(e) => onFormPrenomChange(e.target.value)} placeholder="Jean" className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Société *</Label>
              <select value={formSocieteId} onChange={(e) => onFormSocieteIdChange(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- Sélectionner --</option>
                {societes.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type de bénéficiaire *</Label>
              <select value={formTypeBenef} onChange={(e) => onFormTypeBenefChange(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                <option value="ASSURE">Assuré principal</option>
                <option value="CONJOINT">Conjoint</option>
                <option value="ENFANT">Enfant</option>
              </select>
            </div>
          </div>
          {formTypeBenef !== 'ASSURE' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Assuré principal (rattachement)</Label>
              <select value={formAssurePrincipalId} onChange={(e) => onFormAssurePrincipalIdChange(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- Sélectionner --</option>
                {principaux.filter(p => p.societe.id === formSocieteId).map((p) => (
                  <option key={p.id} value={p.id}>{p.matricule ? `[${p.matricule}] ` : ''}{p.prenom ? `${p.prenom} ` : ''}{p.nom}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Matricule</Label>
              <Input value={formMatricule} onChange={(e) => onFormMatriculeChange(e.target.value)} placeholder="74735" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Code famille</Label>
              <Input value={formCodeFamille} onChange={(e) => onFormCodeFamilleChange(e.target.value)} placeholder="Famille 12" className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">N° Sécurité Sociale</Label>
              <Input value={formNSS} onChange={(e) => onFormNSSChange(e.target.value)} placeholder="SS-123456" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date de naissance</Label>
              <Input type="date" value={formDateNaissance} onChange={(e) => onFormDateNaissanceChange(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Genre</Label>
              <select value={formSexe} onChange={(e) => onFormSexeChange(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">--</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date d'effet</Label>
              <Input type="date" value={formDateEffet} onChange={(e) => onFormDateEffetChange(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Barème (coefficient)</Label>
              <Input type="number" step="0.1" min="0" max="1" value={formBareme} onChange={(e) => onFormBaremeChange(e.target.value)} placeholder="0.8" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone</Label>
              <Input value={formTelephone} onChange={(e) => onFormTelephoneChange(e.target.value)} placeholder="+261 34 00 000 00" className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" value={formEmail} onChange={(e) => onFormEmailChange(e.target.value)} placeholder="assure@email.com" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Adresse</Label>
            <Input value={formAdresse} onChange={(e) => onFormAdresseChange(e.target.value)} placeholder="Antananarivo, Madagascar" className="h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="a-actif" checked={formActif} onChange={(e) => onFormActifChange(e.target.checked)} className="h-4 w-4 rounded border-border" />
            <Label htmlFor="a-actif" className="text-xs">Bénéficiaire actif</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-8 text-sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm" onClick={onEnregistrer} disabled={saving || !formNom || !formSocieteId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
