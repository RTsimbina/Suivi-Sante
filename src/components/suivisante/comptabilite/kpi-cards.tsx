'use client';

/**
 * Présentateur des 4 cartes KPI de comptabilité (refactoring P2 — extrait du
 * monolithe comptabilite-view.tsx) : décomptes reçus, paiements effectués,
 * en cours de paiement et montant total payé (format court).
 */
import { Card, CardContent } from '@/components/ui/card';
import { FileSpreadsheet, BadgeCheck, HourglassIcon, Wallet } from 'lucide-react';
import { formatMontantCourt } from '../format';

interface ComptaKpi {
  decomptesRecus: number;
  paiementsEffectues: number;
  montantTotalPaye: number;
  enCoursPaiement: number;
}

const kpiDefs = [
  { key: 'decomptesRecus', label: 'Décomptes reçus', icon: FileSpreadsheet, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40' },
  { key: 'paiementsEffectues', label: 'Paiements effectués', icon: BadgeCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'enCoursPaiement', label: 'En cours de paiement', icon: HourglassIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'montantTotalPaye', label: 'Montant total payé', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', format: true },
] as const;

export default function KpiCards({ comptabilite }: { comptabilite: ComptaKpi }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpiDefs.map((def) => {
        const val = comptabilite[def.key] as number;
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
  );
}
