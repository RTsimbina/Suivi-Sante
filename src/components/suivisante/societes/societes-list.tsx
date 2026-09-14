'use client';

/**
 * Colonne gauche du layout maître-détail : liste des sociétés.
 * Présentateur pur extrait de societes-view.tsx (Vague 3) — JSX inchangé.
 */

import { Building2, Users, Stethoscope, Percent, FileText, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Societe, SocieteDetails } from './types';

export default function SocietesList({
  societes,
  selectedId,
  detailsMap,
  canWrite,
  onSelect,
  onEdit,
  onDelete,
}: {
  societes: Societe[];
  selectedId: string | null;
  detailsMap: Record<string, SocieteDetails>;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onEdit: (s: Societe) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="lg:col-span-4 xl:col-span-3 space-y-1.5 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
      {societes.map(soc => {
        const isSelected = selectedId === soc.id;
        return (
          <button
            key={soc.id}
            onClick={() => onSelect(soc.id)}
            className={cn(
              'w-full text-left rounded-lg border p-3 transition-all duration-150',
              isSelected
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm'
                : 'border-transparent hover:bg-muted/60 hover:border-muted'
            )}
          >
            <div className="flex items-start gap-2.5">
              <div className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                soc.actif ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-muted'
              )}>
                <Building2 className={cn('h-4 w-4', soc.actif ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn('text-sm font-medium truncate', !soc.actif && 'text-muted-foreground')}>{soc.nom}</p>
                  {soc.actif ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{soc._count.assures}</span>
                  <span className="flex items-center gap-0.5"><Stethoscope className="h-2.5 w-2.5" />{detailsMap[soc.id]?.prestataires?.length ?? '...'}</span>
                  <span className="flex items-center gap-0.5"><Percent className="h-2.5 w-2.5" />{soc._count.baremes}</span>
                  <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{soc._count.dossiers}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {canWrite && (
                  <>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); onEdit(soc); }}
                      onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onEdit(soc))}
                      className="p-1 rounded hover:bg-muted/80 cursor-pointer"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); onDelete(soc.id); }}
                      onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onDelete(soc.id))}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                    </span>
                  </>
                )}
                <ChevronRight className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-150',
                  isSelected && 'text-emerald-600 dark:text-emerald-400 translate-x-0.5'
                )} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
