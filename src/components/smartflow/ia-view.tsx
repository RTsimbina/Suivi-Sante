'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, TrendingUp } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { statutLabel, statutColor } from '@/components/smartflow/format';

interface IaData {
  retards: {
    numeroDossier: string;
    beneficiaire: string;
    statut: string;
    joursRetard: number;
    serviceEnCause: string;
  }[];
  anomalies: {
    numeroDossier: string;
    typeAnomalie: string;
    details: string;
  }[];
  previsions: {
    volumeAttendu: number;
    chargeParGestionnaire: {
      nom: string;
      service: string;
      dossiersActifs: number;
      chargeEstimee: number;
    }[];
    risqueRetard: number;
  };
}

const anomalieLabel: Record<string, string> = {
  ECART_MONTANT: 'Écart de montant',
  DECOMPTE_MANQUANT: 'Décompte manquant',
};

function getRisqueColor(risque: number): string {
  if (risque > 30) return 'bg-red-500';
  if (risque > 15) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getRisqueTextColor(risque: number): string {
  if (risque > 30) return 'text-red-600';
  if (risque > 15) return 'text-amber-600';
  return 'text-emerald-600';
}

function getRisqueLabel(risque: number): string {
  if (risque > 30) return 'Élevé';
  if (risque > 15) return 'Modéré';
  return 'Faible';
}

export default function IaView() {
  const [data, setData] = useState<IaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/ia');
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}: ${res.statusText}`);
        }
        const json: IaData = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-red-200 bg-red-50 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-3 size-10 text-red-500" />
            <p className="font-semibold text-red-700">Erreur de chargement</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6 p-4">
        {/* Skeleton pour les alertes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Skeleton pour le milieu */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-6 w-48" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-6 w-48" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
        {/* Skeleton pour les prévisions */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { retards, anomalies, previsions } = data;

  return (
    <div className="space-y-6 p-4">
      {/* Section 1 : Cartes d'alerte */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                <AlertTriangle className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Dossiers en retard
                </p>
                <p className="text-2xl font-bold text-red-800 dark:text-red-300">
                  {retards.length}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-red-600/80 dark:text-red-500/80">
              Dossiers nécessitant une attention immédiate
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                <ShieldAlert className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Anomalies détectées
                </p>
                <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">
                  {anomalies.length}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-amber-600/80 dark:text-amber-500/80">
              Écarts et irrégularités identifiés par l&apos;IA
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
                <TrendingUp className="size-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                  Risque de retard
                </p>
                <p className={`text-2xl font-bold ${getRisqueTextColor(previsions.risqueRetard)}`}>
                  {previsions.risqueRetard}%
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-orange-600/80 dark:text-orange-500/80">
              Niveau de risque : {getRisqueLabel(previsions.risqueRetard)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 : Deux colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Colonne gauche : Dossiers en retard */}
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
                          <span
                            className={
                              r.joursRetard > 10
                                ? 'font-bold text-red-600'
                                : 'text-foreground'
                            }
                          >
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

        {/* Colonne droite : Anomalies détectées */}
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
                    className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 py-4 gap-3"
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

      {/* Section 3 : Prévisions */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600" />
            Prévision de charge
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          {/* Volume attendu */}
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

          {/* Tableau des gestionnaires */}
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

          {/* Barre de progression du risque */}
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
    </div>
  );
}