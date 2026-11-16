'use client';

/**
 * Vue Comptabilité — page d'assemblage (refactoring P2 : le monolithe de 386
 * lignes est découpé dans le dossier `comptabilite/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : réception des KPIs du parent (aucun fetch ici) ;
 *  - affichage transverse : squelette de chargement ;
 *  - délégation : KpiCards, ImportSection (Suivi Excel / SAGE),
 *    TopSocietesChart et ResumeFinancier.
 *
 * Nettoyage au passage : ImportSection recevait `kpis` et `loading` sans
 * jamais les utiliser — props supprimées.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import KpiCards from './comptabilite/kpi-cards';
import ImportSection from './comptabilite/import-section';
import { TopSocietesChart, ResumeFinancier } from './comptabilite/top-societes';
import type { ComptabiliteViewProps } from './comptabilite/types';

export default function ComptabiliteView({ kpis, loading }: ComptabiliteViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-96 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <KpiCards comptabilite={kpis.comptabilite} />

      {/* Section Import Comptabilité (Suivi Excel + SAGE) */}
      <ImportSection />

      {/* Graphique Top 10 */}
      <TopSocietesChart parSociete={kpis.parSociete} />

      {/* Tableau résumé financier */}
      <ResumeFinancier parSociete={kpis.parSociete} />
    </div>
  );
}
