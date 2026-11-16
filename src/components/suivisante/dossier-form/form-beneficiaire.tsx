'use client';

/**
 * Présentateur de la section « Informations du bénéficiaire » du formulaire
 * de création de dossier (refactoring P2 — extrait du monolithe
 * dossier-form.tsx) : bénéficiaire, assuré (préremplit N° SS et société via
 * le hook), entreprise cliente, date des soins, prestataire médical.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Societe, AssureOption, PrestataireOption } from './types';

interface FormBeneficiaireProps {
  beneficiaire: string;
  onBeneficiaireChange: (valeur: string) => void;
  assure: string;
  onAssureChange: (valeur: string) => void;
  assuresList: AssureOption[];
  societeId: string;
  nSS: string;
  onNSSChange: (valeur: string) => void;
  onSocieteChange: (valeur: string) => void;
  dateSoins: string;
  onDateSoinsChange: (valeur: string) => void;
  prestataire: string;
  onPrestataireChange: (valeur: string) => void;
  prestatairesList: PrestataireOption[];
  societes: Societe[];
}

export default function FormBeneficiaire({
  beneficiaire, onBeneficiaireChange,
  assure, onAssureChange, assuresList, societeId,
  nSS, onNSSChange,
  onSocieteChange,
  dateSoins, onDateSoinsChange,
  prestataire, onPrestataireChange, prestatairesList,
  societes,
}: FormBeneficiaireProps) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-foreground">Informations du bénéficiaire</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Bénéficiaire *</Label>
          <Input value={beneficiaire} onChange={e => onBeneficiaireChange(e.target.value)} placeholder="Nom complet" required />
        </div>
        <div className="space-y-1.5">
          <Label>Assuré</Label>
          <select value={assure} onChange={e => onAssureChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
            <option value="">Sélectionner...</option>
            {assuresList.filter(a => !societeId || a.societeId === societeId).map(a => (
              <option key={a.id} value={a.id}>{a.prenom ? `${a.prenom} ${a.nom}` : a.nom}{a.matricule ? ` [${a.matricule}]` : ''}{a.nSS ? ` (${a.nSS})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>N° Sécurité Sociale</Label>
          <Input value={nSS} onChange={e => onNSSChange(e.target.value)} placeholder="SS-XXXXXX" />
        </div>
        <div className="space-y-1.5">
          <Label>Entreprise cliente *</Label>
          <select value={societeId} onChange={e => onSocieteChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors" required>
            <option value="">Sélectionner...</option>
            {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Date des soins</Label>
          <Input type="date" value={dateSoins} onChange={e => onDateSoinsChange(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Prestataire médical</Label>
          <select value={prestataire} onChange={e => onPrestataireChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
            <option value="">Sélectionner...</option>
            {prestatairesList.filter(p => p.actif !== false).map(p => (
              <option key={p.id} value={p.id}>{p.nom} ({p.type})</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
