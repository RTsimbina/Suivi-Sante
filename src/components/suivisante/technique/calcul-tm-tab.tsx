'use client';

/**
 * Onglet 2 : Calcul du Ticket Modérateur (formulaire + résultat, 100% frontend).
 * Présentateur pur extrait de technique-view.tsx (Vague 3) — JSX inchangé,
 * l'état est fourni par useCalculTM (appelé dans TechniqueView) et la liste
 * des sociétés par useSocietesBaremes.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator } from 'lucide-react';

import { formatMontant } from '../format';
import { PRESTATIONS, PRESTATION_LABELS, Societe } from './types';
import { CalculTMState } from './use-calcul-tm';

export default function CalculTMTab({
  societes,
  state,
}: {
  societes: Societe[];
  state: CalculTMState;
}) {
  const {
    calcSocieteId,
    setCalcSocieteId,
    calcPrestation,
    setCalcPrestation,
    calcMontant,
    setCalcMontant,
    calcResult,
    handleCalculer,
  } = state;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" />
            Calcul du Ticket Modérateur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calc-societe">Société</Label>
            <Select value={calcSocieteId} onValueChange={setCalcSocieteId}>
              <SelectTrigger id="calc-societe" className="w-full">
                <SelectValue placeholder="Sélectionner une société" />
              </SelectTrigger>
              <SelectContent>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calc-prestation">Type de prestation</Label>
            <Select value={calcPrestation} onValueChange={setCalcPrestation}>
              <SelectTrigger id="calc-prestation" className="w-full">
                <SelectValue placeholder="Sélectionner un type" />
              </SelectTrigger>
              <SelectContent>
                {PRESTATIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRESTATION_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calc-montant">Montant réclamé (Ar)</Label>
            <Input
              id="calc-montant"
              type="number"
              min={0}
              placeholder="Ex: 250000"
              value={calcMontant}
              onChange={(e) => setCalcMontant(e.target.value)}
            />
          </div>

          <Button
            onClick={handleCalculer}
            disabled={!calcSocieteId || !calcPrestation || !calcMontant}
            className="w-full gap-2"
          >
            <Calculator className="h-4 w-4" />
            Calculer
          </Button>
        </CardContent>
      </Card>

      {calcResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Résultat du calcul</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Barème appliqué</span>
                <span className="font-medium">
                  {calcResult.bareme.tauxCouverture}% — Plafond : {formatMontant(calcResult.bareme.plafond)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Montant couvert</span>
                <span className="font-medium">{formatMontant(calcResult.montantCouvert)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-1 font-medium">Montant remboursé</p>
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatMontant(calcResult.montantRembourse)}
              </p>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/40 p-4">
              <p className="text-xs text-orange-700 mb-1 font-medium">Ticket modérateur</p>
              <p className="text-3xl font-bold text-orange-700">
                {formatMontant(calcResult.ticketModerateur)}
              </p>
            </div>

            {calcResult.explication && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">Explication</p>
                <p className="text-sm text-muted-foreground">{calcResult.explication}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!calcResult && (
        <Card className="flex items-center justify-center min-h-[200px]">
          <div className="text-center text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Remplissez le formulaire et cliquez sur &quot;Calculer&quot;</p>
            <p className="text-xs mt-1">Le résultat s&apos;affichera ici.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
