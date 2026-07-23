#!/usr/bin/env python3
"""Patch SuiviTab in smartflow/chat-view.tsx and suivisante/chat-view.tsx"""

import re
import sys

# New SuiviTab implementation
NEW_SUIVI_TAB = r'''function SuiviTab() {
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
}'''

# Pattern: from 'function SuiviTab()' up to the closing of the function (before ChatTab)
pattern = re.compile(
    r'function SuiviTab\(\) \
.*?^\}\
\n/\* ———— Onglet Chat Assistant IA ———— \*/',
    re.MULTILINE | re.DOTALL
)

files = [
    '/home/z/my-project/src/components/smartflow/chat-view.tsx',
    '/home/z/my-project/src/components/suivisante/chat-view.tsx',
]

for f in files:
    with open(f, 'r') as fh:
        content = fh.read()
    
    match = pattern.search(content)
    if not match:
        print(f'WARNING: Pattern not found in {f}')
        continue
    
    replacement = NEW_SUIVI_TAB + '\n\n/* ———— Onglet Chat Assistant IA ———— */'
    content = content[:match.start()] + replacement + content[match.end():]
    
    with open(f, 'w') as fh:
        fh.write(content)
    print(f'OK: Patched {f}')

print('Done!')
