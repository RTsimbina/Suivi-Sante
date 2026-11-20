'use client';

/**
 * Présentateur de la prévision de charge de la vue Intelligence IA (refactoring
 * P2 — extrait du monolithe ia-view.tsx) : volume attendu, risque global,
 * charge estimée par gestionnaire et barre d'indicateur de risque.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp } from 'lucide-react';
import { getRisqueColor, getRisqueTextColor, getRisqueLabel } from './types';
import type { PrevisionIa } from './types';

export default function IaPrevisions({ previsions }: { previsions: PrevisionIa }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="size-4 text-brand-600" />
          Prévision de charge
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Volume attendu par mois</p>
            <p className="text-3xl font-bold text-foreground">
              {new Intl.NumberFormat('fr-FR').format(previsions.volumeAttendu)}
            </p>
          </div>
          <div className="sm:ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Risque de retard global</span>
            <span className={`text-lg font-bold ${getRisqueTextColor(previsions.risqueRetard)}`}>
              {previsions.risqueRetard}%
            </span>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Nom</TableHead>
                <TableHead className="text-xs">Service</TableHead>
                <TableHead className="text-xs text-right">Dossiers actifs</TableHead>
                <TableHead className="text-xs text-right">Charge estimée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previsions.chargeParGestionnaire.map((g) => (
                <TableRow key={g.nom}>
                  <TableCell className="font-medium text-sm">{g.nom}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.service}</TableCell>
                  <TableCell className="text-sm text-right">{g.dossiersActifs}</TableCell>
                  <TableCell className="text-sm text-right font-mono">
                    {g.chargeEstimee}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Indicateur de risque de retard</span>
            <span className={`font-semibold ${getRisqueTextColor(previsions.risqueRetard)}`}>
              {getRisqueLabel(previsions.risqueRetard)} ({previsions.risqueRetard}%)
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getRisqueColor(previsions.risqueRetard)}`}
              style={{ width: `${Math.min(previsions.risqueRetard, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
