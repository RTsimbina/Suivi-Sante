'use client';

/**
 * Vue Intelligence IA — page d'assemblage (refactoring P2 : le monolithe de
 * 563 lignes est découpé dans le dossier `ia/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-ia-data (chargement /api/ia avec la période
 *    partagée, cartes expansibles) ;
 *  - affichage transverse : erreur de chargement et squelette ;
 *  - délégation : IaCartesAlertes, IaRetardsAnomalies, IaPiecesManquantes,
 *    IaIncoherences et IaPrevisions.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import IaCartesAlertes from './ia/ia-cartes-alertes';
import IaRetardsAnomalies from './ia/ia-retards-anomalies';
import { IaPiecesManquantes, IaIncoherences } from './ia/ia-details-expansibles';
import IaPrevisions from './ia/ia-previsions';
import { useIaData } from './ia/use-ia-data';

export default function IaView() {
  const ia = useIaData();

  if (ia.error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-3 size-10 text-red-500" />
            <p className="font-semibold text-red-700 dark:text-red-300">Erreur de chargement</p>
            <p className="mt-1 text-sm text-red-600">{ia.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ia.loading || !ia.data) {
    return (
      <div className="space-y-6 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
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

  const { piecesManquantes, incoherences } = ia.data;

  return (
    <div className="space-y-6 p-4">
      {/* Section 1 : 5 Cartes d'alerte */}
      <IaCartesAlertes data={ia.data} expandedCards={ia.expandedCards} onToggleCard={ia.toggleCard} />

      {/* Section 2 : Dossiers en retard + Anomalies */}
      <IaRetardsAnomalies retards={ia.data.retards} anomalies={ia.data.anomalies} />

      {/* Section 2b : Détails expansibles — Pièces manquantes */}
      {ia.expandedCards.has('pieces') && <IaPiecesManquantes piecesManquantes={piecesManquantes} />}

      {/* Section 2c : Détails expansibles — Incohérences */}
      {ia.expandedCards.has('incoherences') && <IaIncoherences incoherences={incoherences} />}

      {/* Section 3 : Prévisions */}
      <IaPrevisions previsions={ia.data.previsions} />
    </div>
  );
}
