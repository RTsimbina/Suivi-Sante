'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Send, Info, Globe, MessageCircle, CheckCheck, Sparkles,
  FileText, CreditCard, Receipt, ArrowRight, Building2, Shield, BarChart3,
  TrendingUp, Users, FolderOpen,
} from 'lucide-react';
import { formatMontant, formatDate, statutLabel, statutColor, typeDossierLabel } from './format';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortailDossier {
  numeroDossier: string;
  statut: string;
  statutLabel: string;
  typeDossier: string;
  dateReception: string;
  montantReclame: number;
  montantPaye?: number;
  datePaiement?: string;
  referencePaiement?: string;
  prestataire?: string;
  motifRejet?: string;
}

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: Date;
}

// ─── Pipeline des étapes (simplifié côté client) ────────────────────────────

const PIPELINE_STEPS = [
  { key: 'RECU', label: 'Réception' },
  { key: 'EN_ANALYSE', label: 'Analyse' },
  { key: 'VALIDE', label: 'Validation' },
  { key: 'EN_PAIEMENT', label: 'Paiement' },
  { key: 'PAYE', label: 'Terminé' },
];

const STATUT_ORDER = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_PAIEMENT', 'PAYE'];

function getPipelineIndex(statut: string): number {
  if (statut === 'EN_COMPTABILITE') return 3;
  if (statut === 'REJETE') return -1;
  const idx = STATUT_ORDER.indexOf(statut);
  return idx >= 0 ? idx : 0;
}

// ─── Composant Pipeline Visuel ──────────────────────────────────────────────

function StatusPipeline({ statut }: { statut: string }) {
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
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                  : i === 1
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
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
                i === 0 ? 'bg-emerald-300' : 'bg-gray-200'
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
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : i === currentIdx
                  ? 'bg-emerald-100 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
            )}>
              {i < currentIdx ? <CheckCheck className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn(
              'text-[10px] w-16 text-center leading-tight',
              i <= currentIdx ? 'text-emerald-700 font-medium' : 'text-muted-foreground'
            )}>
              {step.label}
            </span>
          </div>
          {i < PIPELINE_STEPS.length - 1 && (
            <div className={cn(
              'h-0.5 w-6 mb-4 transition-all',
              i < currentIdx ? 'bg-emerald-500' : 'bg-gray-200'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Carte Dossier Client ──────────────────────────────────────────────────

function DossierClientCard({ dossier }: { dossier: PortailDossier }) {
  const isPaye = dossier.statut === 'PAYE';
  const isRejete = dossier.statut === 'REJETE';
  const isEnCours = !isPaye && !isRejete && dossier.statut !== 'RECU';

  // Déterminer le service actuel
  const serviceActif = (() => {
    switch (dossier.statut) {
      case 'RECU': return 'réception';
      case 'EN_ANALYSE': return 'service médical';
      case 'VALIDE': return 'vérification comptable';
      case 'EN_COMPTABILITE': return 'comptabilité';
      case 'EN_PAIEMENT': return 'paiement';
      default: return 'traitement';
    }
  })();

  return (
    <Card className="border-emerald-100 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{dossier.numeroDossier}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {typeDossierLabel(dossier.typeDossier)} — Reçu le {formatDate(dossier.dateReception)}
            </p>
            {dossier.prestataireLegacy && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Prestataire : {dossier.prestataireLegacy}
              </p>
            )}
          </div>
          <Badge className={cn('text-[10px] shrink-0', statutColor(dossier.statut))}>
            {dossier.statutLabel}
          </Badge>
        </div>

        {/* Pipeline visuel */}
        <StatusPipeline statut={dossier.statut} />

        {/* Montants */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Montant réclamé</p>
            <p className="text-base font-bold text-foreground mt-0.5">{formatMontant(dossier.montantReclame)}</p>
          </div>
          {isPaye && dossier.montantPaye !== undefined && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Montant payé</p>
              <p className="text-base font-bold text-emerald-700 mt-0.5">{formatMontant(dossier.montantPaye)}</p>
            </div>
          )}
        </div>

        {/* Message contextuel */}
        <div className={cn(
          'rounded-lg p-3 text-sm',
          isPaye && 'bg-emerald-50 border border-emerald-100 text-emerald-800',
          isRejete && 'bg-red-50 border border-red-100 text-red-800',
          isEnCours && 'bg-amber-50 border border-amber-100 text-amber-800',
          !isPaye && !isRejete && !isEnCours && 'bg-gray-50 border border-gray-100 text-gray-700'
        )}>
          {isPaye && dossier.montantPaye && dossier.datePaiement && (
            <p>
              ✓ Votre remboursement de <strong>{formatMontant(dossier.montantPaye)}</strong> a été effectué le{' '}
              <strong>{formatDate(dossier.datePaiement)}</strong>.
              {dossier.referencePaiement && (
                <> Référence : <strong>{dossier.referencePaiement}</strong></>
              )}
            </p>
          )}
          {isRejete && (
            <p>
              ✕ Votre dossier a été rejeté.
              {dossier.motifRejet && <> Motif : <strong>{dossier.motifRejet}</strong></>}
              {' '}Pour toute réclamation, veuillez contacter votre service RH.
            </p>
          )}
          {isEnCours && (
            <p>
              ⏳ Votre dossier est en cours de traitement au service{' '}
              <strong>{serviceActif}</strong>.
            </p>
          )}
          {!isPaye && !isRejete && !isEnCours && (
            <p>
              📋 Votre dossier a été reçu et est en attente de prise en charge par nos services.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tab 1 : Portail Client Aperçu ──────────────────────────────────────────

function PortailClientTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortailDossier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await fetch('/api/portail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResults([]);
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError('Erreur de connexion au serveur');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Formulaire de recherche */}
      <Card className="border-emerald-100">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Numéro de dossier ou nom du bénéficiaire
              </label>
              <Input
                placeholder="Ex : DOS-2026-000042 ou Rakoto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-10"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Recherche...' : 'Rechercher'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résultats */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="border-emerald-100">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Skeleton key={j} className="h-8 w-8 rounded-full" />
                  ))}
                </div>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-red-100 bg-red-50/50">
          <CardContent className="p-4">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <Card className="border-gray-100">
          <CardContent className="p-6 text-center">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Aucun dossier trouvé pour votre recherche. Vérifiez votre numéro de dossier ou nom.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {results.length} dossier{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
          </p>
          {results.map((d) => (
            <DossierClientCard key={d.numeroDossier} dossier={d} />
          ))}
        </div>
      )}

      {!searched && !loading && (
        <Card className="border-dashed border-gray-200">
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-foreground">Recherchez votre dossier</p>
            <p className="text-xs text-muted-foreground mt-1">
              Entrez votre numéro de dossier ou votre nom pour suivre l&apos;état de votre remboursement.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 2 : Chatbot Externe Aperçu ─────────────────────────────────────────

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'init-1',
    role: 'bot',
    content: 'Bonjour ! Je suis l\'assistant SmartFlow. Comment puis-je vous aider ?',
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

function ChatbotTab() {
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
        // Sinon, essayer le chat API pour des questions générales
        try {
          const chatRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: messageText }),
          });
          const chatData = await chatRes.json();
          const botMsg: ChatMessage = {
            id: `bot-${Date.now()}`,
            role: 'bot',
            content: chatData.reponse || chatData.error || 'Désolé, je n\'ai pas pu traiter votre demande.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, botMsg]);
        } catch {
          const errorMsg: ChatMessage = {
            id: `bot-${Date.now()}`,
            role: 'bot',
            content: 'Désolé, je n\'ai pas pu trouver d\'information correspondante. Vérifiez votre numéro de dossier ou nom de bénéficiaire et réessayez.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
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
              <p className="text-sm font-semibold text-white">SmartFlow IA - Assistant</p>
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
                    <span className="text-[10px] font-medium text-gray-700 text-center leading-tight">{action.label}</span>
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
              className="flex-1 h-9 bg-white border-gray-200 rounded-full text-[13px] px-4 focus-visible:ring-emerald-400"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              size="icon"
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

// ─── Tab 3 : Portail Sécurisé Entreprise ─────────────────────────────────────

interface PortailKPI {
  totalDossiers: number;
  totalReclame: number;
  totalPaye: number;
  totalEnCours: number;
  totalRejete: number;
  delaiMoyen: number;
}

interface ContratRow {
  id: string;
  societeNom: string;
  typeContrat: string;
  budget: number;
  utilise: number;
  solde: number;
  nbDossiers: number;
}

function PortailSecuriseTab() {
  const [societes, setSocietes] = useState<Array<{id: string; nom: string}>>([]);
  const [selectedSociete, setSelectedSociete] = useState('');
  const [kpis, setKpis] = useState<PortailKPI | null>(null);
  const [contrats, setContrats] = useState<ContratRow[]>([]);
  const [dossiers, setDossiers] = useState<PortailDossier[]>([]);
  const [loading, setLoading] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(false);

  useEffect(() => {
    fetch('/api/societes').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : data.societes || [];
      setSocietes(list.map((s: {id: string; nom: string}) => ({id: s.id, nom: s.nom})));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSociete) {
      setKpis(null);
      setContrats([]);
      setDossiers([]);
      return;
    }
    setLoading(true);
    setKpiLoading(true);

    Promise.all([
      fetch(`/api/dossiers?societeId=${selectedSociete}&limit=200`).then(r => r.json()),
      fetch(`/api/contrats`).then(r => r.json()),
    ]).then(([dossData, contratsData]) => {
      const dossiersList = dossData.dossiers || [];
      setDossiers(dossiersList.map((d: {numeroDossier: string; statut: string; typeDossier: string; dateReception: string; montantReclame: number; montantPaye?: number; datePaiement?: string; referencePaiement?: string; prestataire?: string; motifRejet?: string}) => ({
        numeroDossier: d.numeroDossier,
        statut: d.statut,
        statutLabel: statutLabel(d.statut),
        typeDossier: d.typeDossier,
        dateReception: d.dateReception,
        montantReclame: d.montantReclame,
        montantPaye: d.montantPaye,
        datePaiement: d.datePaiement,
        referencePaiement: d.referencePaiement,
        prestataire: d.prestataire,
        motifRejet: d.motifRejet,
      })));

      const societeDossiers = dossiersList;
      const totalReclame = societeDossiers.reduce((s: number, d: {montantReclame: number}) => s + d.montantReclame, 0);
      const totalPaye = societeDossiers.filter((d: {statut: string; montantPaye?: number}) => d.statut === 'PAYE').reduce((s: number, d: {montantPaye?: number}) => s + (d.montantPaye || 0), 0);
      const enCours = societeDossiers.filter((d: {statut: string}) => !['PAYE', 'REJETE'].includes(d.statut)).length;
      const rejete = societeDossiers.filter((d: {statut: string}) => d.statut === 'REJETE').length;
      setKpis({
        totalDossiers: societeDossiers.length,
        totalReclame,
        totalPaye,
        totalEnCours: enCours,
        totalRejete: rejete,
        delaiMoyen: 0,
      });

      const societeContrats = (contratsData.contrats || []).filter((c: {societeId?: string}) => c.societeId === selectedSociete);
      setContrats(societeContrats.map((c: {id: string; societe?: {nom: string}; typeContrat?: string; budgetAnnuel?: number; appelsFonds?: Array<{montant: number}>; _count?: {dossiers: number}}) => ({
        id: c.id,
        societeNom: c.societe?.nom || '',
        typeContrat: c.typeContrat || 'Standard',
        budget: c.budgetAnnuel || 0,
        utilise: (c.appelsFonds || []).reduce((s: number, a: {montant: number}) => s + a.montant, 0),
        solde: (c.budgetAnnuel || 0) - (c.appelsFonds || []).reduce((s: number, a: {montant: number}) => s + a.montant, 0),
        nbDossiers: c._count?.dossiers || 0,
      })));
    }).catch(() => {}).finally(() => {
      setLoading(false);
      setKpiLoading(false);
    });
  }, [selectedSociete]);

  return (
    <div className="space-y-4">
      <Card className="border-emerald-100">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-600" />
                Sélectionnez votre entreprise
              </label>
              <select
                value={selectedSociete}
                onChange={(e) => setSelectedSociete(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="">Choisir une entreprise...</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedSociete && (
        <Card className="border-dashed border-gray-200">
          <CardContent className="p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-foreground">Sélectionnez votre entreprise</p>
            <p className="text-xs text-muted-foreground mt-1">
              Choisissez votre entreprise ci-dessus pour accéder à vos KPIs, contrats et dossiers.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedSociete && (
        <>
          {kpiLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({length: 6}).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : kpis && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <Card className="border-emerald-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50"><FolderOpen className="h-4 w-4 text-emerald-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Total dossiers</span>
                  </div>
                  <p className="text-2xl font-bold">{kpis.totalDossiers}</p>
                </CardContent>
              </Card>
              <Card className="border-sky-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-sky-50"><BarChart3 className="h-4 w-4 text-sky-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Montant réclamé</span>
                  </div>
                  <p className="text-2xl font-bold">{formatMontant(kpis.totalReclame)}</p>
                </CardContent>
              </Card>
              <Card className="border-teal-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-teal-50"><TrendingUp className="h-4 w-4 text-teal-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Montant payé</span>
                  </div>
                  <p className="text-2xl font-bold text-teal-700">{formatMontant(kpis.totalPaye)}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-50"><CreditCard className="h-4 w-4 text-amber-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">En cours</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{kpis.totalEnCours}</p>
                </CardContent>
              </Card>
              <Card className="border-red-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-red-50"><Receipt className="h-4 w-4 text-red-500" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Rejetés</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{kpis.totalRejete}</p>
                </CardContent>
              </Card>
              <Card className="border-violet-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-violet-50"><Users className="h-4 w-4 text-violet-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Taux paiement</span>
                  </div>
                  <p className="text-2xl font-bold text-violet-700">
                    {kpis.totalDossiers > 0 ? ((kpis.totalPaye / kpis.totalReclame) * 100).toFixed(1) + '%' : '\u2014'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {contrats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  Contrats & Solde
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium text-xs">Type</th>
                        <th className="pb-2 font-medium text-xs text-right">Budget</th>
                        <th className="pb-2 font-medium text-xs text-right">Utilisé</th>
                        <th className="pb-2 font-medium text-xs text-right">Solde</th>
                        <th className="pb-2 font-medium text-xs text-center">Dossiers</th>
                        <th className="pb-2 font-medium text-xs text-right">Taux utilisation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contrats.map((c) => {
                        const tauxUtil = c.budget > 0 ? (c.utilise / c.budget) * 100 : 0;
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 text-xs font-medium">{c.typeContrat}</td>
                            <td className="py-2 text-xs text-right">{formatMontant(c.budget)}</td>
                            <td className="py-2 text-xs text-right">{formatMontant(c.utilise)}</td>
                            <td className="py-2 text-xs text-right font-bold" style={{color: c.solde < c.budget * 0.2 ? '#dc2626' : '#059669'}}>
                              {formatMontant(c.solde)}
                            </td>
                            <td className="py-2 text-xs text-center">
                              <Badge variant="outline" className="text-[10px]">{c.nbDossiers}</Badge>
                            </td>
                            <td className="py-2 text-xs text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', tauxUtil > 80 ? 'bg-red-500' : tauxUtil > 50 ? 'bg-amber-500' : 'bg-emerald-500')}
                                    style={{width: `${Math.min(tauxUtil, 100)}%`}}
                                  />
                                </div>
                                <span className="text-[10px]">{tauxUtil.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Dossiers de l&apos;entreprise ({dossiers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : dossiers.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun dossier trouvé pour cette entreprise.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dossiers.slice(0, 50).map((d) => (
                    <DossierClientCard key={d.numeroDossier} dossier={d} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Composant Principal ────────────────────────────────────────────────────

export default function PortailView() {
  return (
    <div className="space-y-4">
      {/* Bannière d'information */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
          <Info className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-800">
            Aperçu du portail client
          </p>
          <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
            En production, ce portail est accessible via{' '}
            <strong>WhatsApp</strong>, <strong>Telegram</strong> et <strong>Messenger</strong>.
            Les clients peuvent suivre leurs dossiers de remboursement en temps réel.
          </p>
        </div>
      </div>

      {/* Onglets */}
      <Tabs defaultValue="portail" className="w-full">
        <TabsList className="bg-emerald-50">
          <TabsTrigger
            value="portail"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white gap-2"
          >
            <Globe className="h-4 w-4" />
            Portail Client (Aperçu)
          </TabsTrigger>
          <TabsTrigger
            value="chatbot"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Chatbot Externe (Aperçu)
          </TabsTrigger>
          <TabsTrigger
            value="securise"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white gap-2"
          >
            <Shield className="h-4 w-4" />
            Portail Sécurisé
          </TabsTrigger>
        </TabsList>

        <TabsContent value="portail" className="mt-4">
          <PortailClientTab />
        </TabsContent>

        <TabsContent value="chatbot" className="mt-4">
          <ChatbotTab />
        </TabsContent>

        <TabsContent value="securise" className="mt-4">
          <PortailSecuriseTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}