'use client';

/**
 * Vue Technique — conteneur principal.
 *
 * Découpée en Vague 3 (comportement inchangé) :
 * - Les hooks (état) restent appelés ICI : Radix démonte le contenu des onglets
 *   inactifs, l'état doit donc vivre au niveau du conteneur pour survivre aux
 *   changements d'onglets.
 * - Les 4 onglets sont des présentateurs purs dans ./technique/.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ClipboardCheck,
  Building2,
  Calculator,
  Upload,
  ShieldAlert,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

import { formatMontantCourt } from './format';
import {
  kpiDefs,
  PIE_COLORS,
  TechniqueKpis,
} from './technique/types';
import { useSocietesBaremes } from './technique/use-societes-baremes';
import { useCalculTM } from './technique/use-calcul-tm';
import { useImportISA } from './technique/use-import-isa';
import { useExclusions } from './technique/use-exclusions';
import SocietesBaremesTab from './technique/societes-baremes-tab';
import CalculTMTab from './technique/calcul-tm-tab';
import ImportISATab from './technique/import-isa-tab';
import ExclusionsTab from './technique/exclusions-tab';

interface TechniqueViewProps {
  kpis: TechniqueKpis | null;
  loading: boolean;
}

export default function TechniqueView({ kpis, loading }: TechniqueViewProps) {
  // ─── État des onglets (hooks conteneur) ───
  const societesBaremes = useSocietesBaremes();
  const calculTM = useCalculTM(societesBaremes.societes);
  const importISA = useImportISA();
  const exclusions = useExclusions();

  // ─── Render: Loading state ───
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
  ].filter((d) => d.value > 0);

  const techGestionnaires = kpis.productivite.filter((p) => p.service === 'TECHNIQUE');

  return (
    <div className="space-y-6">
      {/* ─── Section 1: KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.technique[def.key as keyof typeof kpis.technique] as number;
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
                  {def.format ? formatMontantCourt(val) : val.toLocaleString('fr-FR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Pie Chart + Performance Table ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Répartition des statuts</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Performance gestionnaires techniques</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            {techGestionnaires.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucune donnée de performance disponible.</p>
                <p className="text-xs mt-1">Les données apparaîtront une fois les dossiers traités par le service technique.</p>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Section 2: Tabs ─── */}
      <Tabs defaultValue="societes" className="w-full">
        <TabsList>
          <TabsTrigger value="societes" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Sociétés &amp; Barèmes</span>
            <span className="sm:hidden">Sociétés</span>
          </TabsTrigger>
          <TabsTrigger value="calcul" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Calcul Ticket Modérateur</span>
            <span className="sm:hidden">Calcul TM</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import ISA</span>
            <span className="sm:hidden">Import</span>
          </TabsTrigger>
          <TabsTrigger value="exclusions" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Exclusions / Dépassements</span>
            <span className="sm:hidden">Exclusions</span>
          </TabsTrigger>
        </TabsList>

        {/* ────────────────────────────────────────────────
            Tab 1: Sociétés & Barèmes
        ──────────────────────────────────────────────── */}
        <TabsContent value="societes">
          <SocietesBaremesTab state={societesBaremes} />
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 2: Calcul Ticket Modérateur
        ──────────────────────────────────────────────── */}
        <TabsContent value="calcul">
          <CalculTMTab societes={societesBaremes.societes} state={calculTM} />
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 3: Import ISA
        ──────────────────────────────────────────────── */}
        <TabsContent value="import">
          <ImportISATab state={importISA} />
        </TabsContent>

        {/* ────────────────────────────────────────────────
            Tab 4: Exclusions / Dépassements de plafond
        ──────────────────────────────────────────────── */}
        <TabsContent value="exclusions">
          <ExclusionsTab state={exclusions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
