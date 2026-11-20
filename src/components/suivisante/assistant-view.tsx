'use client';

/**
 * Assistant IA — page d'assemblage (refactoring P2 : le monolithe de 641
 * lignes est découpé dans le dossier `assistant/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-assistant (catalogue du rôle, messages,
 *    question active, paramètres, envoi) et la ref de défilement ;
 *  - affichage transverse : chargement, erreur, bandeau sécurité ;
 *  - délégation : catalogue (desktop + compact portail), conversation et
 *    barre de question active.
 *
 * Aucune donnée n'est envoyée à un service d'IA externe : les réponses sont
 * calculées directement depuis la base, dans le périmètre du rôle.
 */
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ShieldCheck, TriangleAlert, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CatalogueListe, AssistantCatalogueCompact } from './assistant/assistant-catalogue';
import AssistantConversation from './assistant/assistant-conversation';
import AssistantBarreQuestion from './assistant/assistant-barre-question';
import { useAssistant } from './assistant/use-assistant';

export default function AssistantView({ compact = false }: { compact?: boolean }) {
  const assistant = useAssistant();
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistant.messages, assistant.enCours]);

  if (assistant.chargement) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement de l&apos;assistant...</p>
        </div>
      </div>
    );
  }

  if (assistant.erreur) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-md p-6 text-center">
          <TriangleAlert className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-muted-foreground">{assistant.erreur}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0', compact ? 'flex-col' : '')}>
      {/* ─── Colonne catalogue (desktop) ─── */}
      {!compact && (
        <aside className="w-72 shrink-0 border-r flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold">Catalogue de questions</h3>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={assistant.recherche}
                onChange={(e) => assistant.setRecherche(e.target.value)}
                placeholder="Rechercher une question..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            {assistant.catalogue?.role && (
              <Badge variant="outline" className="text-[10px] w-fit border-brand-300 dark:border-brand-800 text-brand-600 dark:text-brand-400">
                {assistant.catalogue.total} questions pour votre rôle
              </Badge>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <CatalogueListe
              categories={assistant.categories}
              questionActiveId={assistant.questionActive?.id ?? null}
              choisirQuestion={assistant.choisirQuestion}
            />
          </ScrollArea>
        </aside>
      )}

      {/* ─── Sélecteur compact (portail) ─── */}
      {compact && (
        <AssistantCatalogueCompact
          questionActive={assistant.questionActive}
          totalQuestions={assistant.catalogue?.total ?? 0}
          recherche={assistant.recherche}
          onRechercheChange={assistant.setRecherche}
          categories={assistant.categories}
          questionActiveId={assistant.questionActive?.id ?? null}
          onChoisir={assistant.choisirQuestion}
        />
      )}

      {/* ─── Zone conversation ─── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Bandeau sécurité */}
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 shrink-0">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
          <p className="text-[11px] text-muted-foreground">
            Réponses calculées directement depuis la base de la plateforme — sans service d&apos;IA externe. Vos données restent dans Suivi Santé.
          </p>
        </div>

        <AssistantConversation
          messages={assistant.messages}
          enCours={assistant.enCours}
          finRef={finRef}
        />

        {/* ─── Barre de question active + paramètres ─── */}
        <AssistantBarreQuestion
          questionActive={assistant.questionActive}
          parametres={assistant.parametres}
          options={assistant.catalogue?.options ?? {}}
          requisComplets={assistant.requisComplets}
          enCours={assistant.enCours}
          onParametreChange={assistant.changerParametre}
          onPoser={assistant.poserQuestion}
          onFermer={assistant.fermerQuestion}
        />
      </div>
    </div>
  );
}
