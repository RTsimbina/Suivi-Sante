'use client';

/**
 * Présentateur des sections expansibles de la vue Intelligence IA (refactoring
 * P2 — extrait du monolithe ia-view.tsx) : pièces justificatives manquantes
 * et incohérences de traitement, dépliées depuis les cartes d'alerte.
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
import { FileX, AlertOctagon } from 'lucide-react';
import { incoherenceLabel } from './types';
import type { PieceManquanteIa, IncoherenceIa } from './types';

export function IaPiecesManquantes({ piecesManquantes }: { piecesManquantes: PieceManquanteIa[] }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileX className="size-4 text-amber-600" />
          Pièces justificatives manquantes
          <Badge variant="outline" className="ml-2 border-amber-300 bg-amber-100 text-amber-800">
            {piecesManquantes.length} dossier{piecesManquantes.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="max-h-96 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">N° Dossier</TableHead>
                <TableHead className="text-xs">Bénéficiaire</TableHead>
                <TableHead className="text-xs">Société</TableHead>
                <TableHead className="text-xs text-right">Jours en analyse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {piecesManquantes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Aucun dossier sans pièces justificatives
                  </TableCell>
                </TableRow>
              ) : (
                piecesManquantes.map((p) => (
                  <TableRow key={p.numeroDossier}>
                    <TableCell className="font-mono text-xs">{p.numeroDossier}</TableCell>
                    <TableCell className="text-sm">{p.beneficiaire}</TableCell>
                    <TableCell className="text-sm">{p.societeNom}</TableCell>
                    <TableCell className="text-right">
                      <span className={p.joursEnAnalyse > 7 ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-foreground'}>
                        {p.joursEnAnalyse} j
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function IaIncoherences({ incoherences }: { incoherences: IncoherenceIa[] }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="size-4 text-red-600" />
          Incohérences de traitement
          <Badge variant="outline" className="ml-2 border-red-300 bg-red-100 text-red-800">
            {incoherences.length} incohérence{incoherences.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
          {incoherences.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              Aucune incohérence détectée
            </div>
          ) : (
            incoherences.map((inc, idx) => (
              <Card
                key={`${inc.numeroDossier}-${idx}`}
                className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40/50 dark:bg-red-950/20 py-4 gap-3"
              >
                <CardContent className="px-4 pb-0 pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {inc.numeroDossier}
                    </span>
                    <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700">
                      {incoherenceLabel[inc.typeIncoherence] || inc.typeIncoherence}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{inc.description}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
