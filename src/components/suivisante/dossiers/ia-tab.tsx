'use client';

/**
 * Présentateur de l'onglet IA (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : encart d'analyse des montants, alertes détectées et
 * indicateurs de risque calculés localement.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Loader2, CheckCircle2, ShieldAlert, AlertTriangle, TrendingDown, XCircle,
} from 'lucide-react';
import { formatMontant } from '../format';
import { cn } from '@/lib/utils';
import type { AlerteIa, DossierDetail } from './types';

interface IaTabProps {
  dossier: DossierDetail;
  alertes: AlerteIa[];
  loadingAlertes: boolean;
}

export default function IaTab({ dossier, alertes, loadingAlertes }: IaTabProps) {
  return (
    <div className="space-y-4">
      {/* Encart d'analyse IA */}
      <Card className="border-accent-200 bg-gradient-to-br from-accent-50/80 to-accent-50/60 overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-accent-800">
            <Brain className="size-4" />
            <span>Analyse IA du dossier</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-card/70 border border-accent-200 dark:border-accent-800 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Montant réclamé</p>
              <p className="text-base font-bold text-foreground mt-0.5">{formatMontant(dossier.montantReclame)}</p>
            </div>
            <div className="rounded-lg bg-card/70 border border-accent-200 dark:border-accent-800 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Montant validé</p>
              <p className="text-base font-bold mt-0.5" style={{color: dossier.montantValide && dossier.montantValide < dossier.montantReclame ? '#dc2626' : '#059669'}}>
                {dossier.montantValide ? formatMontant(dossier.montantValide) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-card/70 border border-accent-200 dark:border-accent-800 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Taux couverture</p>
              <p className="text-base font-bold text-accent-700 dark:text-accent-300 mt-0.5">
                {dossier.montantValide && dossier.montantReclame > 0
                  ? ((dossier.montantValide / dossier.montantReclame) * 100).toFixed(1) + '%'
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-card/70 border border-accent-200 dark:border-accent-800 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Ticket mod.</p>
              <p className="text-base font-bold text-amber-600 mt-0.5">
                {dossier.ticketModerateur ? formatMontant(dossier.ticketModerateur) : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertes détectées */}
      {loadingAlertes ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
          <span className="ml-2 text-sm text-muted-foreground">Analyse IA en cours...</span>
        </div>
      ) : alertes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alertes détectées</p>
          {alertes.map((alert, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3',
                alert.niveau === 'error'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40'
              )}
            >
              {alert.niveau === 'error'
                ? <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{color: alert.niveau === 'error' ? '#dc2626' : '#d97706'}}>
                  {alert.type.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
              </div>
              {alert.niveau === 'error' && (
                <Badge variant="outline" className="text-[10px] border-red-200 dark:border-red-800 text-red-600 bg-red-50 dark:bg-red-950/40 shrink-0">
                  Critique
                </Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="h-12 w-12 rounded-full bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-6 w-6 text-brand-500" />
          </div>
          <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Aucune alerte détectée</p>
          <p className="text-xs text-muted-foreground mt-1">Ce dossier ne présente aucune anomalie identifiée par l&apos;IA.</p>
        </div>
      )}

      {/* Indicateurs de risque */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-accent-500" />
            Indicateurs de risque
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dossier.montantReclame < 0 && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-3.5 w-3.5" />
              Montant réclamé négatif
            </div>
          )}
          {dossier.montantValide !== null && dossier.montantValide < dossier.montantReclame * 0.5 && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Couverture inférieure à 50% — écart significatif
            </div>
          )}
          {dossier.statut === 'REJETE' && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              Dossier rejeté{dossier.motifRejet ? ` : ${dossier.motifRejet}` : ''}
            </div>
          )}
          {dossier.montantValide !== null && dossier.montantValide === 0 && dossier.montantReclame > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              Montant validé à zéro — exclusion totale
            </div>
          )}
          {!dossier.montantValide && dossier.statut === 'VALIDE' && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Dossier validé sans montant validé
            </div>
          )}
          {dossier.montantReclame >= 0 &&
            (dossier.montantValide === null || dossier.montantValide >= dossier.montantReclame * 0.5) &&
            dossier.statut !== 'REJETE' && (
            <div className="flex items-center gap-2 text-sm text-brand-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aucun indicateur de risque identifié
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
