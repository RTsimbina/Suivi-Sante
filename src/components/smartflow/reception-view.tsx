'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileInput, Timer, AlertTriangle, ChevronRight, ChevronDown, Database, ArrowRight } from 'lucide-react';
import { formatMontantCourt, statutLabel, statutColor } from './format';

interface ReceptionViewProps {
  kpis: {
    reception: { totalEnregistres: number; tempsMoyenAvantTransfert: number; enAttente: number };
  } | null;
  loading: boolean;
}

const steps = [
  { title: 'Réception', desc: 'Saisie dans Excel, création ID unique', icon: FileInput, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
  { title: 'Service Technique', desc: 'Traitement via ISA', icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { title: 'Comptabilité', desc: 'Décompte Excel + Paiement SAGE', icon: ArrowRight, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  { title: 'Paiement', desc: 'Virement effectué', icon: Timer, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

export default function ReceptionView({ kpis, loading }: ReceptionViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-sky-50"><FileInput className="h-6 w-6 text-sky-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total enregistrés</p>
              <p className="text-2xl font-bold">{kpis.reception.totalEnregistres}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50"><Timer className="h-6 w-6 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Temps moyen avant transfert</p>
              <p className="text-2xl font-bold">{kpis.reception.tempsMoyenAvantTransfert} <span className="text-sm font-normal text-muted-foreground">jours</span></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">En attente de transfert</p>
              <p className="text-2xl font-bold">{kpis.reception.enAttente}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Pipeline de traitement des dossiers</CardTitle></CardHeader>
        <CardContent>
          <div className="hidden md:flex items-center justify-between gap-2">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 p-4 rounded-xl border ${step.border} ${step.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <step.icon className={`h-5 w-5 ${step.color}`} />
                    <span className="font-semibold text-sm">{step.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < steps.length - 1 && <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-center gap-2">
                <div className={`flex-1 p-4 rounded-xl border ${step.border} ${step.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <step.icon className={`h-5 w-5 ${step.color}`} />
                    <span className="font-semibold text-sm">{step.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < steps.length - 1 && <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Informations capturées à la réception</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Numéro dossier', value: 'DOS-2026-XXXXXX', auto: true },
              { label: 'Nom bénéficiaire', value: 'Saisie manuelle' },
              { label: 'Société', value: 'Sélection client' },
              { label: 'Date réception', value: 'Date du jour' },
              { label: 'Type de dossier', value: 'Hosp., Consult., Pharm., etc.' },
              { label: 'Source', value: 'Excel (Power Automate)' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                  {item.auto && <Badge variant="outline" className="mt-1 text-emerald-600 border-emerald-200 text-[10px]">Auto-généré par IA</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}