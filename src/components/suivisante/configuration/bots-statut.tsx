'use client';

/**
 * Présentateur des cartes de statut des bots de communication (refactoring
 * P2 — extrait du monolithe configuration-view.tsx) : WhatsApp, Telegram,
 * Messenger avec badge actif/détail d'erreur et compteur de messages.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { BotStatus } from './types';

interface BotsStatutProps {
  bots: BotStatus[];
  botStatus: Record<string, { actif: boolean; details?: string }>;
}

export default function BotsStatut({ bots, botStatus }: BotsStatutProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {bots.map(bot => {
        const Icon = bot.icon;
        return (
          <Card key={bot.canal}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${bot.couleur}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{bot.nom}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {bot.actif ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Actif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground" title={botStatus?.[bot.canal.toLowerCase()]?.details}>
                        <XCircle className="h-3 w-3 mr-1" /> {botStatus?.[bot.canal.toLowerCase()]?.details || 'Non configuré'}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">{bot.messagesTotal} msg</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
