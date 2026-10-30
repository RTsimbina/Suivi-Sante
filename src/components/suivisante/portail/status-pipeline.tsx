'use client';

/**
 * Pipeline visuel de progression d'un dossier (5 étapes, déclinaison
 * spécifique au rejet). Extrait tel quel de l'ancien monolithe
 * portail-view.tsx.
 */
import { CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINE_STEPS, getPipelineIndex } from './types';

export default function StatusPipeline({ statut }: { statut: string }) {
  const currentIdx = getPipelineIndex(statut);
  const isRejete = statut === 'REJETE';

  if (isRejete) {
    return (
      <div className="flex items-center gap-2 mt-3">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border-2',
                i === 0
                  ? 'bg-emerald-100 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : i === 1
                    ? 'bg-red-100 border-red-300 text-red-700 dark:text-red-300'
                    : 'bg-muted border-border text-muted-foreground'
              )}>
                {i === 0 ? <CheckCheck className="h-3.5 w-3.5" /> : i === 1 ? '✕' : i + 1}
              </div>
              <span className="text-[10px] text-muted-foreground w-16 text-center leading-tight">
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={cn(
                'h-0.5 w-6 mb-4',
                i === 0 ? 'bg-emerald-400' : 'bg-muted-foreground/30'
              )} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      {PIPELINE_STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-all',
              i < currentIdx
                ? 'bg-emerald-50 dark:bg-emerald-950/400 border-emerald-500 text-white'
                : i === currentIdx
                  ? 'bg-emerald-100 border-emerald-400 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-200'
                  : 'bg-muted border-border text-muted-foreground'
            )}>
              {i < currentIdx ? <CheckCheck className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn(
              'text-[10px] w-16 text-center leading-tight',
              i <= currentIdx ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-muted-foreground'
            )}>
              {step.label}
            </span>
          </div>
          {i < PIPELINE_STEPS.length - 1 && (
            <div className={cn(
              'h-0.5 w-6 mb-4 transition-all',
              i < currentIdx ? 'bg-emerald-50 dark:bg-emerald-950/400' : 'bg-muted-foreground/30'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
