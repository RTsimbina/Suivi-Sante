'use client';

/**
 * Présentateurs du graphique « Top 10 sociétés par montant payé » (recharts,
 * barres horizontales) et du tableau « Résumé financier par société »
 * (refactoring P2 — extraits du monolithe comptabilite-view.tsx).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatMontantCourt } from '../format';
import type { ComptabiliteViewProps } from './types';

type ParSociete = NonNullable<ComptabiliteViewProps['kpis']>['parSociete'];

export function TopSocietesChart({ parSociete }: { parSociete: ParSociete }) {
  const topSocietes = [...parSociete].sort((a, b) => b.montantPaye - a.montantPaye).slice(0, 10);

  return (
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
  );
}

export function ResumeFinancier({ parSociete }: { parSociete: ParSociete }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Résumé financier par société</CardTitle></CardHeader>
      <CardContent className="max-h-96 overflow-y-auto">
        <div className="min-w-[500px]">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Société</th>
                <th className="pb-2 font-medium text-right">Dossiers</th>
                <th className="pb-2 font-medium text-right">Réclamé</th>
                <th className="pb-2 font-medium text-right">Payé</th>
                <th className="pb-2 font-medium text-right">Coût moyen</th>
              </tr>
            </thead>
            <tbody>
              {parSociete.map((s, i) => (
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
  );
}
