'use client';

/**
 * Pipeline statique de traitement des dossiers (Réception → Technique →
 * Compta → Paiement), décliné en version horizontale (desktop) et verticale
 * (mobile). Présentateur pur, extrait tel quel de l'ancien monolithe
 * reception-view.tsx.
 */
import { FileInput, Database, ArrowRight, Timer, ChevronRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  { title: 'Réception', desc: 'Saisie dans Excel, création ID unique', icon: FileInput, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800' },
  { title: 'Service Technique', desc: 'Traitement via ISA', icon: Database, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800' },
  { title: 'Comptabilité', desc: 'Décompte Excel + Paiement SAGE', icon: ArrowRight, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800' },
  { title: 'Paiement', desc: 'Virement effectué', icon: Timer, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800' },
];

export default function PipelineCard() {
  return (
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
  );
}
