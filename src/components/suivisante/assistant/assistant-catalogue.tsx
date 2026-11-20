'use client';

/**
 * Présentateurs du catalogue de questions de l'assistant (refactoring P2 —
 * extraits du monolithe assistant-view.tsx) : liste groupée par catégorie
 * (réutilisée desktop et dialog compact) et sélecteur compact du portail.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionPublique } from './types';

export function CatalogueListe({
  categories, questionActiveId, choisirQuestion,
}: {
  categories: [string, QuestionPublique[]][];
  questionActiveId: string | null;
  choisirQuestion: (q: QuestionPublique) => void;
}) {
  return (
    <div className="p-3 space-y-4">
      {categories.map(([cat, questions]) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 mb-1.5">{cat}</p>
          <div className="space-y-1">
            {questions.map((q) => (
              <button
                key={q.id}
                onClick={() => choisirQuestion(q)}
                className={cn(
                  'w-full text-left text-xs px-3 py-2 rounded-lg transition-colors',
                  questionActiveId === q.id
                    ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {q.question}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AssistantCatalogueCompactProps {
  questionActive: QuestionPublique | null;
  totalQuestions: number;
  recherche: string;
  onRechercheChange: (valeur: string) => void;
  categories: [string, QuestionPublique[]][];
  questionActiveId: string | null;
  /** Sélection d'une question : ferme le dialog automatiquement. */
  onChoisir: (q: QuestionPublique) => void;
}

export function AssistantCatalogueCompact({
  questionActive,
  totalQuestions,
  recherche,
  onRechercheChange,
  categories,
  questionActiveId,
  onChoisir,
}: AssistantCatalogueCompactProps) {
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);

  const choisir = (q: QuestionPublique) => {
    onChoisir(q);
    setCatalogueOuvert(false);
  };

  return (
    <div className="border-b p-3 shrink-0">
      <Dialog open={catalogueOuvert} onOpenChange={setCatalogueOuvert}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-xs gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-brand-600" />
            {questionActive ? questionActive.question : 'Choisir une question...'}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-brand-600" />
              Catalogue de questions ({totalQuestions})
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={recherche}
              onChange={(e) => onRechercheChange(e.target.value)}
              placeholder="Rechercher une question..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
            <CatalogueListe categories={categories} questionActiveId={questionActiveId} choisirQuestion={choisir} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
