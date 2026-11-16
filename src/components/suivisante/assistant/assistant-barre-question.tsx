'use client';

/**
 * Présentateur de la barre de question active de l'assistant (refactoring P2 —
 * extrait du monolithe assistant-view.tsx) : question sélectionnée, note,
 * champs de paramètres et bouton « Obtenir la réponse ». La ref d'appui
 * visuel et les états vivent dans le hook / la page d'assemblage.
 */
import { Button } from '@/components/ui/button';
import { MessageCircleQuestion, Info, X, Bot, Loader2 } from 'lucide-react';
import { ChampParametre } from './assistant-parametre';
import type { QuestionPublique } from './types';

interface AssistantBarreQuestionProps {
  questionActive: QuestionPublique | null;
  parametres: Record<string, string>;
  options: Partial<Record<string, { id: string; label: string }[]>>;
  requisComplets: boolean;
  enCours: boolean;
  onParametreChange: (cle: string, valeur: string) => void;
  onPoser: () => void;
  onFermer: () => void;
}

export default function AssistantBarreQuestion({
  questionActive,
  parametres,
  options,
  requisComplets,
  enCours,
  onParametreChange,
  onPoser,
  onFermer,
}: AssistantBarreQuestionProps) {
  return (
    <div className="border-t bg-card p-3 shrink-0">
      {questionActive ? (
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <MessageCircleQuestion className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{questionActive.question}</p>
                {questionActive.note && (
                  <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
                    <Info className="h-3 w-3 shrink-0 mt-px" /> {questionActive.note}
                  </p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onFermer}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {questionActive.params.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              {questionActive.params.map((p) => (
                <ChampParametre
                  key={p.key}
                  def={p}
                  valeur={parametres[p.key] ?? ''}
                  options={options}
                  onChange={(v) => onParametreChange(p.key, v)}
                />
              ))}
              <Button
                onClick={onPoser}
                disabled={!requisComplets || enCours}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs ml-auto"
              >
                {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Obtenir la réponse'}
              </Button>
            </div>
          )}
          {(questionActive.params.length === 0) && (
            <Button
              onClick={onPoser}
              disabled={enCours}
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs"
            >
              {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Obtenir la réponse'}
            </Button>
          )}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
          <Bot className="h-4 w-4" />
          Sélectionnez une question dans le catalogue pour commencer.
        </div>
      )}
    </div>
  );
}
