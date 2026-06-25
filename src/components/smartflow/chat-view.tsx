'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const suggestedQuestions = [
  'Combien de dossiers sont bloqués ?',
  'Quel gestionnaire est le plus performant ce mois ?',
  'Quel est le montant remboursé à TELMA ce mois ?',
  'Quel est le taux de rejet actuel ?',
  'Quels dossiers sont en retard à la comptabilité ?',
];

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`Erreur ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reponse ?? data.response ?? data.message ?? data.content ?? 'Réponse reçue.',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Désolé, une erreur est survenue lors du traitement de votre question. Veuillez réessayer.',
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSuggestedQuestion(question: string) {
    setInput(question);
    // Déclencher l'envoi automatiquement
    const syntheticEvent = {
      preventDefault: () => {},
    } as FormEvent;
    // On simule l'envoi direct
    const userMessage: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const data = await res.json();
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.reponse ?? data.response ?? data.message ?? data.content ?? 'Réponse reçue.',
        };
        setMessages((prev) => [...prev, assistantMessage]);
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Désolé, une erreur est survenue. Veuillez réessayer.',
          },
        ]);
      })
      .finally(() => {
        setLoading(false);
        inputRef.current?.focus();
      });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Zone de messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Questions suggérées - affichées uniquement quand aucun message */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center min-h-full py-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 mb-4">
              <Bot className="size-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Assistant IA SmartFlow
            </h2>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Posez vos questions sur les dossiers, les remboursements, les statistiques ou tout
              autre sujet lié à la gestion.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {suggestedQuestions.map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  className="text-xs text-left h-auto py-2 px-3 max-w-full leading-snug"
                  onClick={() => handleSuggestedQuestion(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Icône pour l'assistant */}
            {msg.role === 'assistant' && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mt-1">
                <Bot className="size-4 text-emerald-600" />
              </div>
            )}

            {/* Bulle de message */}
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[75%] whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>

            {/* Icône pour l'utilisateur */}
            {msg.role === 'user' && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 mt-1">
                <User className="size-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Indicateur de chargement */}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mt-1">
              <Bot className="size-4 text-emerald-600" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  L&apos;assistant réfléchit…
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie */}
      <div className="sticky bottom-0 border-t bg-background p-4">
        <form onSubmit={handleSubmit} className="flex flex-row items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question…"
            disabled={loading}
            className="flex-1"
            aria-label="Saisir une question"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            aria-label="Envoyer la question"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}