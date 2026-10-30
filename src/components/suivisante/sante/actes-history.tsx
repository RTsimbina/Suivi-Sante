'use client';

/**
 * Historique des actes réalisés par l'assuré vérifié : panneau de filtres
 * (recherche, type, statut — la période est celle de la barre partagée),
 * tableau paginé et état vide (présentateur pur — extraits tels quels de
 * l'ancien monolithe sante-view.tsx).
 */
import type { Dispatch, SetStateAction } from 'react';
import {
  ClipboardList, Filter, X, Search, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ActeItem, ActesPagination, ActesFiltres } from './types';
import { formatAr, formatDate, getStatutBadge } from './types';

interface ActesHistoryProps {
  assureId: string;
  actes: ActeItem[];
  pagination: ActesPagination;
  filtres: ActesFiltres;
  loading: boolean;
  showFiltres: boolean;
  onToggleFiltres: () => void;
  nbFiltresActifs: number;
  filtreType: string;
  onFiltreTypeChange: (v: string) => void;
  filtreStatut: string;
  onFiltreStatutChange: (v: string) => void;
  filtreSearch: string;
  onFiltreSearchChange: (v: string) => void;
  /** Période partagée, affichée en lecture seule dans le panneau de filtres. */
  dateDebutPeriode: string;
  dateFinPeriode: string;
  page: number;
  onPageChange: Dispatch<SetStateAction<number>>;
  onAppliquer: () => void;
  onReset: () => void;
}

export default function ActesHistory({
  assureId, actes, pagination, filtres, loading,
  showFiltres, onToggleFiltres, nbFiltresActifs,
  filtreType, onFiltreTypeChange,
  filtreStatut, onFiltreStatutChange,
  filtreSearch, onFiltreSearchChange,
  dateDebutPeriode, dateFinPeriode,
  page, onPageChange, onAppliquer, onReset,
}: ActesHistoryProps) {
  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            Historique des actes réalisés
            {pagination.total > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {pagination.total} acte{pagination.total > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onToggleFiltres}
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
                  onClick={onReset}
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
                    onChange={(e) => onFiltreSearchChange(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              {/* Type d'acte */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Type d'acte</label>
                <select
                  value={filtreType}
                  onChange={(e) => onFiltreTypeChange(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Tous les types</option>
                  {filtres.typesActe.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {/* Statut */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Statut</label>
                <select
                  value={filtreStatut}
                  onChange={(e) => onFiltreStatutChange(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Tous les statuts</option>
                  {filtres.statuts.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              {/* Période : gérée par la barre de filtre de période partagée (en haut de page) */}
              <div className="flex items-end">
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Période : {dateDebutPeriode && dateFinPeriode
                    ? <><strong className="text-foreground">du {dateDebutPeriode.split('-').reverse().join('/')} au {dateFinPeriode.split('-').reverse().join('/')}</strong></>
                    : 'toutes les périodes'}
                </p>
              </div>
            </div>
            {/* Bouton Rechercher */}
            <div className="flex items-center justify-end pt-1">
              <Button
                onClick={onAppliquer}
                disabled={loading || !assureId}
                className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs px-4"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                Rechercher
              </Button>
            </div>
          </div>
        )}

        {/* ── Tableau des actes ── */}
        {loading ? (
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
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Affichage {(page - 1) * pagination.limit + 1}–{Math.min(page * pagination.limit, pagination.total)}
                  sur {pagination.total} acte{pagination.total > 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    disabled={page <= 1}
                    onClick={() => onPageChange(p => p - 1)}
                    aria-label="Page précédente"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  {/* Numéros de page */}
                  {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? 'default' : 'outline'}
                        size="icon" className="h-7 w-7 text-xs"
                        onClick={() => onPageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    disabled={page >= pagination.totalPages}
                    onClick={() => onPageChange(p => p + 1)}
                    aria-label="Page suivante"
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
                onClick={onReset}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
