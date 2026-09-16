'use client';

/**
 * Colonne gauche du layout maître-détail : recherche et liste des sociétés
 * avec leurs compteurs de liens.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé.
 */

import { Search, Building2, Stethoscope, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { SocieteItem, SocieteStats } from './types';

export default function SocieteList({
  filteredSocietes,
  searchSociete,
  onSearchSocieteChange,
  selectedSocieteId,
  societeStats,
  onSelectSociete,
}: {
  filteredSocietes: SocieteItem[];
  searchSociete: string;
  onSearchSocieteChange: (value: string) => void;
  selectedSocieteId: string | null;
  societeStats: Record<string, SocieteStats>;
  onSelectSociete: (id: string) => void;
}) {
  return (
    <div className="lg:col-span-4 xl:col-span-3 space-y-2">
      {/* Recherche sociétés */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Rechercher une société..."
          value={searchSociete}
          onChange={e => onSearchSocieteChange(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Liste des sociétés */}
      <div className="space-y-1 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
        {filteredSocietes.map(s => {
          const isSelected = selectedSocieteId === s.id;
          const stats = societeStats[s.id] || { total: 0, actifs: 0, inactifs: 0, nbDossiers: 0, montantTotal: 0 };
          return (
            <button
              key={s.id}
              onClick={() => onSelectSociete(s.id)}
              className={cn(
                'w-full text-left rounded-lg border p-3 transition-all duration-150',
                isSelected
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm'
                  : 'border-transparent hover:bg-muted/60 hover:border-muted'
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.nom}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Stethoscope className="h-2.5 w-2.5" />{stats.total}
                    </span>
                    {stats.actifs > 0 && (
                      <span className="text-emerald-600 font-medium">{stats.actifs} act.</span>
                    )}
                    {stats.inactifs > 0 && (
                      <span className="text-red-500 font-medium">{stats.inactifs} inact.</span>
                    )}
                    {stats.nbDossiers > 0 && (
                      <span className="text-blue-500 font-medium">{stats.nbDossiers} dossier(s)</span>
                    )}
                  </div>
                </div>
                <ChevronRight className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1',
                  isSelected && 'text-emerald-600 dark:text-emerald-400 translate-x-0.5'
                )} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
