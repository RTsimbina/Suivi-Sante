'use client';

/**
 * Présentateur de la carte de calcul automatique du ticket modérateur
 * (refactoring P2 — extrait du monolithe dossier-form.tsx) : barème, taux de
 * couverture, plafond annuel avec jauge de consommation, alertes, montants
 * remboursé / ticket modérateur et explication.
 */
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calculator, AlertTriangle, Sparkles } from 'lucide-react';
import { formatAr } from './types';
import type { CalculResult } from './types';

interface FormCalculProps {
  calculResult: CalculResult | null;
  calculLoading: boolean;
}

export default function FormCalcul({ calculResult, calculLoading }: FormCalculProps) {
  if (calculLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-600">
        <Loader2 className="size-4 animate-spin" />
        <span>Calcul du ticket modérateur en cours...</span>
      </div>
    );
  }

  if (!calculResult) return null;

  return (
    <Card className="border-brand-200 dark:border-brand-800 bg-gradient-to-br from-brand-50/80 to-teal-50/60 overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-800 dark:text-brand-300">
            <Calculator className="size-4" />
            <Sparkles className="size-3.5 text-amber-500" />
            <span>Calcul automatique</span>
          </div>
          {calculResult.plafondAtteint && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 gap-1">
              <AlertTriangle className="size-3" />
              Plafond atteint
            </Badge>
          )}
        </div>

        {/* Barème info */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-700 dark:text-brand-300/80">
          <span><span className="font-medium text-brand-800 dark:text-brand-300">Barème :</span> {calculResult.bareme}</span>
          <span><span className="font-medium text-brand-800 dark:text-brand-300">Taux de couverture :</span> {calculResult.tauxCouverture}%</span>
          <span><span className="font-medium text-brand-800 dark:text-brand-300">Plafond :</span> {formatAr(calculResult.plafond)}</span>
        </div>

        {/* Plafond annuel : consommation et reliquat */}
        {calculResult.plafondAnnuel && calculResult.plafondAnnuel.details.reliquatActe !== undefined && (
          <div className={`rounded-lg border p-3 space-y-2 ${
            calculResult.plafondAnnuel.autorise
              ? 'bg-info-50/70 border-info-200 dark:bg-info-950/30 dark:border-info-800/60'
              : 'bg-red-50/80 border-red-300 dark:bg-red-950/40 dark:border-red-800/60'
          }`}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-info-800 dark:text-info-300">
              {calculResult.plafondAnnuel.autorise
                ? <><span className="inline-block size-2 rounded-full bg-info-500" /> Plafond annuel — consommation en cours</>
                : <><AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" /> Plafond annuel — BLOQUÉ</>
              }
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <p className="text-muted-foreground">Consommé</p>
                <p className={`font-bold ${calculResult.plafondAnnuel.autorise ? 'text-info-700 dark:text-info-300' : 'text-red-700 dark:text-red-300'}`}>
                  {formatAr(calculResult.plafondAnnuel.details.consommeActe!)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Plafond acte</p>
                <p className="font-bold text-foreground">{formatAr(calculResult.plafondAnnuel.details.plafondActe!)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Reliquat</p>
                <p className={`font-bold ${
                  (calculResult.plafondAnnuel.details.reliquatActe ?? 0) > 0
                    ? 'text-brand-700 dark:text-brand-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>{formatAr(calculResult.plafondAnnuel.details.reliquatActe!)}</p>
              </div>
            </div>
            {/* Jauge de consommation */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  (calculResult.plafondAnnuel.details.consommeActe! / calculResult.plafondAnnuel.details.plafondActe!) >= 1
                    ? 'bg-red-500'
                    : (calculResult.plafondAnnuel.details.consommeActe! / calculResult.plafondAnnuel.details.plafondActe!) >= 0.7
                      ? 'bg-amber-500'
                      : 'bg-info-500'
                }`}
                style={{ width: `${Math.min(100, (calculResult.plafondAnnuel.details.consommeActe! / calculResult.plafondAnnuel.details.plafondActe!) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {((calculResult.plafondAnnuel.details.consommeActe! / calculResult.plafondAnnuel.details.plafondActe!) * 100).toFixed(1)}% consommé
              {calculResult.plafondAnnuel.details.nbActesIdentiques !== undefined && calculResult.plafondAnnuel.details.nbActesIdentiques > 0 && (
                <> · {calculResult.plafondAnnuel.details.nbActesIdentiques} acte(s) cette année</>
              )}
            </p>
            {/* Alertes */}
            {calculResult.plafondAnnuel.alertes.length > 0 && (
              <div className="space-y-1">
                {calculResult.plafondAnnuel.alertes.map((a, i) => (
                  <p key={i} className={`text-xs ${
                    a.type === 'danger' ? 'text-red-600 dark:text-red-400 font-medium' :
                    a.type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    'text-info-600 dark:text-info-400'
                  }`}>{a.message}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Two columns: Montant remboursé / Ticket modérateur */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-brand-100/70 border border-brand-200 dark:border-brand-800/60 p-3 text-center">
            <p className="text-xs font-medium text-brand-700 dark:text-brand-300 mb-1">Montant remboursé</p>
            <p className="text-lg font-bold text-brand-700 dark:text-brand-300">{formatAr(calculResult.calcul.montantRembourse)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 text-center">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Ticket modérateur</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatAr(calculResult.calcul.ticketModerateur)}</p>
          </div>
        </div>

        {/* Explanation */}
        {calculResult.explication && (
          <p className="text-xs text-brand-700 dark:text-brand-300/70 italic">{calculResult.explication}</p>
        )}
      </div>
    </Card>
  );
}
