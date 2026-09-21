'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Bot, User, Loader2, Search, ShieldCheck, Info, TriangleAlert,
  Coins, Hash, Table2, BarChart3, ListChecks, Gauge, MessageCircleQuestion, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatMontant, formatDate } from './format';
import type { AssistantResult, ParamKey, ResultColonne } from '@/lib/assistant/types';

// ─── Assistant IA — Questions prédéfinies par rôle ───────────────────────────
// Interface conversationnelle : l'utilisateur choisit une question dans son
// catalogue (décidé par son rôle côté serveur), renseigne d'éventuels
// paramètres, et reçoit une réponse calculée directement depuis la base.
// Aucune donnée n'est envoyée à un service d'IA externe.

interface QuestionPublique {
  id: string;
  categorie: string;
  question: string;
  params: { key: ParamKey; label: string; required?: boolean; aide?: string }[];
  presentation: string;
  note: string | null;
}

interface CatalogueResponse {
  role: string;
  total: number;
  questions: QuestionPublique[];
  options: Partial<Record<string, { id: string; label: string }[]>>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  texte?: string;
  resultat?: AssistantResult;
  erreur?: string;
}

const PERIODE_PRESETS = [
  { id: 'AUJOURDHUI', label: "Aujourd'hui" },
  { id: '7_DERNIERS_JOURS', label: '7 derniers jours' },
  { id: '30_DERNIERS_JOURS', label: '30 derniers jours' },
  { id: 'CE_MOIS', label: 'Ce mois' },
  { id: 'MOIS_DERNIER', label: 'Mois dernier' },
  { id: 'TRIMESTRE_COURANT', label: 'Trimestre courant' },
  { id: '90_DERNIERS_JOURS', label: '90 derniers jours' },
  { id: 'ANNEE_COURANTE', label: 'Année courante' },
  { id: 'ANNEE_DERNIERE', label: 'Année dernière' },
  { id: 'PERSONNALISEE', label: 'Personnalisée' },
];

export default function AssistantView({ compact = false }: { compact?: boolean }) {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionActive, setQuestionActive] = useState<QuestionPublique | null>(null);
  const [parametres, setParametres] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Charger le catalogue du rôle (côté serveur : questions + options filtrées)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/assistant');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErreur(data.erreur || 'Impossible de charger l\u2019assistant.');
          return;
        }
        const data: CatalogueResponse = await res.json();
        setCatalogue(data);
        setMessages([
          {
            id: 'bienvenue',
            role: 'assistant',
            texte: `Bonjour ! Je suis votre assistant. Choisissez une question dans la liste : je répondrai directement à partir des données de la plateforme, en respectant strictement votre rôle et votre périmètre. (${data.total} questions disponibles)`,
          },
        ]);
      } catch {
        setErreur('Erreur réseau lors du chargement de l\u2019assistant.');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, enCours]);

  const categories = useMemo(() => {
    if (!catalogue) return [];
    const filtree = recherche.trim()
      ? catalogue.questions.filter((q) =>
          q.question.toLowerCase().includes(recherche.trim().toLowerCase()) ||
          q.categorie.toLowerCase().includes(recherche.trim().toLowerCase()))
      : catalogue.questions;
    const map = new Map<string, QuestionPublique[]>();
    for (const q of filtree) {
      const list = map.get(q.categorie) ?? [];
      list.push(q);
      map.set(q.categorie, list);
    }
    return [...map.entries()];
  }, [catalogue, recherche]);

  const choisirQuestion = useCallback((q: QuestionPublique) => {
    setQuestionActive(q);
    setParametres({});
    setCatalogueOuvert(false);
  }, []);

  const poserQuestion = useCallback(async () => {
    if (!questionActive || enCours) return;
    // Vérifier les paramètres requis
    for (const p of questionActive.params) {
      if (p.required && !parametres[p.key]?.trim()) {
        return; // le bouton est désactivé mais double sécurité
      }
    }
    const corps: Record<string, string> = {};
    for (const p of questionActive.params) {
      const val = parametres[p.key];
      if (val) corps[p.key] = val;
    }

    const idUser = `u-${Date.now()}`;
    const idBot = `b-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: idUser, role: 'user', texte: questionActive.question },
    ]);
    setEnCours(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: questionActive.id, params: corps }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { id: idBot, role: 'assistant', erreur: data.erreur || 'Erreur lors du traitement de la question.' }]);
      } else {
        setMessages((prev) => [...prev, { id: idBot, role: 'assistant', resultat: data as AssistantResult }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: idBot, role: 'assistant', erreur: 'Erreur réseau. Veuillez réessayer.' }]);
    } finally {
      setEnCours(false);
    }
  }, [questionActive, parametres, enCours]);

  if (chargement) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement de l&apos;assistant...</p>
        </div>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-md p-6 text-center">
          <TriangleAlert className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-muted-foreground">{erreur}</p>
        </Card>
      </div>
    );
  }

  const requisComplets =
    questionActive &&
    questionActive.params.filter((p) => p.required).every((p) => parametres[p.key]?.trim());

  return (
    <div className={cn('flex h-full min-h-0', compact ? 'flex-col' : '')}>
      {/* ─── Colonne catalogue (desktop) ─── */}
      {!compact && (
        <aside className="w-72 shrink-0 border-r flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold">Catalogue de questions</h3>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une question..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            {catalogue?.role && (
              <Badge variant="outline" className="text-[10px] w-fit border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
                {catalogue.total} questions pour votre rôle
              </Badge>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <CatalogueListe categories={categories} questionActiveId={questionActive?.id ?? null} choisirQuestion={choisirQuestion} />
          </ScrollArea>
        </aside>
      )}

      {/* ─── Sélecteur compact (portail) ─── */}
      {compact && (
        <div className="border-b p-3 shrink-0">
          <Dialog open={catalogueOuvert} onOpenChange={setCatalogueOuvert}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-xs gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-emerald-600" />
                {questionActive ? questionActive.question : 'Choisir une question...'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm flex items-center gap-2">
                  <MessageCircleQuestion className="h-4 w-4 text-emerald-600" />
                  Catalogue de questions ({catalogue?.total ?? 0})
                </DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher une question..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
                <CatalogueListe categories={categories} questionActiveId={questionActive?.id ?? null} choisirQuestion={choisirQuestion} />
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Zone conversation ─── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Bandeau sécurité */}
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 shrink-0">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <p className="text-[11px] text-muted-foreground">
            Réponses calculées directement depuis la base de la plateforme — sans service d&apos;IA externe. Vos données restent dans Suivi Santé.
          </p>
        </div>

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

        {/* ─── Barre de question active + paramètres ─── */}
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
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setQuestionActive(null); setParametres({}); }}>
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
                      options={catalogue?.options ?? {}}
                      onChange={(v) => setParametres((prev) => ({ ...prev, [p.key]: v }))}
                    />
                  ))}
                  <Button
                    onClick={poserQuestion}
                    disabled={!requisComplets || enCours}
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs ml-auto"
                  >
                    {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Obtenir la réponse'}
                  </Button>
                </div>
              )}
              {(questionActive.params.length === 0) && (
                <Button
                  onClick={poserQuestion}
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
      </div>
    </div>
  );
}

// ─── Liste du catalogue (réutilisée desktop + dialog compact) ────────────────

function CatalogueListe({
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
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium'
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

// ─── Champ de paramètre ──────────────────────────────────────────────────────

function ChampParametre({
  def, valeur, options, onChange,
}: {
  def: { key: ParamKey; label: string; required?: boolean; aide?: string };
  valeur: string;
  options: Partial<Record<string, { id: string; label: string }[]>>;
  onChange: (v: string) => void;
}) {
  if (def.key === 'PERIODE') {
    const preset = valeur.split('|')[0] || 'ANNEE_COURANTE';
    const personnalisee = preset === 'PERSONNALISEE';
    const [, du = '', au = ''] = valeur.split('|');
    return (
      <div className="flex items-end gap-1.5 flex-wrap">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
          <Select value={preset} onValueChange={(v) => onChange(v === 'PERSONNALISEE' ? 'PERSONNALISEE||' : v)}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {personnalisee && (
          <>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Du</label>
              <Input type="date" value={du} onChange={(e) => onChange(`PERSONNALISEE|${e.target.value}|${au}`)} className="h-9 w-[140px] text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Au</label>
              <Input type="date" value={au} onChange={(e) => onChange(`PERSONNALISEE|${du}|${e.target.value}`)} className="h-9 w-[140px] text-xs" />
            </div>
          </>
        )}
      </div>
    );
  }

  if (def.key === 'DOSSIER') {
    return (
      <div>
        <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
        <Input
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.aide || 'DOS-AAAA-XXXXXX'}
          className="h-9 w-[190px] text-xs"
        />
      </div>
    );
  }

  // SOCIETE / PRESTATAIRE / ASSURE / STATUT / ACTE / ANNEE : listes fournies par le serveur
  const liste = options[def.key] ?? [];
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
      <Select value={valeur || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[210px] text-xs">
          <SelectValue placeholder={liste.length === 0 ? 'Aucune option disponible' : `Sélectionner...`} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {liste.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Carte de résultat ───────────────────────────────────────────────────────

function CarteResultat({ resultat }: { resultat: AssistantResult }) {
  return (
    <div className="bg-card border rounded-2xl rounded-bl-sm shadow-sm overflow-hidden w-full">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IconeResultat type={resultat.type} />
          <span className="text-xs font-medium truncate">{resultat.titre}</span>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0">{resultat.type}</Badge>
      </div>
      <div className="p-4 space-y-3">
        <CorpsResultat resultat={resultat} />
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/90">{resultat.synthese}</p>
          {resultat.periode && (
            <p className="text-[10px] text-muted-foreground">Période : {resultat.periode.label}</p>
          )}
          <p className="text-[9px] text-muted-foreground/60">
            Résultat issu directement de la base de données — généré le {formatDate(resultat.date)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function IconeResultat({ type }: { type: string }) {
  switch (type) {
    case 'MONTANT': return <Coins className="h-3.5 w-3.5 text-emerald-600" />;
    case 'NOMBRE': return <Hash className="h-3.5 w-3.5 text-emerald-600" />;
    case 'TABLEAU': return <Table2 className="h-3.5 w-3.5 text-emerald-600" />;
    case 'LISTE': return <ListChecks className="h-3.5 w-3.5 text-emerald-600" />;
    case 'GRAPHIQUE': return <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />;
    case 'KPI': return <Gauge className="h-3.5 w-3.5 text-emerald-600" />;
    default: return <Info className="h-3.5 w-3.5 text-emerald-600" />;
  }
}

function CorpsResultat({ resultat }: { resultat: AssistantResult }) {
  switch (resultat.type) {
    case 'NOMBRE':
    case 'MONTANT':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
            {resultat.type === 'MONTANT' ? formatMontant(resultat.valeur ?? 0) : new Intl.NumberFormat('fr-FR').format(resultat.valeur ?? 0)}
          </span>
          {resultat.type === 'NOMBRE' && resultat.unite && (
            <span className="text-xs text-muted-foreground">{resultat.unite}</span>
          )}
        </div>
      );
    case 'KPI':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(resultat.kpis ?? []).map((k) => (
            <div key={k.label} className="rounded-lg border p-2.5 bg-muted/20">
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
              <p className="text-sm font-semibold mt-0.5">
                {k.type === 'montant' ? formatMontant(k.valeur) : k.type === 'pourcentage' ? `${k.valeur} %` : new Intl.NumberFormat('fr-FR').format(k.valeur)}
              </p>
            </div>
          ))}
        </div>
      );
    case 'TABLEAU':
    case 'LISTE':
      return <TableauResultat colonnes={resultat.colonnes ?? []} lignes={resultat.lignes ?? []} total={resultat.totalLignes ?? 0} />;
    case 'GRAPHIQUE':
      return <GraphiqueResultat serie={resultat.serie ?? []} nom={resultat.serieNom ?? ''} />;
    default:
      return null;
  }
}

function TableauResultat({ colonnes, lignes, total }: { colonnes: ResultColonne[]; lignes: Record<string, string | number | null>[]; total: number }) {
  if (lignes.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune donnée correspondant aux critères sélectionnés.</p>;
  }
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
          <tr>
            {colonnes.map((c) => (
              <th key={c.key} className={cn('px-2.5 py-2 font-medium text-left whitespace-nowrap', c.type === 'montant' || c.type === 'nombre' ? 'text-right' : '')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t">
              {colonnes.map((c) => (
                <td key={c.key} className={cn('px-2.5 py-1.5 whitespace-nowrap', c.type === 'montant' || c.type === 'nombre' ? 'text-right tabular-nums' : '')}>
                  {cellule(l[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > lignes.length && (
        <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/20">
          {lignes.length} lignes affichées sur {total} au total.
        </div>
      )}
    </div>
  );
}

function cellule(valeur: string | number | null | undefined, type?: string): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (type === 'montant' && typeof valeur === 'number') return formatMontant(valeur);
  if (type === 'nombre' && typeof valeur === 'number') return new Intl.NumberFormat('fr-FR').format(valeur);
  if (type === 'date') {
    const d = new Date(String(valeur));
    return isNaN(d.getTime()) ? String(valeur) : formatDate(d.toISOString());
  }
  return String(valeur);
}

function GraphiqueResultat({ serie, nom }: { serie: { label: string; valeur: number }[]; nom: string }) {
  if (serie.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune donnée correspondant aux critères sélectionnés.</p>;
  }
  const max = Math.max(...serie.map((s) => s.valeur), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">{nom}</p>
      <div className="flex items-end gap-1.5 h-32">
        {serie.map((s) => (
          <div key={s.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative">
            <span className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4 whitespace-nowrap">
              {new Intl.NumberFormat('fr-FR').format(s.valeur)}
            </span>
            <div
              className="w-full max-w-[40px] rounded-t bg-emerald-500/70 hover:bg-emerald-600 transition-colors"
              style={{ height: `${Math.max((s.valeur / max) * 100, 2)}%` }}
            />
            <span className="text-[8px] text-muted-foreground truncate w-full text-center">{s.label.slice(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
