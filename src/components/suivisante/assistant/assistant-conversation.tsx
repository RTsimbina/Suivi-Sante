'use client';

/**
 * Présentateur de la conversation de l'assistant (refactoring P2 — extrait du
 * monolithe assistant-view.tsx) : bulles utilisateur/assistant, erreurs,
 * cartes de résultat et indicateur de calcul en cours. Le défilement
 * automatique est piloté par la ref passée par la page d'assemblage.
 */
import type { RefObject } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Loader2 } from 'lucide-react';
import { CarteResultat } from './assistant-resultat';
import type { Message } from './types';

interface AssistantConversationProps {
  messages: Message[];
  enCours: boolean;
  finRef: RefObject<HTMLDivElement | null>;
}

export default function AssistantConversation({ messages, enCours, finRef }: AssistantConversationProps) {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] flex items-start gap-2">
                <div className="bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-sm">
                  {m.texte}
                </div>
                <div className="h-7 w-7 rounded-full bg-emerald-600/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-emerald-600" />
                </div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[90%] flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {m.erreur ? (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-4 py-2.5 rounded-2xl rounded-bl-sm">
                    {m.erreur}
                  </div>
                ) : m.resultat ? (
                  <CarteResultat resultat={m.resultat} />
                ) : (
                  <div className="bg-muted text-sm px-4 py-2.5 rounded-2xl rounded-bl-sm">
                    {m.texte}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {enCours && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-muted px-4 py-2.5 rounded-2xl rounded-bl-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Calcul de la réponse à partir de la base...</span>
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>
    </ScrollArea>
  );
}
