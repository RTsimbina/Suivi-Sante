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
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Loader2 className="size-4 animate-spin" />
        <span>Calcul du ticket modérateur en cours...</span>
      </div>
    );
  }

  if (!calculResult) return null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700 dark:text-emerald-300/80">
          <span><span className="font-medium text-emerald-800 dark:text-emerald-300">Barème :</span> {calculResult.bareme}</span>
          <span><span className="font-medium text-emerald-800 dark:text-emerald-300">Taux de couverture :</span> {calculResult.tauxCouverture}%</span>
          <span><span className="font-medium text-emerald-800 dark:text-emerald-300">Plafond :</span> {formatAr(calculResult.plafond)}</span>
        </div>

        {/* Plafond annuel : consommation et reliquat */}
        {calculResult.plafondAnnuel && calculResult.plafondAnnuel.details.reliquatActe !== undefined && (
          <div className={`rounded-lg border p-3 space-y-2 ${
            calculResult.plafondAnnuel.autorise
              ? 'bg-blue-50/70 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/60'
              : 'bg-red-50/80 border-red-300 dark:bg-red-950/40 dark:border-red-800/60'
          }`}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800 dark:text-blue-300">
              {calculResult.plafondAnnuel.autorise
                ? <><span className="inline-block size-2 rounded-full bg-blue-500" /> Plafond annuel — consommation en cours</>
                : <><AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" /> Plafond annuel — BLOQUÉ</>
              }
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <p className="text-muted-foreground">Consommé</p>
                <p className={`font-bold ${calculResult.plafondAnnuel.autorise ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
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
                    ? 'text-emerald-700 dark:text-emerald-300'
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
                      : 'bg-blue-500'
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
                    'text-blue-600 dark:text-blue-400'
                  }`}>{a.message}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Two columns: Montant remboursé / Ticket modérateur */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-emerald-100/70 border border-emerald-200 dark:border-emerald-800/60 p-3 text-center">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Montant remboursé</p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatAr(calculResult.calcul.montantRembourse)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40/70 border border-amber-200 dark:border-amber-800/60 p-3 text-center">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Ticket modérateur</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatAr(calculResult.calcul.ticketModerateur)}</p>
          </div>
        </div>

        {/* Explanation */}
        {calculResult.explication && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300/70 italic">{calculResult.explication}</p>
        )}
      </div>
    </Card>
  );
}
