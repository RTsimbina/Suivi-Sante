'use client';

/**
 * Plafonds par type d'acte : blocs colorés selon le taux de consommation
 * (seuils 70 % / 100 %), extensibles pour afficher les dossiers récents du
 * type (présentateur — extrait tel quel de l'ancien monolithe sante-view.tsx ;
 * l'état d'expansion est local, comme le `expandedActes` du monolithe qui
 * survit d'une vérification à l'autre).
 */
import { useState } from 'react';
import {
  Activity, ShieldCheck, ShieldX, AlertTriangle, ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatAr, formatDate, getBarColor, getBarDarkColor, type VerificationResult } from './types';

export default function PlafondsActes({ result }: { result: VerificationResult }) {
  const [expandedActes, setExpandedActes] = useState<Set<string>>(new Set());

  const toggleActe = (key: string) => {
    setExpandedActes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
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
  );
}
