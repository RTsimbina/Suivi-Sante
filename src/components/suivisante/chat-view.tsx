'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import {
  Send, Bot, User, Loader2, Search, CheckCircle2, Clock, AlertTriangle,
  XCircle, ChevronRight, Circle, FileText, CreditCard, ArrowRight,
  ClipboardCheck, Eye, Ban, Wallet, Filter, X, ChevronsUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statutLabel, statutColor, typeDossierLabel, formatDate, formatMontant } from './format';

/* ─────────── Types ─────────── */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type EtapeStatut = 'termine' | 'en_cours' | 'en_attente' | 'saute';

interface Etape {
  nom: string;
  statut: EtapeStatut;
  date: string | Date | null;
  gestionnaire: string | null;
  details: string;
}

interface PaiementInfo {
  montantReclame: number;
  montantValide: number | null;
  ecartMontant: number | null;
  tauxEcart: number | null;
  ticketModerateur: number;
  partPatient: number;
  partEntreprise: number;
  montantPaye: number;
  datePaiement: string | Date | null;
  referencePaiement: string | null;
  statutPaiement: string;
}

interface SuiviResult {
  id: string;
  numeroDossier: string;
  beneficiaire: string;
  typeDossier: string;
  societeNom: string;
  statut: string;
  dateReception: string;
  etapes: Etape[];
  delais: { reception: number; technique: number | null; comptabilite: number | null; total: number | null };
  alertes: string[];
  paiement: PaiementInfo;
}

const suggestedQuestions = [
  'Combien de dossiers sont bloqués ?',
  'Quel gestionnaire est le plus performant ce mois ?',
  'Quel est le montant remboursé à TELMA ce mois ?',
  'Quel est le taux de rejet actuel ?',
  'Quels dossiers sont en retard à la comptabilité ?',
];

/* ─────────── Composant étape de traitement ─────────── */

function EtapePipeline({ etape, isLast, nextStatut }: { etape: Etape; isLast: boolean; nextStatut?: EtapeStatut }) {
  const iconMap: Record<EtapeStatut, React.ReactNode> = {
    termine: <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />,
    en_cours: <Loader2 className="size-5 text-sky-600 animate-spin shrink-0" />,
    en_attente: <Circle className="size-5 text-muted-foreground/40 shrink-0" />,
    saute: <XCircle className="size-5 text-muted-foreground/40 shrink-0" />,
  };

  const cardMap: Record<EtapeStatut, string> = {
    termine: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
    en_cours: 'border-sky-400 bg-sky-50 dark:bg-sky-950/50 ring-1 ring-sky-200',
    en_attente: 'border-border bg-muted/50',
    saute: 'border-dashed border-muted-foreground/30 bg-muted/30 opacity-60',
  };

  // Couleur du trait vertical entre cette étape et la suivante
  const connectorColor =
    !isLast && nextStatut
      ? etape.statut === 'termine' && nextStatut === 'termine'
        ? 'bg-emerald-400 dark:bg-emerald-500'
        : etape.statut === 'termine' && (nextStatut === 'en_cours' || nextStatut === 'en_attente')
          ? 'bg-emerald-300 dark:bg-emerald-700'
          : 'bg-muted-foreground/20'
      : 'bg-muted-foreground/20';

  const isSaute = etape.statut === 'saute';

  return (
    <div className="flex gap-3">
      {/* Colonne icônes + trait vertical */}
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center size-7 shrink-0">
          {iconMap[etape.statut]}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[12px] my-0.5 rounded-full ${connectorColor}`} />
        )}
      </div>

      {/* Contenu de l'étape */}
      <div className={`flex-1 rounded-lg border p-3 ${isSaute ? 'border-dashed' : ''} ${cardMap[etape.statut]}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`font-semibold text-sm ${isSaute ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{etape.nom}</span>
          {etape.date && (
            <span className="text-xs text-muted-foreground">
              {formatDate(etape.date)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{etape.details}</p>
        {etape.gestionnaire && !isSaute && (
          <p className="text-xs text-muted-foreground mt-1">
            Gestionnaire : <span className="font-medium text-foreground">{etape.gestionnaire}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────── Composant fiche paiement ─────────── */

function FichePaiement({ p, statut }: { p: PaiementInfo; statut: string }) {
  const paiementStatutLabel: Record<string, { label: string; class: string }> = {
    PAYE: { label: 'Soldé', class: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    EN_COURS: { label: 'En cours de règlement', class: 'bg-sky-100 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800' },
    EN_ATTENTE: { label: 'En attente', class: 'bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    NON_APPLICABLE: { label: 'Non applicable', class: 'bg-muted text-muted-foreground border-border' },
  };

  const ps = paiementStatutLabel[p.statutPaiement] || paiementStatutLabel.EN_ATTENTE;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="size-4 text-emerald-600" />
          Détails du paiement
        </h4>
        <Badge variant="outline" className={ps.class}>{ps.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Montant réclamé</span>
          <span className="font-medium">{formatMontant(p.montantReclame)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Montant validé</span>
          <span className="font-medium">{p.montantValide ? formatMontant(p.montantValide) : '—'}</span>
        </div>
        {p.ecartMontant !== null && p.ecartMontant > 0 && (
          <div className="flex justify-between col-span-2">
            <span className="text-amber-600">Écart</span>
            <span className="font-medium text-amber-600">
              {formatMontant(p.ecartMontant)} ({p.tauxEcart}%)
            </span>
          </div>
        )}
        <Separator className="col-span-2 my-1" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ticket modérateur</span>
          <span className="font-medium">{p.ticketModerateur ? formatMontant(p.ticketModerateur) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Part patient</span>
          <span className="font-medium">{p.partPatient ? formatMontant(p.partPatient) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Part entreprise</span>
          <span className="font-medium">{p.partEntreprise ? formatMontant(p.partEntreprise) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Montant payé</span>
          <span className="font-bold text-emerald-600">{p.montantPaye ? formatMontant(p.montantPaye) : '—'}</span>
        </div>
      </div>

      {p.datePaiement && (
        <p className="text-xs text-muted-foreground">
          Date de paiement : <span className="font-medium text-foreground">{formatDate(p.datePaiement)}</span>
          {p.referencePaiement && (
            <> — Réf : <span className="font-medium text-foreground">{p.referencePaiement}</span></>
          )}
        </p>
      )}
    </div>
  );
}

/* ─────────── Composant carte résultat de suivi ─────────── */

function SuiviCard({ r }: { r: SuiviResult }) {
  return (
    <Card className="p-4 space-y-4">
      {/* En-tête du dossier */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold text-foreground">{r.numeroDossier}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {r.beneficiaire} — {r.societeNom} — {typeDossierLabel(r.typeDossier)}
          </p>
        </div>
        <Badge variant="outline" className={statutColor(r.statut)}>
          {statutLabel(r.statut)}
        </Badge>
      </div>

      {/* Alertes */}
      {r.alertes.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40/50 p-3 space-y-1">
          {r.alertes.map((a, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Pipeline de traitement */}
      <div>
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <FileText className="size-4 text-emerald-600" />
          Situation du traitement
        </h4>
        <div>
          {r.etapes.map((etape, idx) => (
            <EtapePipeline
              key={idx}
              etape={etape}
              isLast={idx === r.etapes.length - 1}
              nextStatut={idx < r.etapes.length - 1 ? r.etapes[idx + 1].statut : undefined}
            />
          ))}
        </div>
      </div>

      {/* Détails du paiement */}
      <FichePaiement p={r.paiement} statut={r.statut} />

      {/* Délais */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Depuis réception : <strong className="text-foreground">{r.delais.reception}j</strong></span>
        {r.delais.technique !== null && (
          <span>Depuis technique : <strong className="text-foreground">{r.delais.technique}j</strong></span>
        )}
        {r.delais.comptabilite !== null && (
          <span>Depuis comptabilité : <strong className="text-foreground">{r.delais.comptabilite}j</strong></span>
        )}
        {r.delais.total !== null && (
          <span>Délai total : <strong className="text-foreground">{r.delais.total}j</strong></span>
        )}
      </div>
    </Card>
  );
}

/* ─────────── Onglet Suivi Dossier & Paiement ─────────── */

function SuiviTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SuiviResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtres dropdown
  const [filterStatut, setFilterStatut] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSociete, setFilterSociete] = useState('');

  // Options pour les dropdowns
  const [options, setOptions] = useState<{ societes: { id: string; nom: string }[]; statuts: string[]; types: string[] }>({ societes: [], statuts: [], types: [] });

  useEffect(() => {
    fetch('/api/dossiers/suivi?mode=options')
      .then((r) => r.json())
      .then((data) => setOptions(data))
      .catch(() => {});
  }, []);

  const hasAnyFilter = query.trim() || filterStatut || filterType || filterSociete;
  const activeFilterCount = [!!query.trim(), !!filterStatut, !!filterType, !!filterSociete].filter(Boolean).length;

  function clearFilters() {
    setQuery('');
    setFilterStatut('');
    setFilterType('');
    setFilterSociete('');
    setSearched(false);
    setResults([]);
  }

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    if (!hasAnyFilter || loading) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (filterStatut) params.set('statut', filterStatut);
      if (filterType) params.set('type', filterType);
      if (filterSociete) params.set('societeId', filterSociete);
      const res = await fetch(`/api/dossiers/suivi?${params.toString()}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barre de recherche multi-critères */}
      <div className="p-4 border-b bg-background space-y-3">
        {/* Ligne 1 : Recherche texte + Bouton */}
        <form onSubmit={(e) => handleSearch(e)} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="N° dossier, bénéficiaire ou société..."
              disabled={loading}
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={!hasAnyFilter || loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="ml-2 hidden sm:inline">Rechercher</span>
          </Button>
        </form>

        {/* Ligne 2 : Filtres déroulants */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3.5" />
            <span>Filtres :</span>
          </div>

          <Select value={filterStatut} onValueChange={(v) => { setFilterStatut(v === '__all__' ? '' : v); }}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Statut du dossier" />
            </SelectTrigger>
            <SelectContent>
              {options.statuts.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {statutLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => { setFilterType(v === '__all__' ? '' : v); }}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue placeholder="Type de dossier" />
            </SelectTrigger>
            <SelectContent>
              {options.types.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {typeDossierLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSociete} onValueChange={(v) => { setFilterSociete(v === '__all__' ? '' : v); }}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Société" />
            </SelectTrigger>
            <SelectContent>
              {options.societes.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={clearFilters}>
              <X className="size-3 mr-1" />
              Réinitialiser ({activeFilterCount})
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Combinez la recherche texte avec les filtres pour affiner les résultats. Au moins un critère est requis.
        </p>
      </div>

      {/* Zone de résultats */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center min-h-full py-12">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 mb-4">
              <FileText className="size-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Suivi de Traitement & Paiement
            </h2>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Suivez en temps réel l&apos;avancement du traitement de chaque dossier de santé et l&apos;état des remboursements ou règlements de factures.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full text-sm">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <ClipboardCheck className="size-3.5 text-muted-foreground" />
                  Reçu
                </p>
                <p className="text-xs text-muted-foreground">
                  Le dossier a été reçu et est en attente de prise en charge par le service concerné.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Eye className="size-3.5 text-amber-600" />
                  En analyse
                </p>
                <p className="text-xs text-muted-foreground">
                  Le dossier est en cours d&apos;examen par le service médical ou technique.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  Validé
                </p>
                <p className="text-xs text-muted-foreground">
                  Le dossier a été approuvé et transmis à la comptabilité pour règlement.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <CreditCard className="size-3.5 text-orange-600" />
                  En comptabilité
                </p>
                <p className="text-xs text-muted-foreground">
                  Le dossier est en cours de vérification comptable avant le paiement.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Wallet className="size-3.5 text-sky-600" />
                  En paiement
                </p>
                <p className="text-xs text-muted-foreground">
                  Le remboursement ou le règlement est en cours de traitement bancaire.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <ArrowRight className="size-3.5 text-teal-600" />
                  Dossier payé
                </p>
                <p className="text-xs text-muted-foreground">
                  Le remboursement client ou le règlement du prestataire médical a été effectué.
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1 sm:col-span-2 lg:col-span-3">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Ban className="size-3.5 text-red-500" />
                  Rejeté
                </p>
                <p className="text-xs text-muted-foreground">
                  Le dossier a été refusé. Un motif de rejet est communiqué pour correction ou recours.
                </p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-muted-foreground">Recherche en cours...</span>
          </div>
        )}

        {searched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Aucun dossier trouvé pour ces critères.</p>
          </div>
        )}

        {results.map((r) => (
          <SuiviCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}

/* ─────────── Onglet Chat Assistant IA ─────────── */

/* ─────────── Onglet Chat Assistant IA ─────────── */

function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data.erreur || data.error || data.detail || `Erreur ${res.status}`;
        throw new Error(`${res.status}:${errMsg}`);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reponse ?? data.response ?? data.message ?? data.content ?? 'Réponse reçue.',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CHAT UI]', msg);
      let userFriendlyMsg = 'Désolé, une erreur est survenue. Veuillez réessayer.';
      if (msg.includes('401')) {
        userFriendlyMsg = "La clé API IA n'est pas configurée correctement (erreur 401). Veuillez contacter l'administrateur.";
      } else if (msg.includes('503') && msg.includes('non configuré')) {
        userFriendlyMsg = 'Le service IA n\'est pas encore configuré. L\'administrateur doit ajouter les variables LLM_BASE_URL et LLM_API_KEY dans les paramètres du serveur.';
      } else if (msg.includes('502') || msg.includes('503')) {
        userFriendlyMsg = 'Le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.';
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: userFriendlyMsg },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSuggestedQuestion(question: string) {
    setInput(question);
    const userMessage: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`${res.status}:${data.erreur || data.error || data.detail || 'Erreur serveur'}`);
        }
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.reponse ?? data.response ?? data.message ?? data.content ?? 'Réponse reçue.',
        };
        setMessages((prev) => [...prev, assistantMessage]);
      })
      .catch((err) => {
        console.error('[CHAT UI]', err);
        const msg = err.message || 'Erreur inconnue';
        let userFriendlyMsg = 'Désolé, une erreur est survenue. Veuillez réessayer.';
        if (msg.includes('401')) {
          userFriendlyMsg = "La clé API IA n'est pas configurée correctement (erreur 401). Veuillez contacter l'administrateur.";
        } else if (msg.includes('503') && msg.includes('non configuré')) {
          userFriendlyMsg = 'Le service IA n\'est pas encore configuré. L\'administrateur doit ajouter les variables LLM_BASE_URL et LLM_API_KEY dans les paramètres du serveur.';
        } else if (msg.includes('502') || msg.includes('503')) {
          userFriendlyMsg = 'Le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.';
        }
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: userFriendlyMsg },
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
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center min-h-full py-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 mb-4">
              <Bot className="size-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Assistant IA</h2>
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

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mt-1">
                <Bot className="size-4 text-emerald-600" />
              </div>
            )}
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[75%] whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 mt-1">
                <User className="size-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mt-1">
              <Bot className="size-4 text-emerald-600" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">L&apos;assistant réfléchit...</span>
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
            placeholder="Posez votre question..."
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
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ─────────── Composant principal avec onglets ─────────── */

export default function ChatView() {
  const [activeTab, setActiveTab] = useState<'chat' | 'suivi'>('suivi');

  return (
    <div className="flex h-full flex-col">
      {/* Onglets */}
      <div className="flex border-b bg-background px-4 pt-3">
        <button
          onClick={() => setActiveTab('suivi')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
            activeTab === 'suivi'
              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="size-4" />
          <span>Suivi Traitement & Paiement</span>
          {activeTab === 'suivi' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
            activeTab === 'chat'
              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="size-4" />
          <span>Assistant IA</span>
          {activeTab === 'chat' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t" />
          )}
        </button>
      </div>

      {/* Contenu de l'onglet actif */}
      <div className="flex-1 min-h-0">
        {activeTab === 'suivi' ? <SuiviTab /> : <ChatTab />}
      </div>
    </div>
  );
}