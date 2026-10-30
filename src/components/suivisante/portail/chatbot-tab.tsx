'use client';

/**
 * Onglet « Chatbot Externe (Aperçu) » : simulateur mobile (cadre téléphone),
 * messages d'accueil, envoi via /api/portail (résumé des dossiers trouvés,
 * réponse honnête sans invention sinon), actions rapides et barre de saisie.
 * Extrait tel quel de l'ancien monolithe portail-view.tsx.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Send, Globe, CheckCheck, Sparkles, CreditCard, Receipt, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './types';

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'init-1',
    role: 'bot',
    content: 'Bonjour ! Je suis l\'assistant Suivi Santé. Comment puis-je vous aider ?',
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: 'init-2',
    role: 'bot',
    content: 'Vous pouvez me demander le statut d\'un remboursement, le suivi d\'une facture ou vos références de paiement.',
    timestamp: new Date(Date.now() - 60000),
  },
];

const QUICK_ACTIONS = [
  { label: 'Statut remboursement', icon: CreditCard, query: 'Statut de mon remboursement' },
  { label: 'Suivi facture', icon: Receipt, query: 'Suivi de ma facture' },
  { label: 'Référence paiement', icon: FileText, query: 'Ma référence de paiement' },
];

export default function ChatbotTab() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // D'abord chercher via le portail API
      const portailRes = await fetch('/api/portail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: messageText }),
      });
      const portailData = await portailRes.json();

      if (portailData.results && portailData.results.length > 0) {
        // Si on a trouvé des dossiers, afficher le résumé
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: portailData.resume || `J'ai trouvé ${portailData.total} dossier(s) correspondant à votre recherche.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        // Aucun résultat structuré — réponse claire sans invention (pas de LLM externe)
        const errorMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: 'Désolé, je n\'ai pas pu trouver d\'information correspondante. Vérifiez votre numéro de dossier ou nom de bénéficiaire et réessayez.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'bot',
        content: 'Une erreur est survenue. Veuillez réessayer dans un instant.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (query: string) => {
    handleSend(query);
  };

  return (
    <div className="flex justify-center">
      {/* Cadre téléphone */}
      <div className="w-full max-w-sm mx-auto">
        <div className="rounded-[2rem] border-4 border-gray-800 bg-gray-800 overflow-hidden shadow-2xl">
          {/* Encoche */}
          <div className="bg-gray-800 flex justify-center py-1.5">
            <div className="w-20 h-1.5 rounded-full bg-gray-600" />
          </div>

          {/* En-tête chat */}
          <div className="bg-emerald-600 px-4 py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Suivi Santé - Assistant</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-green-300 animate-pulse" />
                <p className="text-[10px] text-emerald-100">En ligne</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Globe className="h-4 w-4 text-emerald-200" />
            </div>
          </div>

          {/* Zone de messages */}
          <div
            ref={scrollRef}
            className="h-[420px] overflow-y-auto bg-[#e5ddd5] p-3 space-y-2"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4cdc4\' fill-opacity=\'0.2\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            }}
          >
            {/* Bulles de messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 shadow-sm',
                  msg.role === 'bot'
                    ? 'bg-white rounded-tl-none'
                    : 'bg-emerald-100 rounded-tr-none'
                )}>
                  <p className={cn(
                    'text-[13px] leading-relaxed whitespace-pre-line',
                    msg.role === 'bot' ? 'text-gray-800' : 'text-gray-900'
                  )}>
                    {msg.content}
                  </p>
                  <div className={cn(
                    'flex items-center gap-1 mt-0.5',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}>
                    <span className="text-[10px] text-gray-400">
                      {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'user' && (
                      <CheckCheck className="h-3 w-3 text-blue-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Indicateur de frappe */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-xl rounded-tl-none px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Boutons d'action rapide */}
          {messages.length <= 2 && (
            <div className="bg-[#e5ddd5] px-3 pb-2 flex gap-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.query)}
                    className="flex-1 flex flex-col items-center gap-1 bg-white rounded-lg px-2 py-2.5 shadow-sm hover:shadow transition-shadow active:scale-95"
                  >
                    <Icon className="h-4 w-4 text-emerald-600" />
                    <span className="text-[10px] font-medium text-foreground text-center leading-tight">{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Barre de saisie */}
          <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Saisissez votre message..."
              className="flex-1 h-9 bg-white border-border rounded-full text-[13px] px-4 focus-visible:ring-emerald-400"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              size="icon"
              aria-label="Envoyer le message"
              className="h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
