'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, Filter, ChevronDown, ChevronUp,
  Clock, User, FileEdit, Trash2, UserPlus, AlertTriangle,
  Building2, CreditCard, Stethoscope, Heart, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoriqueEntry {
  id: string;
  entite: string;
  entiteId: string;
  champ: string;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  modifiePar: string;
  dateModification: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const ENTITE_OPTIONS = [
  { value: '', label: 'Toutes les entités' },
  { value: 'Bareme', label: 'Barèmes' },
  { value: 'Contrat', label: 'Contrats' },
  { value: 'Utilisateur', label: 'Utilisateurs' },
  { value: 'Societe', label: 'Sociétés' },
];

const ENTITE_CONFIG: Record<string, { icon: typeof Shield; color: string; bg: string; label: string }> = {
  Bareme: { icon: FileEdit, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50', label: 'Barème' },
  Contrat: { icon: CreditCard, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/50', label: 'Contrat' },
  Utilisateur: { icon: User, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50', label: 'Utilisateur' },
  Societe: { icon: Building2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50', label: 'Société' },
  Prestataire: { icon: Stethoscope, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/50', label: 'Prestataire' },
  Assure: { icon: Heart, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/50', label: 'Assuré' },
};

function getEntiteConfig(entite: string) {
  return ENTITE_CONFIG[entite] || { icon: AlertTriangle, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-950/50', label: entite };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function JournalView() {
  const [entries, setEntries] = useState<HistoriqueEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entiteFilter, setEntiteFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (entiteFilter) params.set('entite', entiteFilter);

      const res = await fetch(`/api/historique-parametres?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erreur || 'Erreur de chargement');
      }
      const data = await res.json();
      setEntries(data.entries);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [entiteFilter]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  function handlePageChange(newPage: number) {
    fetchEntries(newPage);
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Journal de Bord des Paramétrages</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Historique immuable de toutes les modifications sensibles — visible uniquement par les administrateurs
              </p>
            </div>
            {pagination && (
              <Badge variant="outline" className="text-xs border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
                {pagination.total} enregistrement(s)
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Filtrer :</span>
            </div>
            {ENTITE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setEntiteFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                  entiteFilter === opt.value
                    ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">Chargement du journal...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune modification enregistrée.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Les changements de barèmes, contrats, utilisateurs et sociétés apparaîtront ici.</p>
          </CardContent>
        </Card>
      )}

      {/* Liste des entrées */}
      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => {
            const config = getEntiteConfig(entry.entite);
            const Icon = config.icon;
            const isExpanded = expandedId === entry.id;
            const isSuppression = entry.champ === 'SUPPRESSION';
            const isCreation = entry.champ === 'CREATION';
            const isRoleChange = entry.entite === 'Utilisateur' && entry.champ === 'role';

            return (
              <Card key={entry.id} className={cn(
                'transition-colors hover:border-emerald-200 dark:hover:border-emerald-900',
                isSuppression && 'border-red-200 dark:border-red-900/50',
                isRoleChange && 'border-amber-200 dark:border-amber-900/50',
              )}>
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onClick={() => toggleExpand(entry.id)}
                >
                  {/* Icône entité */}
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.bg)}>
                    {isSuppression ? (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    ) : isCreation ? (
                      <UserPlus className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Icon className={cn('h-4 w-4', config.color)} />
                    )}
                  </div>

                  {/* Contenu principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn('text-[10px]', config.color, 'border-current/20', config.bg)}>
                        {config.label}
                      </Badge>
                      <span className="text-xs font-medium">
                        {isSuppression ? 'Suppression' : isCreation ? 'Création' : `Champ : ${entry.champ}`}
                      </span>
                      {isRoleChange && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                          Changement de rôle
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {isSuppression ? (
                        <span className="text-red-600 dark:text-red-400">{entry.ancienneValeur}</span>
                      ) : isCreation ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{entry.nouvelleValeur}</span>
                      ) : (
                        <>
                          <span className="line-through text-muted-foreground/60">{entry.ancienneValeur || '(vide)'}</span>
                          <span className="mx-2 text-muted-foreground">→</span>
                          <span className="font-medium text-foreground">{entry.nouvelleValeur || '(vide)'}</span>
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(entry.dateModification)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.modifiePar === 'inconnu' ? 'Utilisateur inconnu' : entry.modifiePar}
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </div>

                {/* Détails étendus */}
                {isExpanded && (
                  <>
                    <Separator />
                    <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">ID entrée :</span>
                        <span className="ml-1.5 font-mono text-muted-foreground/80">{entry.id.slice(0, 12)}...</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ID entité :</span>
                        <span className="ml-1.5 font-mono text-muted-foreground/80">{entry.entiteId.slice(0, 12)}...</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Ancienne valeur :</span>
                        <span className="ml-1.5">{entry.ancienneValeur || <em className="text-muted-foreground/50">vide</em>}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Nouvelle valeur :</span>
                        <span className="ml-1.5">{entry.nouvelleValeur || <em className="text-muted-foreground/50">vide</em>}</span>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} sur {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
