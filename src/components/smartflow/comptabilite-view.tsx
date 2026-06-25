'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSpreadsheet, BadgeCheck, HourglassIcon, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatMontantCourt } from './format';

interface ComptabiliteViewProps {
  kpis: {
    comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
    parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  } | null;
  loading: boolean;
}

const kpiDefs = [
  { key: 'decomptesRecus', label: 'Décomptes reçus', icon: FileSpreadsheet, color: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'paiementsEffectues', label: 'Paiements effectués', icon: BadgeCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'enCoursPaiement', label: 'En cours de paiement', icon: HourglassIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'montantTotalPaye', label: 'Montant total payé', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', format: true },
];

export default function ComptabiliteView({ kpis, loading }: ComptabiliteViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const topSocietes = [...kpis.parSociete].sort((a, b) => b.montantPaye - a.montantPaye).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.comptabilite[def.key as keyof typeof kpis.comptabilite] as number;
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

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 10 sociétés par montant payé</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topSocietes} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(v: number) => formatMontantCourt(v)} fontSize={11} />
              <YAxis type="category" dataKey="societeNom" width={120} fontSize={11} tickLine={false} />
              <Tooltip formatter={(v: number) => [formatMontantCourt(v), 'Montant payé']} />
              <Bar dataKey="montantPaye" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Résumé financier par société</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          <div className="min-w-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Société</th>
                  <th className="pb-2 font-medium text-right">Dossiers</th>
                  <th className="pb-2 font-medium text-right">Réclamé</th>
                  <th className="pb-2 font-medium text-right">Payé</th>
                  <th className="pb-2 font-medium text-right">Coût moyen</th>
                </tr>
              </thead>
              <tbody>
                {kpis.parSociete.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.societeNom}</td>
                    <td className="py-2 text-right">{s.nbDossiers}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.montantReclame)}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.montantPaye)}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.coutMoyen)}</td>
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