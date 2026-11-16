'use client';

/**
 * Présentateur des filtres du Journal de Bord (refactoring P2 — extrait du
 * monolithe journal-view.tsx) : dropdowns module/action/niveau/utilisateur/
 * société, barre de recherche et toggle « critiques uniquement ». La période
 * est gérée par la barre de filtre partagée (en haut de page). Les règles de
 * cohérence niveau/critique vivent dans le hook use-journal-data.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, ChevronUp, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_OPTIONS, ACTION_OPTIONS, NIVEAU_OPTIONS } from './types';
import type { FilterOption } from './types';

interface JournalFiltresProps {
  entite: string;
  onEntiteChange: (valeur: string) => void;
  action: string;
  onActionChange: (valeur: string) => void;
  niveau: string;
  onNiveauChange: (valeur: string) => void;
  criticalOnly: boolean;
  onToggleCriticalOnly: () => void;
  utilisateurId: string;
  onUtilisateurChange: (valeur: string) => void;
  utilisateurs: FilterOption[];
  societeId: string;
  onSocieteChange: (valeur: string) => void;
  societes: FilterOption[];
  recherche: string;
  onRechercheChange: (valeur: string) => void;
  onReset: () => void;
}

export default function JournalFiltres({
  entite, onEntiteChange,
  action, onActionChange,
  niveau, onNiveauChange,
  criticalOnly, onToggleCriticalOnly,
  utilisateurId, onUtilisateurChange,
  utilisateurs,
  societeId, onSocieteChange,
  societes,
  recherche, onRechercheChange,
  onReset,
}: JournalFiltresProps) {
  const [filtresOuverts, setFiltresOuverts] = useState(true);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-3">
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setFiltresOuverts(!filtresOuverts)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtres
            <ChevronUp className={cn('h-3 w-3 transition-transform', !filtresOuverts && 'rotate-180')} />
          </button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={onReset}>
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </Button>
        </div>

        {filtresOuverts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            {/* Période : gérée par la barre de filtre de période partagée (en haut de page) */}

            {/* Module */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Module</label>
              <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={entite} onChange={(e) => onEntiteChange(e.target.value)}>
                {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Action */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</label>
              <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={action} onChange={(e) => onActionChange(e.target.value)}>
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Niveau */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Niveau</label>
              <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={criticalOnly ? 'CRITIQUE' : niveau} onChange={(e) => onNiveauChange(e.target.value)}>
                <option value="">Tous</option>
                {NIVEAU_OPTIONS.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Utilisateur */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Utilisateur</label>
              <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={utilisateurId} onChange={(e) => onUtilisateurChange(e.target.value)}>
                <option value="">Tous</option>
                {utilisateurs.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>

            {/* Société */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Société</label>
              <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={societeId} onChange={(e) => onSocieteChange(e.target.value)}>
                <option value="">Toutes</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Barre de recherche + toggle critiques */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans le journal..."
              className="h-8 pl-8 text-xs"
              value={recherche}
              onChange={(e) => onRechercheChange(e.target.value)}
            />
            {recherche && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => onRechercheChange('')}>
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <button
            className={cn(
              'h-8 px-3 rounded-md border text-xs font-medium transition-colors',
              criticalOnly
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
            onClick={onToggleCriticalOnly}
          >
            🔴 Critiques uniquement
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
