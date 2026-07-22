'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, CheckCircle2, CreditCard, XCircle, Clock, TrendingUp, DollarSign, Percent,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatMontantCourt, statutLabel, statutColor } from './format';

interface DirectionViewProps {
  kpis: {
    direction: { totalRecus: number; totalTraites: number; totalPayes: number; totalRejetes: number; delaiMoyenGlobal: number; montantTotalReclame: number; montantTotalPaye: number; tauxRejet: number };
    volumeMensuel: { mois: string; nbDossiers: number }[];
    parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
    productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  } | null;
  loading: boolean;
}

const kpiDefs = [
  { key: 'totalRecus', label: 'Dossiers reçus', icon: FileText, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40' },
  { key: 'totalTraites', label: 'Traités', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'totalPayes', label: 'Payés', icon: CreditCard, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40' },
  { key: 'totalRejetes', label: 'Rejetés', icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
  { key: 'delaiMoyenGlobal', label: 'Délai moyen (j)', icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'montantTotalReclame', label: 'Montant réclamé', icon: DollarSign, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', format: true },
  { key: 'montantTotalPaye', label: 'Montant payé', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', format: true },
  { key: 'tauxRejet', label: 'Taux de rejet', icon: Percent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', isPercent: true },
];

const serviceColors: Record<string, string> = {
  RECEPTION: 'bg-sky-100 text-sky-700 dark:text-sky-300 dark:bg-sky-900/50 dark:text-sky-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:text-amber-300 dark:bg-amber-900/50 dark:text-amber-300',
  COMPTABILITE: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300',
};

export default function DirectionView({ kpis, loading }: DirectionViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const sortedSocietes = [...kpis.parSociete].sort((a, b) => b.nbDossiers - a.nbDossiers).slice(0, 8);
  const monthLabels: Record<string, string> = {
    '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr', '05': 'Mai', '06': 'Juin',
    '07': 'Juil', '08': 'Août', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.direction[def.key as keyof typeof kpis.direction] as number;
          const Icon = def.icon;
          return (
            <Card key={def.key}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${def.bg}`}>
                    <Icon className={`h-4 w-4 ${def.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{def.label}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {def.format ? formatMontantCourt(val) : def.isPercent ? `${val}%` : val.toLocaleString('fr-FR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Volume de dossiers par mois</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={kpis.volumeMensuel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis dataKey="mois" tickFormatter={(v: string) => monthLabels[v.split('-')[1]] || v} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => [v, 'Dossiers']} labelFormatter={(l: string) => monthLabels[l.split('-')[1]] || l} />
                <Bar dataKey="nbDossiers" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Montants par société (Top 8)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sortedSocietes} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis type="number" tickFormatter={(v: number) => formatMontantCourt(v)} fontSize={11} />
                <YAxis type="category" dataKey="societeNom" width={100} fontSize={11} tickLine={false} />
                <Tooltip formatter={(v: number, name: string) => [formatMontantCourt(v), name === 'montantReclame' ? 'Réclamé' : 'Payé']} />
                <Bar dataKey="montantReclame" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={12} />
                <Bar dataKey="montantPaye" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productivité par gestionnaire</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          <div className="min-w-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Gestionnaire</th>
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium text-right">Dossiers</th>
                  <th className="pb-2 font-medium text-right">Montant traité</th>
                  <th className="pb-2 font-medium text-right">Temps moyen (j)</th>
                </tr>
              </thead>
              <tbody>
                {kpis.productivite.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.gestionnaireNom}</td>
                    <td className="py-2"><Badge variant="outline" className={serviceColors[p.service] || ''}>{statutLabel(p.service)}</Badge></td>
                    <td className="py-2 text-right">{p.nbDossiers}</td>
                    <td className="py-2 text-right">{formatMontantCourt(p.montantTraite)}</td>
                    <td className="py-2 text-right">{p.tempsMoyenTraitement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}