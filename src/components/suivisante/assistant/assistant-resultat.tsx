'use client';

/**
 * Présentateurs du rendu de résultat de l'assistant (refactoring P2 — extraits
 * du monolithe assistant-view.tsx) : carte générique (titre, type, synthèse),
 * corps spécialisé par type (montant/nombre, KPI, tableau/liste, graphique
 * barres), icônes et formatage des cellules.
 */
import { Badge } from '@/components/ui/badge';
import {
  Coins, Hash, Table2, BarChart3, ListChecks, Gauge, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMontant, formatDate } from '../format';
import type { AssistantResult, ResultColonne } from '@/lib/assistant/types';

export function CarteResultat({ resultat }: { resultat: AssistantResult }) {
  return (
    <div className="bg-card border rounded-2xl rounded-bl-sm shadow-sm overflow-hidden w-full">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IconeResultat type={resultat.type} />
          <span className="text-xs font-medium truncate">{resultat.titre}</span>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0">{resultat.type}</Badge>
      </div>
      <div className="p-4 space-y-3">
        <CorpsResultat resultat={resultat} />
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/90">{resultat.synthese}</p>
          {resultat.periode && (
            <p className="text-[10px] text-muted-foreground">Période : {resultat.periode.label}</p>
          )}
          <p className="text-[9px] text-muted-foreground/60">
            Résultat issu directement de la base de données — généré le {formatDate(resultat.date)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function IconeResultat({ type }: { type: string }) {
  switch (type) {
    case 'MONTANT': return <Coins className="h-3.5 w-3.5 text-emerald-600" />;
    case 'NOMBRE': return <Hash className="h-3.5 w-3.5 text-emerald-600" />;
    case 'TABLEAU': return <Table2 className="h-3.5 w-3.5 text-emerald-600" />;
    case 'LISTE': return <ListChecks className="h-3.5 w-3.5 text-emerald-600" />;
    case 'GRAPHIQUE': return <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />;
    case 'KPI': return <Gauge className="h-3.5 w-3.5 text-emerald-600" />;
    default: return <Info className="h-3.5 w-3.5 text-emerald-600" />;
  }
}

function CorpsResultat({ resultat }: { resultat: AssistantResult }) {
  switch (resultat.type) {
    case 'NOMBRE':
    case 'MONTANT':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
            {resultat.type === 'MONTANT' ? formatMontant(resultat.valeur ?? 0) : new Intl.NumberFormat('fr-FR').format(resultat.valeur ?? 0)}
          </span>
          {resultat.type === 'NOMBRE' && resultat.unite && (
            <span className="text-xs text-muted-foreground">{resultat.unite}</span>
          )}
        </div>
      );
    case 'KPI':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(resultat.kpis ?? []).map((k) => (
            <div key={k.label} className="rounded-lg border p-2.5 bg-muted/20">
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
              <p className="text-sm font-semibold mt-0.5">
                {k.type === 'montant' ? formatMontant(k.valeur) : k.type === 'pourcentage' ? `${k.valeur} %` : new Intl.NumberFormat('fr-FR').format(k.valeur)}
              </p>
            </div>
          ))}
        </div>
      );
    case 'TABLEAU':
    case 'LISTE':
      return <TableauResultat colonnes={resultat.colonnes ?? []} lignes={resultat.lignes ?? []} total={resultat.totalLignes ?? 0} />;
    case 'GRAPHIQUE':
      return <GraphiqueResultat serie={resultat.serie ?? []} nom={resultat.serieNom ?? ''} />;
    default:
      return null;
  }
}

function TableauResultat({ colonnes, lignes, total }: { colonnes: ResultColonne[]; lignes: Record<string, string | number | null>[]; total: number }) {
  if (lignes.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune donnée correspondant aux critères sélectionnés.</p>;
  }
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
          <tr>
            {colonnes.map((c) => (
              <th key={c.key} className={cn('px-2.5 py-2 font-medium text-left whitespace-nowrap', c.type === 'montant' || c.type === 'nombre' ? 'text-right' : '')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t">
              {colonnes.map((c) => (
                <td key={c.key} className={cn('px-2.5 py-1.5 whitespace-nowrap', c.type === 'montant' || c.type === 'nombre' ? 'text-right tabular-nums' : '')}>
                  {cellule(l[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > lignes.length && (
        <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/20">
          {lignes.length} lignes affichées sur {total} au total.
        </div>
      )}
    </div>
  );
}

function cellule(valeur: string | number | null | undefined, type?: string): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (type === 'montant' && typeof valeur === 'number') return formatMontant(valeur);
  if (type === 'nombre' && typeof valeur === 'number') return new Intl.NumberFormat('fr-FR').format(valeur);
  if (type === 'date') {
    const d = new Date(String(valeur));
    return isNaN(d.getTime()) ? String(valeur) : formatDate(d.toISOString());
  }
  return String(valeur);
}

function GraphiqueResultat({ serie, nom }: { serie: { label: string; valeur: number }[]; nom: string }) {
  if (serie.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune donnée correspondant aux critères sélectionnés.</p>;
  }
  const max = Math.max(...serie.map((s) => s.valeur), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">{nom}</p>
      <div className="flex items-end gap-1.5 h-32">
        {serie.map((s) => (
          <div key={s.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative">
            <span className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4 whitespace-nowrap">
              {new Intl.NumberFormat('fr-FR').format(s.valeur)}
            </span>
            <div
              className="w-full max-w-[40px] rounded-t bg-emerald-500/70 hover:bg-emerald-600 transition-colors"
              style={{ height: `${Math.max((s.valeur / max) * 100, 2)}%` }}
            />
            <span className="text-[8px] text-muted-foreground truncate w-full text-center">{s.label.slice(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
