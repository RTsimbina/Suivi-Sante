'use client';

/**
 * Présentateur de l'historique des conversations bots (refactoring P2 —
 * extrait du monolithe configuration-view.tsx) : filtres par canal,
 * rafraîchissement, liste question/réponse avec suppression confirmée.
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, MessageSquare, Trash2, XCircle, Loader2, Settings } from 'lucide-react';
import { CANAL_COLORS, formatDate } from './types';
import type { MessageBot } from './types';

interface BotsHistoriqueProps {
  messages: MessageBot[];
  loading: boolean;
  filterCanal: string;
  onFilterCanalChange: (canal: string) => void;
  deleteConfirm: string | null;
  onDeleteConfirmChange: (id: string | null) => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}

export default function BotsHistorique({
  messages,
  loading,
  filterCanal,
  onFilterCanalChange,
  deleteConfirm,
  onDeleteConfirmChange,
  onRefresh,
  onDelete,
}: BotsHistoriqueProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-emerald-600" />
          Historique des conversations bots
        </h3>
        <div className="flex gap-2">
          {['', 'WHATSAPP', 'TELEGRAM', 'MESSENGER'].map(c => (
            <Button
              key={c}
              variant={filterCanal === c ? 'default' : 'outline'}
              size="sm"
              className={`text-[11px] h-7 ${filterCanal === c ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              onClick={() => onFilterCanalChange(c)}
            >
              {c || 'Tous'}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun message bot reçu</p>
              <p className="text-xs mt-1">Les messages des assurés et prestataires apparaîtront ici</p>
            </div>
          ) : (
            <div className="divide-y">
              {messages.map(msg => (
                <div key={msg.id} className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{msg.expeditieurNom}</span>
                        <Badge variant="outline" className={`text-[10px] ${CANAL_COLORS[msg.canal] || ''}`}>
                          {msg.canal}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-2.5 mb-2 border border-emerald-100 dark:border-emerald-800">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-0.5">Question</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-2.5 border border-blue-100">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">Réponse Suivi Santé</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{msg.reponse}</p>
                      </div>
                    </div>
                    {deleteConfirm === msg.id ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2" onClick={() => onDelete(msg.id)}>Oui</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1" onClick={() => onDeleteConfirmChange(null)} aria-label="Annuler la suppression">
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0" onClick={() => onDeleteConfirmChange(msg.id)} aria-label="Supprimer ce message">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
