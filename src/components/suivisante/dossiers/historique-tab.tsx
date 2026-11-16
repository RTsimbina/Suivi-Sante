'use client';

/**
 * Présentateur de l'onglet Historique (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : timeline des transitions de statut, point de couleur
 * aligné sur les couleurs canoniques.
 */
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { formatDate, statutLabel, statutColor } from '../format';
import { cn } from '@/lib/utils';
import { HISTORIQUE_STATUT_COLORS } from './types';
import type { HistoriqueEntry } from './types';

export default function HistoriqueTab({ historique }: { historique: HistoriqueEntry[] }) {
  return (
    <div className="space-y-1">
      {historique && historique.length > 0 ? (
        historique.map((entry, i) => (
          <div key={i} className="flex gap-3 relative">
            {/* Timeline line */}
            {i < historique.length - 1 && (
              <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
            )}
            {/* Dot */}
            <div className={cn(
              'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10',
              HISTORIQUE_STATUT_COLORS[entry.statut] || 'bg-muted-foreground',
              'text-white'
            )}>
              {i === historique.length - 1 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ArrowRight className="h-3 w-3" />
              )}
            </div>
            {/* Content */}
            <div className="pb-6 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs', statutColor(entry.statut))}>
                  {statutLabel(entry.statut)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.date)}
                </span>
              </div>
              {entry.commentaire && (
                <p className="text-sm text-muted-foreground mt-1">{entry.commentaire}</p>
              )}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun historique disponible
        </p>
      )}
    </div>
  );
}
