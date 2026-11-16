'use client';

/**
 * Présentateur de la section « Détails du dossier » du formulaire de création
 * (refactoring P2 — extrait du monolithe dossier-form.tsx) : type de soins
 * (options groupées par prestation), catégorie, montant réclamé et moyen de
 * paiement.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPrestationSelectOptions } from '@/lib/prestations';
import { CATEGORIES, MOYENS } from './types';

interface FormDetailsProps {
  typeDossier: string;
  onTypeDossierChange: (valeur: string) => void;
  categorieDossier: string;
  onCategorieChange: (valeur: string) => void;
  montantReclame: string;
  onMontantChange: (valeur: string) => void;
  moyenPaiement: string;
  onMoyenPaiementChange: (valeur: string) => void;
}

export default function FormDetails({
  typeDossier, onTypeDossierChange,
  categorieDossier, onCategorieChange,
  montantReclame, onMontantChange,
  moyenPaiement, onMoyenPaiementChange,
}: FormDetailsProps) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-foreground">Détails du dossier</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Type de soins *</Label>
          <select value={typeDossier} onChange={e => onTypeDossierChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors" required>
            <option value="">Sélectionner...</option>
            {getPrestationSelectOptions().map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Catégorie</Label>
          <select value={categorieDossier} onChange={e => onCategorieChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
            <option value="">Sélectionner...</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Montant réclamé (Ar) *</Label>
          <Input type="number" step="0.01" value={montantReclame} onChange={e => onMontantChange(e.target.value)} placeholder="0.00" required />
        </div>
        <div className="space-y-1.5">
          <Label>Moyen de paiement</Label>
          <select value={moyenPaiement} onChange={e => onMoyenPaiementChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
            <option value="">Sélectionner...</option>
            {MOYENS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
