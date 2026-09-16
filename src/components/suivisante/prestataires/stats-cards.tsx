'use client';

/**
 * Cartes de statistiques globales de la vue Prestataires.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé.
 */

import { Building2, Stethoscope, Link2, CheckCircle2, Ban } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function StatsCards({
  totalSocietesAvecPresta,
  totalPrestatairesUniques,
  totalLiens,
  totalActifs,
  totalInactifs,
}: {
  totalSocietesAvecPresta: number;
  totalPrestatairesUniques: number;
  totalLiens: number;
  totalActifs: number;
  totalInactifs: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card><CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <p className="text-lg font-bold">{totalSocietesAvecPresta}</p>
          <p className="text-[11px] text-muted-foreground">Sociétés liées</p>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
          <Stethoscope className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-lg font-bold">{totalPrestatairesUniques}</p>
          <p className="text-[11px] text-muted-foreground">Prestataires</p>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
          <Link2 className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <p className="text-lg font-bold">{totalLiens}</p>
          <p className="text-[11px] text-muted-foreground">Total liens</p>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-600">{totalActifs}</p>
          <p className="text-[11px] text-muted-foreground">Actifs</p>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
          <Ban className="h-4 w-4 text-red-500" />
        </div>
        <div>
          <p className="text-lg font-bold text-red-600">{totalInactifs}</p>
          <p className="text-[11px] text-muted-foreground">Inactifs / société</p>
        </div>
      </CardContent></Card>
    </div>
  );
}
