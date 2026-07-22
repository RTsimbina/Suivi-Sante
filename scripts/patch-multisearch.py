#!/usr/bin/env python3
"""Patch smartflow/chat-view.tsx pour ajouter le MultiSearchCombobox dans SuiviTab.
Remplace l'Input simple par un combobox multi-sélection avec dropdown de suggestions.
"""

import re

FILE = "/home/z/my-project/src/components/smartflow/chat-view.tsx"

with open(FILE, "r") as f:
    content = f.read()

# 1. Ajouter 'useState, useRef, useEffect' -> ajouter 'useCallback' dans l'import
content = content.replace(
    "import { useState, useRef, useEffect, type FormEvent } from 'react';",
    "import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';"
)

# 2. Ajouter l'import de Popover et Command
content = content.replace(
    "from '@/components/ui/select';",
    """from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';"""
)

# 3. Ajouter l'interface Suggestion après les autres interfaces
suggestion_interface = """
/* ─────────── Multi-recherche combobox ─────────── */

interface Suggestion {
  value: string;
  label: string;
  detail: string;
  societe: string;
}

function MultiSearchCombobox({
  selected,
  onAdd,
  onRemove,
  loading,
}: {
  selected: string[];
  onAdd: (value: string, label: string) => void;
  onRemove: (value: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch suggestions avec debounce
  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term || term.length < 1) {
      setSuggestions([]);
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(`/api/dossiers/suivi?mode=suggest&term=${encodeURIComponent(term)}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setFetching(false);
    }
  }, []);

  // Debounce la saisie
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [inputValue, fetchSuggestions]);

  const handleSelect = (sug: Suggestion) => {
    if (!selected.includes(sug.value)) {
      onAdd(sug.value, sug.label);
    }
    setInputValue('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inputValue && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    }
    if (e.key === 'Enter' && inputValue.trim()) {
      // Ajouter le texte libre comme valeur brute
      const term = inputValue.trim();
      if (!selected.includes(term)) {
        onAdd(term, term);
      }
      setInputValue('');
      setSuggestions([]);
      setOpen(false);
    }
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <Popover open={open && (suggestions.length > 0 || fetching)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={\"flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text\"}
          onClick={() => inputRef.current?.focus()}
        >
          {selected.length === 0 && !inputValue && (
            <span className=\"text-muted-foreground text-sm select-none pointer-events-none\">
              Rechercher par N° dossier, bénéficiaire, société... (Entrée pour ajouter)
            </span>
          )}
          {selected.map((val) => (
            <span
              key={val}
              className=\"inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800\"
            >
              {val}
              <button
                type=\"button\"
                onClick={(e) => { e.stopPropagation(); onRemove(val); }}
                className=\"ml-0.5 hover:text-red-600 transition-colors\"
                aria-label=\`Retirer ${val}\`
              >
                <X className=\"size-3\" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setOpen(true); }}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (inputValue) setOpen(true); }}
            disabled={loading}
            className=\"flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm h-6\"
            placeholder={selected.length > 0 ? 'Ajouter...' : ''}
          />
          {fetching && <Loader2 className=\"size-3.5 animate-spin text-muted-foreground shrink-0\" />}
          {!fetching && selected.length > 0 && (
            <ChevronsUpDown className=\"size-3.5 text-muted-foreground/50 shrink-0\" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className=\"p-0 w-[min(420px,var(--radix-popover-trigger-width))]\" align=\"start\" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div ref={listRef} className=\"max-h-[240px] overflow-y-auto\">
          {suggestions.length === 0 && !fetching && (
            <div className=\"p-3 text-center text-xs text-muted-foreground\">
              Aucune suggestion. Appuyez sur <kbd className=\"px-1 py-0.5 rounded bg-muted font-mono text-[10px]\">Entrée</kbd> pour rechercher « {inputValue} »
            </div>
          )}
          {suggestions.map((sug, idx) => (
            <button
              key={sug.value}
              type=\"button\"
              className={\`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent transition-colors 
                ${selected.includes(sug.value) ? 'opacity-50 pointer-events-none' : ''} 
                ${idx !== suggestions.length - 1 ? 'border-b border-border/50' : ''}\`}
              onClick={() => handleSelect(sug)}
            >
              <Search className=\"size-3.5 text-muted-foreground shrink-0\" />
              <div className=\"flex-1 min-w-0\">
                <p className=\"truncate font-medium text-foreground\">{sug.value}</p>
                <p className=\"truncate text-xs text-muted-foreground\">{sug.detail} — {sug.societe}</p>
              </div>
              {selected.includes(sug.value) && <CheckCircle2 className=\"size-3.5 text-emerald-500 shrink-0\" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
"""

# Insérer le composant juste avant le commentaire "Onglet Suivi Dossier"
content = content.replace(
    "/* ─────────── Onglet Suivi Dossier & Paiement ─────────── */",
    suggestion_interface + "\n/* ─────────── Onglet Suivi Dossier & Paiement ─────────── */"
)

# 4. Remplacer le state et la logique de SuiviTab
old_suivitab_state = """function SuiviTab() {
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
  }"""

new_suivitab_state = """function SuiviTab() {
  const [selectedTerms, setSelectedTerms] = useState<{ value: string; label: string }[]>([]);
  const [results, setResults] = useState<SuiviResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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

  const selectedValues = selectedTerms.map((t) => t.value);
  const hasAnyFilter = selectedValues.length > 0 || filterStatut || filterType || filterSociete;
  const activeFilterCount = [selectedValues.length > 0, !!filterStatut, !!filterType, !!filterSociete].filter(Boolean).length;

  function addTerm(value: string, label: string) {
    setSelectedTerms((prev) => {
      if (prev.some((t) => t.value === value)) return prev;
      return [...prev, { value, label }];
    });
  }

  function removeTerm(value: string) {
    setSelectedTerms((prev) => prev.filter((t) => t.value !== value));
  }

  function clearFilters() {
    setSelectedTerms([]);
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
      // Multi-recherche : chaque terme comme paramètre q séparé
      selectedValues.forEach((q) => params.append('q', q));
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
  }"""

content = content.replace(old_suivitab_state, new_suivitab_state)

# 5. Remplacer le JSX de la barre de recherche (Ligne 1 : Recherche texte + Bouton)
old_search_bar = """        {/* Ligne 1 : Recherche texte + Bouton */}
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
        </form>"""

new_search_bar = """        {/* Ligne 1 : Multi-recherche avec combobox + Bouton */}
        <form onSubmit={(e) => handleSearch(e)} className="flex gap-2">
          <div className="flex-1">
            <MultiSearchCombobox
              selected={selectedValues}
              onAdd={addTerm}
              onRemove={removeTerm}
              loading={loading}
            />
          </div>
          <Button type="submit" disabled={!hasAnyFilter || loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="ml-2 hidden sm:inline">Rechercher</span>
          </Button>
        </form>"""

content = content.replace(old_search_bar, new_search_bar)

# 6. Mettre à jour le texte d'aide
content = content.replace(
    "Combinez la recherche texte avec les filtres pour affiner les résultats. Au moins un critère est requis.",
    "Saisissez un terme et appuyez sur Entrée, ou sélectionnez une suggestion. Combinez plusieurs termes et filtres pour affiner les résultats."
)

with open(FILE, "w") as f:
    f.write(content)

print("OK: smartflow/chat-view.tsx patched successfully")
