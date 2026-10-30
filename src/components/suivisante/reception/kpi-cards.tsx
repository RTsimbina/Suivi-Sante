'use client';

/**
 * Cartes d'indicateurs de la Réception (présentateur pur — extrait tel quel
 * de l'ancien monolithe reception-view.tsx).
 */
import { FileInput, Timer, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface ReceptionKpis {
  totalEnregistres?: number;
  tempsMoyenAvantTransfert?: number;
  enAttente?: number;
}

export default function KpiCards({ kpis }: { kpis: ReceptionKpis | undefined }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40"><FileInput className="h-6 w-6 text-sky-600" /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total enregistrés</p>
            <p className="text-2xl font-bold">{kpis?.totalEnregistres ?? '—'}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40"><Timer className="h-6 w-6 text-amber-600" /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Temps moyen avant transfert</p>
            <p className="text-2xl font-bold">{kpis?.tempsMoyenAvantTransfert ?? '—'} <span className="text-sm font-normal text-muted-foreground">jours</span></p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">En attente de transfert</p>
            <p className="text-2xl font-bold">{kpis?.enAttente ?? '—'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
