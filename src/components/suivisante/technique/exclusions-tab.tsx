'use client';

/**
 * Onglet 4 : Exclusions & Dépassements de plafond (KPI d'écarts, taux de
 * couverture, tableau filtré par type d'écart).
 * Présentateur pur extrait de technique-view.tsx (Vague 3) — JSX inchangé,
 * l'état est fourni par le hook useExclusions appelé dans TechniqueView.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ShieldAlert,
  CheckCircle,
  XCircle as XCircleIcon,
  TrendingDown,
  Filter,
  Ban,
  ArrowUpRight,
  Info,
} from 'lucide-react';

import { formatMontant, formatMontantCourt } from '../format';
import { ExclusionsState } from './use-exclusions';

export default function ExclusionsTab({
  state,
}: {
  state: ExclusionsState;
}) {
  const { exclusions, exclusionsLoading, exclusionFilter, setExclusionFilter } = state;

  return (
    <div className="space-y-4">
      {/* ── Header with filter pills ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 shadow-sm">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold leading-tight">Exclusions & Dépassements de plafond</h3>
            <p className="text-xs text-muted-foreground">Analyse des écarts entre montants réclamés et validés</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-1">
          {([
            { value: 'all' as const, label: 'Tous', icon: Filter },
            { value: 'depassement' as const, label: 'Dépassements', icon: ArrowUpRight },
            { value: 'exclusion' as const, label: 'Exclusions', icon: Ban },
            { value: 'rejete' as const, label: 'Rejetés', icon: XCircleIcon },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setExclusionFilter(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                exclusionFilter === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {exclusionsLoading ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : (() => {
            const filtered = exclusions.filter((d) => {
              if (exclusionFilter === 'depassement') return d.typeEcart === 'depassement';
              if (exclusionFilter === 'exclusion') return d.typeEcart === 'exclusion';
              if (exclusionFilter === 'rejete') return d.typeEcart === 'rejete';
              return true;
            });

            const totalDepassement = filtered.filter(d => d.typeEcart === 'depassement').length;
            const totalExclusion = filtered.filter(d => d.typeEcart === 'exclusion').length;
            const totalRejete = filtered.filter(d => d.typeEcart === 'rejete').length;
            const montantPerdu = filtered.reduce((acc, d) => acc + d.ecart, 0);
            const montantTotalReclame = filtered.reduce((acc, d) => acc + d.montantReclame, 0);
            const tauxPerte = montantTotalReclame > 0 ? (montantPerdu / montantTotalReclame) * 100 : 0;

            const kpiCards = [
              {
                label: 'Dépassements',
                value: totalDepassement,
                icon: ArrowUpRight,
                gradient: 'from-amber-400 to-orange-500',
                bgLight: 'bg-amber-50 dark:bg-amber-950/30',
                textColor: 'text-amber-700 dark:text-amber-300',
                borderColor: 'border-amber-200/60 dark:border-amber-800/40',
                sub: `${totalDepassement > 0 ? ((totalDepassement / Math.max(filtered.length, 1)) * 100).toFixed(0) : 0}% des dossiers`,
              },
              {
                label: 'Exclusions totales',
                value: totalExclusion,
                icon: Ban,
                gradient: 'from-red-400 to-rose-600',
                bgLight: 'bg-red-50 dark:bg-red-950/30',
                textColor: 'text-red-700 dark:text-red-300',
                borderColor: 'border-red-200/60 dark:border-red-800/40',
                sub: 'Pas de barème défini',
              },
              {
                label: 'Rejetés',
                value: totalRejete,
                icon: XCircleIcon,
                gradient: 'from-slate-400 to-slate-600',
                bgLight: 'bg-slate-50 dark:bg-slate-950/30',
                textColor: 'text-slate-700 dark:text-slate-300',
                borderColor: 'border-slate-200/60 dark:border-slate-800/40',
                sub: 'Dossiers refusés',
              },
              {
                label: 'Montant non couvert',
                value: formatMontantCourt(montantPerdu),
                icon: TrendingDown,
                gradient: 'from-violet-400 to-purple-600',
                bgLight: 'bg-violet-50 dark:bg-violet-950/30',
                textColor: 'text-violet-700 dark:text-violet-300',
                borderColor: 'border-violet-200/60 dark:border-violet-800/40',
                sub: `${tauxPerte.toFixed(1)}% de perte`,
              },
            ];

            return (
              <TooltipProvider delayDuration={300}>
                <div className="p-5 space-y-5">
                  {/* ── KPI Cards ── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {kpiCards.map((kpi) => {
                      const Icon = kpi.icon;
                      return (
                        <div
                          key={kpi.label}
                          className={`relative rounded-xl border ${kpi.borderColor} ${kpi.bgLight} p-4 overflow-hidden transition-shadow hover:shadow-md`}
                        >
                          {/* Top gradient accent */}
                          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${kpi.gradient}`} />
                          <div className="flex items-start justify-between pt-1">
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                              <p className={`text-2xl font-bold tracking-tight ${kpi.textColor}`}>
                                {kpi.value}
                              </p>
                            </div>
                            <div className={`flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br ${kpi.gradient} shadow-sm`}> 
                              <Icon className="h-[18px] w-[18px] text-white" />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">{kpi.sub}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Taux de perte global ── */}
                  {filtered.length > 0 && montantTotalReclame > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Taux de couverture global</span>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{(100 - tauxPerte).toFixed(1)}%</span>
                        </div>
                        <Progress value={100 - tauxPerte} className="h-2.5 [&>div]:bg-gradient-to-r [&>div]:from-emerald-400 [&>div]:to-teal-500" />
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Perte totale</p>
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMontant(montantPerdu)} Ar</p>
                      </div>
                    </div>
                  )}

                  {/* ── Tableau ── */}
                  {filtered.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 mb-4">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Aucune exclusion ou dépassement détecté</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                        Tous les dossiers validés sont dans les plafonds définis par les barèmes.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">N° Dossier</th>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bénéficiaire</th>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Société</th>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Réclamé</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Théorique</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Écart</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Couverture</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {filtered.slice(0, 100).map((d) => {
                              const isExclusion = d.typeEcart === 'exclusion';
                              const isRejete = d.typeEcart === 'rejete';
                              const rowBorderColor = isExclusion
                                ? 'border-l-red-500'
                                : isRejete
                                  ? 'border-l-slate-400'
                                  : 'border-l-amber-400';
                              const rowBg = isExclusion
                                ? 'hover:bg-red-50/50 dark:hover:bg-red-950/20'
                                : isRejete
                                  ? 'hover:bg-slate-50/50 dark:hover:bg-slate-950/20'
                                  : 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20';

                              return (
                                <tr
                                  key={d.id}
                                  className={`border-l-[3px] ${rowBorderColor} ${rowBg} transition-colors`}
                                >
                                  <td className="py-3 px-4 font-mono text-xs font-medium">{d.numeroDossier}</td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-medium">{d.beneficiaire}</span>
                                      {d.motifRejet && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex items-center gap-1 text-[10px] text-red-500 mt-0.5 cursor-help">
                                              <Info className="h-3 w-3" />
                                              {d.motifRejet.length > 30 ? d.motifRejet.slice(0, 30) + '...' : d.motifRejet}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom" className="max-w-xs">
                                            <p className="text-xs">{d.motifRejet}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-xs text-muted-foreground hidden lg:table-cell">{d.societeNom}</td>
                                  <td className="py-3 px-4">
                                    <Badge variant="secondary" className="text-[10px] font-normal">{d.typeDossier}</Badge>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <span className="text-xs font-medium">{formatMontant(d.montantReclame)}</span>
                                  </td>
                                  <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-xs text-muted-foreground">
                                      {d.montantTheorique > 0 ? formatMontant(d.montantTheorique) : '—'}
                                    </span>
                                    {d.plafondApplique !== null && (
                                      <span className="block text-[10px] text-muted-foreground">
                                        Plafond: {formatMontantCourt(d.plafondApplique)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex flex-col items-end gap-1">
                                      <span
                                        className={`text-xs font-bold ${
                                          isExclusion
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                        }`}
                                      >
                                        -{formatMontant(d.ecart)}
                                      </span>
                                      {!isExclusion && !isRejete && d.montantReclame > 0 && (
                                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${
                                              d.pourcentageCouvert > 70
                                                ? 'bg-emerald-500'
                                                : d.pourcentageCouvert > 40
                                                  ? 'bg-amber-500'
                                                  : 'bg-red-500'
                                            }`}
                                            style={{ width: `${d.pourcentageCouvert}%` }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right hidden xl:table-cell">
                                    {d.tauxCouverture !== null ? (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-xs font-medium">{d.pourcentageCouvert}%</span>
                                        <span className="text-[10px] text-muted-foreground">Taux: {d.tauxCouverture}%</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {isRejete ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                        <XCircleIcon className="h-3 w-3" />
                                        Rejeté
                                      </span>
                                    ) : isExclusion ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                        <Ban className="h-3 w-3" />
                                        Exclusion
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                        <ArrowUpRight className="h-3 w-3" />
                                        Dépassement
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* ── Footer récapitulatif ── */}
                      <div className="border-t bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {filtered.length > 100 ? '100 premiers affichés sur' : 'Total'}{' '}
                          <span className="font-semibold text-foreground">{filtered.length}</span> dossier(s)
                        </span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            <span className="text-muted-foreground">Dépassement</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <span className="text-muted-foreground">Exclusion</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            <span className="text-muted-foreground">Rejeté</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
