'use client';

/**
 * Barre d'actions du registre : recherche, filtres société et type (chaque
 * changement ramène à la page 1), boutons Importer et Nouveau bénéficiaire
 * réservés aux rôles éditeurs. Présentateur pur — extraits tels quels de
 * l'ancien monolithe assures-view.tsx.
 */
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Societe } from './types';
import ImportDialog from './import-dialog';

interface ToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  filterSociete: string;
  onFilterSocieteChange: (v: string) => void;
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  societes: Societe[];
  canEdit: boolean;
  onNouveau: () => void;
  /** POST FormData de l'import (délégué au hook par la vue mère). */
  importerFichier: (file: File) => Promise<void>;
}

export default function Toolbar({
  search, onSearchChange, filterSociete, onFilterSocieteChange, filterType, onFilterTypeChange,
  societes, canEdit, onNouveau, importerFichier,
}: ToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      <div className="flex gap-2 w-full sm:w-auto flex-wrap">
        <div className="relative flex-1 sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-10 h-9 text-sm" />
        </div>
        <select value={filterSociete} onChange={(e) => onFilterSocieteChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Toutes les sociétés</option>
          {societes.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
        </select>
        <select value={filterType} onChange={(e) => onFilterTypeChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Tous les types</option>
          <option value="ASSURE">Assurés principaux</option>
          <option value="CONJOINT">Conjoints</option>
          <option value="ENFANT">Enfants</option>
        </select>
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <ImportDialog importerFichier={importerFichier} />
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm" onClick={onNouveau}>
            <Plus className="h-4 w-4 mr-2" />Nouveau bénéficiaire
          </Button>
        </div>
      )}
    </div>
  );
}
