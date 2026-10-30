'use client';

/**
 * Simulateur multi-actes : lignes de saisie (type + montant) dynamiques,
 * verdict détaillé par acte (plafond, reliquat, part assureur/patient),
 * actes identiques, alertes et résumé agrégé (présentateur pur — extraits
 * tels quels de l'ancien monolithe sante-view.tsx).
 */
import {
  Calculator, Plus, Trash2, ArrowRight, Loader2, CheckCircle2, XCircle, Clock, Ban, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatAr, type SimLigne, type MultiSimResult } from './types';

interface SimulateurActesProps {
  /** Types d'acte disponibles (clés du barème de la société de l'assuré). */
  typesActe: string[];
  simLignes: SimLigne[];
  simLoading: boolean;
  simResults: MultiSimResult[];
  onAddLigne: () => void;
  onRemoveLigne: (id: string) => void;
  onUpdateLigne: (id: string, field: 'typeActe' | 'montant', value: string) => void;
  onSimuler: () => void;
  onEffacerResultats: () => void;
}

export default function SimulateurActes({
  typesActe, simLignes, simLoading, simResults,
  onAddLigne, onRemoveLigne, onUpdateLigne, onSimuler, onEffacerResultats,
}: SimulateurActesProps) {
  return (
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
            onClick={onAddLigne}
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
                    onChange={(e) => onUpdateLigne(ligne.id, 'typeActe', e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">-- Sélectionner --</option>
                    {typesActe.map(acte => (
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
                    onChange={(e) => onUpdateLigne(ligne.id, 'montant', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-red-600 shrink-0"
                onClick={() => onRemoveLigne(ligne.id)}
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
            onClick={onSimuler}
            disabled={simLoading || simLignes.every(l => !l.typeActe || !l.montant)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {simLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
            Simuler {simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0).length > 1
              ? `${simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0).length} actes`
              : 'la prise en charge'}
          </Button>
          {simResults.length > 0 && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onEffacerResultats}>
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
  );
}
