'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Search, ShieldCheck, ShieldAlert, ShieldX, User, Building2,
  AlertTriangle, CheckCircle2, XCircle, Activity, Calculator,
  ChevronDown, ChevronUp, FileText, Loader2, HeartPulse,
  Ban, Clock, ArrowRight, Plus, Trash2, Filter, ClipboardList,
  ChevronLeft, ChevronRight, CalendarDays, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/* ── Types ── */

interface AssureInfo {
  id: string; nom: string; prenom: string; nSS: string | null;
  dateNaissance: string | null; sexe: string | null; telephone: string | null;
  email: string | null; adresse: string | null; actif: boolean;
}

interface Alerte {
  type: 'info' | 'warning' | 'danger'; message: string; code: string;
}

interface VerificationResult {
  assure: AssureInfo;
  societe: { id: string; nom: string };
  plafonds: {
    annuelGlobal: number; totalConsomme: number; reliquatGlobal: number;
    tauxConsommationGlobal: number; seuil70: number; seuil100: number;
  };
  consommationParActe: Record<string, {
    consomme: number; plafond: number; tauxCouverture: number;
    nbActes: number; description: string;
  }>;
  dossiersRecent: {
    id: string; numeroDossier: string; typeDossier: string;
    dateReception: string; montantReclame: number; montantValide: number | null;
    montantPaye: number | null; statut: string; prestataire: string | null;
  }[];
  alertes: Alerte[];
}

interface SimulationResult {
  autorise: boolean; raison: string; message: string;
  details: {
    typeActe: string; plafondActe: number; consommeActe: number;
    reliquatActe: number; tauxCouverture: number; montantDemande: number;
    montantCouvert: number; partAssureur: number; partPatient: number;
    plafondGlobal: number; consommeGlobal: number; reliquatGlobal: number;
    nbActesIdentiques: number;
  };
  actesIdentiques: { numeroDossier: string; dateReception: string; montantReclame: number; montantPaye: number | null; statut: string }[];
  alertes: { type: 'info' | 'warning' | 'danger'; message: string }[];
}

interface SimLigne {
  id: string;
  typeActe: string;
  montant: string;
}

interface MultiSimResult {
  ligne: SimLigne;
  result: SimulationResult;
}

interface SearchResult {
  id: string; nom: string; prenom: string; nSS: string | null;
  actif: boolean; societe: { nom: string };
}

/* ── Types pour l'historique des actes ── */

interface ActeItem {
  id: string;
  numeroDossier: string;
  typeDossier: string;
  beneficiaire: string;
  dateReception: string;
  dateSoins: string | null;
  montantReclame: number;
  montantValide: number | null;
  montantPaye: number | null;
  partPatient: number | null;
  statut: string;
  prestataireId: string | null;
  prestataire: string | null;
  prestataireType: string | null;
}

interface ActesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ActesFiltres {
  typesActe: string[];
  statuts: string[];
}

function formatAr(n: number) {
  return n.toLocaleString('fr-FR') + ' Ar';
}

function formatPercent(n: number) {
  return n.toFixed(1) + '%';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR');
}

/* ── Statut badge color helper ── */
function getStatutBadge(statut: string) {
  const map: Record<string, 'default' | 'outline' | 'destructive' | 'secondary'> = {
    RECU: 'secondary',
    EN_COURS_TECHNIQUE: 'outline',
    VALIDE: 'outline',
    EN_COURS_COMPTA: 'outline',
    PAYE: 'default',
    REJETE: 'destructive',
};
  return map[statut] || 'outline';
}

/* ── Composant principal ── */

export default function SanteView() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [erreur, setErreur] = useState('');
  const [expandedActes, setExpandedActes] = useState<Set<string>>(new Set());

  // Simulation multi-actes
  const [simLignes, setSimLignes] = useState<SimLigne[]>([
    { id: crypto.randomUUID(), typeActe: '', montant: '' },
  ]);
  const [simLoading, setSimLoading] = useState(false);
  const [simResults, setSimResults] = useState<MultiSimResult[]>([]);

  // Historique des actes — état
  const [actesLoading, setActesLoading] = useState(false);
  const [actes, setActes] = useState<ActeItem[]>([]);
  const [actesPagination, setActesPagination] = useState<ActesPagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [actesFiltres, setActesFiltres] = useState<ActesFiltres>({ typesActe: [], statuts: [] });

  // Filtres actifs — dates par défaut = année courante
  const [filtreType, setFiltreType] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreDateDebut, setFiltreDateDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [filtreDateFin, setFiltreDateFin] = useState(`${new Date().getFullYear()}-12-31`);
  const [filtreSearch, setFiltreSearch] = useState('');
  const [actesPage, setActesPage] = useState(1);
  const [showFiltres, setShowFiltres] = useState(true);

  // Autocomplétion
  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    try {
      const res = await fetch(`/api/sante/verifier-assure?q=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.resultats || []);
        setShowResults(true);
      }
    } catch { /* silent */ }
  }, []);

  // Vérification complète
  const handleVerifier = async (identifiant: string) => {
    setLoading(true);
    setErreur('');
    setResult(null);
    setSimResults([]);
    setSimLignes([{ id: crypto.randomUUID(), typeActe: '', montant: '' }]);
    setShowResults(false);
    // Reset historique actes
    setActes([]);
    setActesPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
    setActesFiltres({ typesActe: [], statuts: [] });
    setFiltreType('');
    setFiltreStatut('');
    setFiltreDateDebut(`${new Date().getFullYear()}-01-01`);
    setFiltreDateFin(`${new Date().getFullYear()}-12-31`);
    setFiltreSearch('');
    setActesPage(1);

    try {
      const res = await fetch('/api/sante/verifier-assure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.erreur || 'Erreur lors de la vérification.');
      } else {
        setResult(data);
      }
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  // ── Charger l'historique des actes ──
  const fetchActes = useCallback(async (assureId: string, page: number, overrides?: {
    typeDossier?: string; statut?: string; dateDebut?: string; dateFin?: string; search?: string;
  }) => {
    setActesLoading(true);
    try {
      const params = new URLSearchParams({
        assureId,
        page: String(page),
        limit: '10',
      });
      const t = overrides?.typeDossier ?? filtreType;
      const s = overrides?.statut ?? filtreStatut;
      const dd = overrides?.dateDebut ?? filtreDateDebut;
      const df = overrides?.dateFin ?? filtreDateFin;
      const q = overrides?.search ?? filtreSearch;
      if (t) params.set('typeDossier', t);
      if (s) params.set('statut', s);
      if (dd) params.set('dateDebut', dd);
      if (df) params.set('dateFin', df);
      if (q) params.set('search', q);

      const res = await fetch(`/api/sante/actes-assure?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActes(data.dossiers);
        setActesPagination(data.pagination);
        if (data.filtres) setActesFiltres(data.filtres);
      }
    } catch (err) {
      console.error('[ACTES] Erreur chargement actes:', err);
    } finally {
      setActesLoading(false);
    }
  }, [filtreType, filtreStatut, filtreDateDebut, filtreDateFin, filtreSearch]);

  // Charger automatiquement quand result change
  useEffect(() => {
    if (result?.assure.id) {
      fetchActes(result.assure.id, 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.assure.id]);

  // Recharger quand la page change (pagination)
  useEffect(() => {
    if (!result?.assure.id) return;
    fetchActes(result.assure.id, actesPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actesPage]);

  // Appliquer les filtres (uniquement via le bouton Rechercher)
  const handleAppliquerFiltres = () => {
    if (!result?.assure.id) return;
    setActesPage(1);
    fetchActes(result.assure.id, 1);
  };

  // Réinitialiser les filtres et relancer la recherche
  const handleResetFiltres = () => {
    setFiltreType('');
    setFiltreStatut('');
    setFiltreDateDebut(`${new Date().getFullYear()}-01-01`);
    setFiltreDateFin(`${new Date().getFullYear()}-12-31`);
    setFiltreSearch('');
    // Relancer après reset
    if (result?.assure.id) {
      setActesPage(1);
      setTimeout(() => fetchActes(result.assure.id, 1), 0);
    }
  };

  // Gestion des lignes de simulation multi-actes
  function addSimLigne() {
    setSimLignes(prev => [...prev, { id: crypto.randomUUID(), typeActe: '', montant: '' }]);
  }

  function removeSimLigne(id: string) {
    setSimLignes(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  function updateSimLigne(id: string, field: 'typeActe' | 'montant', value: string) {
    setSimLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  // Simulation multi-actes en parallele
  const handleSimuler = async () => {
    if (!result) return;
    const validLignes = simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0);
    if (validLignes.length === 0) return;
    setSimLoading(true);
    setSimResults([]);

    try {
      const promises = validLignes.map(async (ligne) => {
        const res = await fetch('/api/sante/simuler-acte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assureId: result.assure.id,
            typeActe: ligne.typeActe,
            montantDemande: parseFloat(ligne.montant),
          }),
        });
        const data = await res.json();
        return {
          ligne,
          result: { ...data, alertes: data.alertes || [], actesIdentiques: data.details?.actesIdentiques || [] } as unknown as SimulationResult,
        };
      });
      const results = await Promise.all(promises);
      setSimResults(results);
    } catch {
      setErreur('Erreur lors de la simulation.');
    } finally {
      setSimLoading(false);
    }
  };

  const toggleActe = (key: string) => {
    setExpandedActes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Barres de progression colorées
  function getBarColor(taux: number) {
    if (taux >= 100) return 'bg-red-500';
    if (taux >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  function getBarDarkColor(taux: number) {
    if (taux >= 100) return 'dark:bg-red-400';
    if (taux >= 70) return 'dark:bg-amber-400';
    return 'dark:bg-emerald-400';
  }

  // Compteur de filtres actifs (dates par défaut = année courante, ne comptent pas)
  const defaultDebut = `${new Date().getFullYear()}-01-01`;
  const defaultFin = `${new Date().getFullYear()}-12-31`;
  const nbFiltresActifs = [
    filtreType,
    filtreStatut,
    filtreDateDebut !== defaultDebut ? filtreDateDebut : '',
    filtreDateFin !== defaultFin ? filtreDateFin : '',
    filtreSearch,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-emerald-600" />
          Contrôle Santé — Vérification Assuré
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Recherchez un assuré par son N° SS, nom, prénom ou email pour vérifier ses plafonds, ses droits et consulter l\'historique de ses actes.
        </p>
      </div>

      {/* Barre de recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par N° SS, nom, prénom, email ou téléphone..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifier(query)}
              className="pl-10 pr-24"
              disabled={loading}
            />
            <Button
              onClick={() => handleVerifier(query)}
              disabled={loading || query.length < 2}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700 h-7 text-xs px-3"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
              Vérifier
            </Button>

            {/* Autocomplétion */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setQuery(r.nSS || `${r.nom} ${r.prenom}`);
                      setShowResults(false);
                      handleVerifier(r.id);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted transition-colors text-left cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.nom} {r.prenom}</p>
                      <p className="text-xs text-muted-foreground">{r.nSS || '—'} · {r.societe.nom}</p>
                    </div>
                    <Badge variant={r.actif ? 'outline' : 'destructive'} className="text-[10px]">
                      {r.actif ? 'Actif' : 'Inactif'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Erreur */}
      {erreur && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{erreur}</p>
        </div>
      )}

      {/* Résultats */}
      {result && (
        <>
          {/* Alertes */}
          {result.alertes.length > 0 && (
            <div className="space-y-2">
              {result.alertes.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3 flex items-start gap-3 text-sm',
                    a.type === 'danger' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
                    a.type === 'warning' && 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
                    a.type === 'info' && 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
                  )}
                >
                  {a.type === 'danger' ? <ShieldX className="h-5 w-5 mt-0.5 shrink-0" /> :
                   a.type === 'warning' ? <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" /> :
                   <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" />}
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Fiche Assuré + Société */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" /> Informations Assuré
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{result.assure.nom} {result.assure.prenom}</span>
                  <Badge variant={result.assure.actif ? 'outline' : 'destructive'} className="text-xs">
                    {result.assure.actif ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Ban className="h-3 w-3 mr-1" />}
                    {result.assure.actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <p>N° SS : <span className="text-foreground font-medium">{result.assure.nSS || '—'}</span></p>
                  <p>Sexe : <span className="text-foreground font-medium">{result.assure.sexe || '—'}</span></p>
                  <p>Tél : <span className="text-foreground font-medium">{result.assure.telephone || '—'}</span></p>
                  <p>Email : <span className="text-foreground font-medium truncate">{result.assure.email || '—'}</span></p>
                  <p className="col-span-2">Adresse : <span className="text-foreground font-medium">{result.assure.adresse || '—'}</span></p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Société Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-semibold">{result.societe.nom}</p>
                <Separator />
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Plafond annuel global</span>
                    <span className="font-medium">{formatAr(result.plafonds.annuelGlobal)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', getBarColor(result.plafonds.tauxConsommationGlobal), getBarDarkColor(result.plafonds.tauxConsommationGlobal))}
                      style={{ width: `${Math.min(result.plafonds.tauxConsommationGlobal, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Consommé : {formatAr(result.plafonds.totalConsomme)} ({formatPercent(result.plafonds.tauxConsommationGlobal)})</span>
                    <span>Reliquat : {formatAr(result.plafonds.reliquatGlobal)}</span>
                  </div>
                  {/* Seuils 70% et 100% */}
                  <div className="flex gap-4 mt-1.5">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">Seuil 70% : {formatAr(result.plafonds.seuil70)}</span>
                    <span className="text-[10px] text-red-600 dark:text-red-400">Seuil 100% : {formatAr(result.plafonds.seuil100)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              SECTION PRINCIPALE : Historique des actes réalisés
              ═══════════════════════════════════════════════════════════ */}
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  Historique des actes réalisés
                  {actesPagination.total > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {actesPagination.total} acte{actesPagination.total > 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowFiltres(!showFiltres)}
                >
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  Filtres
                  {nbFiltresActifs > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-emerald-600 text-white">
                      {nbFiltresActifs}
                    </Badge>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Consultez et filtrez tous les actes médicaux déjà réalisés par cet assuré.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ── Panneau de filtres ── */}
              {showFiltres && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Filter className="h-3 w-3" /> Critères de recherche
                    </p>
                    {nbFiltresActifs > 0 && (
                      <button
                        onClick={handleResetFiltres}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <X className="h-3 w-3" /> Réinitialiser
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Recherche texte */}
                    <div className="sm:col-span-2 lg:col-span-1">
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Recherche</label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="N° dossier, bénéficiaire..."
                          value={filtreSearch}
                          onChange={(e) => setFiltreSearch(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    {/* Type d'acte */}
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Type d'acte</label>
                      <select
                        value={filtreType}
                        onChange={(e) => setFiltreType(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">Tous les types</option>
                        {actesFiltres.typesActe.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    {/* Statut */}
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Statut</label>
                      <select
                        value={filtreStatut}
                        onChange={(e) => setFiltreStatut(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">Tous les statuts</option>
                        {actesFiltres.statuts.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    {/* Date début */}
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Date début</label>
                      <div className="relative">
                        <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="date"
                          value={filtreDateDebut}
                          onChange={(e) => setFiltreDateDebut(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    {/* Date fin */}
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Date fin</label>
                      <div className="relative">
                        <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="date"
                          value={filtreDateFin}
                          onChange={(e) => setFiltreDateFin(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Bouton Rechercher */}
                  <div className="flex items-center justify-end pt-1">
                    <Button
                      onClick={handleAppliquerFiltres}
                      disabled={actesLoading || !result?.assure.id}
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs px-4"
                    >
                      {actesLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                      Rechercher
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Tableau des actes ── */}
              {actesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <span className="ml-2 text-sm text-muted-foreground">Chargement des actes...</span>
                </div>
              ) : actes.length > 0 ? (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 text-left text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">N° Dossier</th>
                          <th className="px-3 py-2.5 font-medium">Type d'acte</th>
                          <th className="px-3 py-2.5 font-medium">Date réception</th>
                          <th className="px-3 py-2.5 font-medium">Date soins</th>
                          <th className="px-3 py-2.5 font-medium">Prestataire</th>
                          <th className="px-3 py-2.5 font-medium text-right">Réclamé</th>
                          <th className="px-3 py-2.5 font-medium text-right">Validé</th>
                          <th className="px-3 py-2.5 font-medium text-right">Payé</th>
                          <th className="px-3 py-2.5 font-medium text-right">Part patient</th>
                          <th className="px-3 py-2.5 font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actes.map((a) => (
                          <tr key={a.id} className="border-t last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-medium">{a.numeroDossier}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className="text-[10px] font-normal">{a.typeDossier}</Badge>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{formatDate(a.dateReception)}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{a.dateSoins ? formatDate(a.dateSoins) : '—'}</td>
                            <td className="px-3 py-2.5">
                              <div>
                                <span className="text-foreground">{a.prestataire || '—'}</span>
                                {a.prestataireType && (
                                  <span className="text-muted-foreground ml-1">({a.prestataireType})</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono">{formatAr(a.montantReclame)}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{a.montantValide ? formatAr(a.montantValide) : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{a.montantPaye ? formatAr(a.montantPaye) : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{a.partPatient ? formatAr(a.partPatient) : '—'}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant={getStatutBadge(a.statut)} className="text-[10px]">
                                {a.statut.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Pagination ── */}
                  {actesPagination.totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Affichage {(actesPage - 1) * actesPagination.limit + 1}–{Math.min(actesPage * actesPagination.limit, actesPagination.total)}
                        sur {actesPagination.total} acte{actesPagination.total > 1 ? 's' : ''}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline" size="icon" className="h-7 w-7"
                          disabled={actesPage <= 1}
                          onClick={() => setActesPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        {/* Numéros de page */}
                        {Array.from({ length: Math.min(actesPagination.totalPages, 5) }, (_, i) => {
                          let pageNum: number;
                          if (actesPagination.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (actesPage <= 3) {
                            pageNum = i + 1;
                          } else if (actesPage >= actesPagination.totalPages - 2) {
                            pageNum = actesPagination.totalPages - 4 + i;
                          } else {
                            pageNum = actesPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={pageNum === actesPage ? 'default' : 'outline'}
                              size="icon" className="h-7 w-7 text-xs"
                              onClick={() => setActesPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                        <Button
                          variant="outline" size="icon" className="h-7 w-7"
                          disabled={actesPage >= actesPagination.totalPages}
                          onClick={() => setActesPage(p => p + 1)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {nbFiltresActifs > 0
                      ? 'Aucun acte ne correspond aux filtres sélectionnés.'
                      : 'Aucun acte réalisé par cet assuré cette année.'}
                  </p>
                  {nbFiltresActifs > 0 && (
                    <button
                      onClick={handleResetFiltres}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                    >
                      Réinitialiser les filtres
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plafonds par type d'acte */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" /> Plafonds par type d'acte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(result.consommationParActe).map(([prestation, data]) => {
                const taux = data.plafond > 0 ? (data.consomme / data.plafond) * 100 : 0;
                const isExpanded = expandedActes.has(prestation);
                const isDanger = taux >= 100;
                const isWarning = taux >= 70 && taux < 100;

                return (
                  <div key={prestation} className={cn(
                    'rounded-lg border p-3 transition-colors',
                    isDanger && 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
                    isWarning && !isDanger && 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20',
                    !isDanger && !isWarning && 'border-border',
                  )}>
                    <button
                      onClick={() => toggleActe(prestation)}
                      className="w-full flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'p-1.5 rounded-lg',
                          isDanger ? 'bg-red-100 dark:bg-red-900/40' : isWarning ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40',
                        )}>
                          {isDanger ? <ShieldX className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> :
                           isWarning ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> :
                           <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium">{prestation}</p>
                          <p className="text-[10px] text-muted-foreground">{data.description} · Taux couverture : {data.tauxCouverture}% · {data.nbActes} acte(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-mono font-semibold">{formatAr(data.consomme)} / {formatAr(data.plafond)}</p>
                          <p className={cn(
                            'text-[10px] font-medium',
                            isDanger ? 'text-red-600 dark:text-red-400' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                          )}>
                            Reliquat : {formatAr(Math.max(0, data.plafond - data.consomme))}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Barre de progression */}
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', getBarColor(taux), getBarDarkColor(taux))}
                        style={{ width: `${Math.min(taux, 100)}%` }}
                      />
                    </div>

                    {/* Détails étendus */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">Dossiers {prestation} de l'année :</p>
                        <div className="space-y-1">
                          {result.dossiersRecent
                            .filter(d => d.typeDossier === prestation)
                            .map(d => (
                              <div key={d.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2.5 py-1.5">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-mono">{d.numeroDossier}</span>
                                  <span className="text-muted-foreground">{formatDate(d.dateReception)}</span>
                                  <span className="text-muted-foreground">{d.prestataire}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span>{formatAr(d.montantPaye ?? d.montantValide ?? d.montantReclame)}</span>
                                  <Badge variant="outline" className="text-[9px] h-4">{d.statut}</Badge>
                                </div>
                              </div>
                            ))}
                          {result.dossiersRecent.filter(d => d.typeDossier === prestation).length === 0 && (
                            <p className="text-xs text-muted-foreground italic">Aucun dossier ce type cette année.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Simulateur multi-actes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calculator className="h-4 w-4" /> Simuler des actes
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addSimLigne}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter un acte
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lignes de saisie */}
              <div className="space-y-2">
                {simLignes.map((ligne) => (
                  <div key={ligne.id} className="flex items-end gap-2">
                    <div className="flex-1 grid sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">Type d'acte</label>
                        <select
                          value={ligne.typeActe}
                          onChange={(e) => updateSimLigne(ligne.id, 'typeActe', e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">-- Sélectionner --</option>
                          {Object.keys(result.consommationParActe).map(acte => (
                            <option key={acte} value={acte}>{acte}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">Montant (Ar)</label>
                        <Input
                          type="number"
                          placeholder="Ex: 150000"
                          value={ligne.montant}
                          onChange={(e) => updateSimLigne(ligne.id, 'montant', e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-600 shrink-0"
                      onClick={() => removeSimLigne(ligne.id)}
                      disabled={simLignes.length <= 1}
                      aria-label="Supprimer cette ligne"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSimuler}
                  disabled={simLoading || simLignes.every(l => !l.typeActe || !l.montant)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {simLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  Simuler {simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0).length > 1
                    ? `${simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0).length} actes`
                    : 'la prise en charge'}
                </Button>
                {simResults.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSimResults([])}>
                    Effacer les résultats
                  </Button>
                )}
              </div>

              {/* Résumé multi-simulation */}
              {simResults.length > 1 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Résumé de la simulation</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Actes simulés</p>
                      <p className="text-sm font-bold">{simResults.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total demandé</p>
                      <p className="text-sm font-bold">{formatAr(simResults.reduce((s, r) => s + parseFloat(r.ligne.montant), 0))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total couvert</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatAr(simResults.reduce((s, r) => s + (r.result.details?.montantCouvert || 0), 0))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total patient</p>
                      <p className="text-sm font-bold">{formatAr(simResults.reduce((s, r) => s + (r.result.details?.partPatient || 0), 0))}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Résultats détaillés par acte */}
              {simResults.map((sim, idx) => (
                <div
                  key={sim.ligne.id}
                  className={cn(
                    'rounded-lg border p-4 space-y-3',
                    sim.result.autorise
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sim.result.autorise
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        : <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
                      <span className={cn('text-sm font-semibold', sim.result.autorise ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                        {sim.result.autorise ? 'ACTE AUTORISÉ' : 'ACTE NON AUTORISÉ'}
                      </span>
                      {simResults.length > 1 && (
                        <Badge variant="outline" className="text-[10px]">{idx + 1}/{simResults.length}</Badge>
                      )}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{sim.ligne.typeActe} — {formatAr(parseFloat(sim.ligne.montant))}</span>
                  </div>
                  <p className="text-sm">{sim.result.message}</p>

                  {sim.result.details && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Plafond acte</p>
                        <p className="text-sm font-bold">{formatAr(sim.result.details.plafondActe)}</p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Déjà consommé</p>
                        <p className="text-sm font-bold">{formatAr(sim.result.details.consommeActe)}</p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Reliquat acte</p>
                        <p className={cn('text-sm font-bold', sim.result.details.reliquatActe <= 0 && 'text-red-600 dark:text-red-400')}>
                          {formatAr(sim.result.details.reliquatActe)}
                        </p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Montant couvert</p>
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatAr(sim.result.details.montantCouvert)}</p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Part assureur ({sim.result.details.tauxCouverture}%)</p>
                        <p className="text-sm font-bold">{formatAr(sim.result.details.partAssureur)}</p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">Part patient</p>
                        <p className="text-sm font-bold">{formatAr(sim.result.details.partPatient)}</p>
                      </div>
                    </div>
                  )}

                  {/* Actes identiques */}
                  {sim.result.actesIdentiques && sim.result.actesIdentiques.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Actes identiques déjà réalisés ({sim.result.details.nbActesIdentiques})
                      </p>
                      <div className="space-y-1">
                        {sim.result.actesIdentiques.map((a, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-background/60 rounded px-2.5 py-1.5">
                            <span className="font-mono">{a.numeroDossier}</span>
                            <span>{formatAr(a.montantReclame)}</span>
                            <Badge variant="outline" className="text-[9px] h-4">{a.statut}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alertes simulation */}
                  {sim.result.alertes && sim.result.alertes.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {sim.result.alertes.map((a, i) => (
                        <div key={i} className={cn(
                          'text-xs rounded px-2.5 py-1.5 flex items-center gap-2',
                          a.type === 'danger' && 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                          a.type === 'warning' && 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
                        )}>
                          {a.type === 'danger' ? <Ban className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {a.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}