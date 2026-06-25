'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, CheckCircle2, XCircle, Loader2, Clock, Currency } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatMontantCourt } from './format';

interface TechniqueViewProps {
  kpis: {
    technique: { totalAnalyses: number; totalValides: number; totalRejetes: number; delaiMoyenAnalyse: number; montantTotalValide: number; enCours: number };
    productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  } | null;
  loading: boolean;
}

const kpiDefs = [
  { key: 'totalAnalyses', label: 'Dossiers analysés', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'totalValides', label: 'Validés', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'totalRejetes', label: 'Rejetés', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  { key: 'enCours', label: 'En cours', icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'delaiMoyenAnalyse', label: 'Délai moyen (j)', icon: Clock, color: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'montantTotalValide', label: 'Montant validé', icon: Currency, color: 'text-emerald-600', bg: 'bg-emerald-50', format: true },
];

const PIE_COLORS = ['#f59e0b', '#10b981', '#ef4444'];

export default function TechniqueView({ kpis, loading }: TechniqueViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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

  const pieData = [
    { name: 'En cours', value: kpis.technique.enCours },
    { name: 'Validés', value: kpis.technique.totalValides },
    { name: 'Rejetés', value: kpis.technique.totalRejetes },
  ].filter(d => d.value > 0);

  const techGestionnaires = kpis.productivite.filter(p => p.service === 'TECHNIQUE');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.technique[def.key as keyof typeof kpis.technique] as number;
          const Icon = def.icon;
          return (
            <Card key={def.key}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${def.bg}`}><Icon className={`h-4 w-4 ${def.color}`} /></div>
                  <span className="text-xs text-muted-foreground font-medium">{def.label}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {def.format ? formatMontantCourt(val) : val.toLocaleString('fr-FR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Répartition des statuts</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Performance gestionnaires techniques</CardTitle></CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nom</th>
                  <th className="pb-2 font-medium text-right">Dossiers</th>
                  <th className="pb-2 font-medium text-right">Montant</th>
                  <th className="pb-2 font-medium text-right">Tps moyen (j)</th>
                </tr>
              </thead>
              <tbody>
                {techGestionnaires.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.gestionnaireNom}</td>
                    <td className="py-2 text-right">{p.nbDossiers}</td>
                    <td className="py-2 text-right">{formatMontantCourt(p.montantTraite)}</td>
                    <td className="py-2 text-right">{p.tempsMoyenTraitement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}