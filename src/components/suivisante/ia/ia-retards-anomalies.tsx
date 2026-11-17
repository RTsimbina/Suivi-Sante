'use client';

/**
 * Présentateur de la section « retards + anomalies » de la vue Intelligence
 * IA (refactoring P2 — extrait du monolithe ia-view.tsx) : tableau des
 * dossiers en retard par service et liste des anomalies détectées.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { statutLabel, statutColor } from '@/components/suivisante/format';
import { anomalieLabel } from './types';
import type { RetardIa, AnomalieIa } from './types';

export default function IaRetardsAnomalies({ retards, anomalies }: { retards: RetardIa[]; anomalies: AnomalieIa[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Dossiers en retard */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            Dossiers en retard
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">N° Dossier</TableHead>
                  <TableHead className="text-xs">Bénéficiaire</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs">Jours retard</TableHead>
                  <TableHead className="text-xs">Service</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Aucun dossier en retard
                    </TableCell>
                  </TableRow>
                ) : (
                  retards.map((r) => (
                    <TableRow key={r.numeroDossier}>
                      <TableCell className="font-mono text-xs">{r.numeroDossier}</TableCell>
                      <TableCell className="text-sm">{r.beneficiaire}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statutColor(r.statut)}>
                          {statutLabel(r.statut)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={r.joursRetard > 10 ? 'font-bold text-red-600' : 'text-foreground'}>
                          {r.joursRetard} j
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{r.serviceEnCause}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Anomalies détectées */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-500" />
            Anomalies détectées
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
            {anomalies.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Aucune anomalie détectée
              </div>
            ) : (
              anomalies.map((a, idx) => (
                <Card
                  key={`${a.numeroDossier}-${idx}`}
                  className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 py-4 gap-3"
                >
                  <CardContent className="px-4 pb-0 pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {a.numeroDossier}
                      </span>
                      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700">
                        {anomalieLabel[a.typeAnomalie] || a.typeAnomalie}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{a.details}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
