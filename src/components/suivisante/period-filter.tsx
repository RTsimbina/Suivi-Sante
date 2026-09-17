'use client';

/**
 * ─── PeriodFilter : composant de filtrage temporel réutilisable ────────────
 *
 * Composant UNIQUE partagé par toutes les vues de la plateforme (aucune
 * duplication de la logique). Il consomme le contexte `usePeriode()` :
 * chaque changement déclenche automatiquement le rechargement des données
 * des vues abonnées (tableaux, indicateurs, graphiques, statistiques).
 *
 * Periodicités : Mensuel · Bimestriel · Trimestriel · Semestriel · Annuel ·
 * Personnalisé (du/au) — plus l'option « Toutes les périodes » qui désactive
 * le filtre. La période sélectionnée reste visible via un badge permanent.
 *
 * Props :
 *  - dateRefLabel : date de référence du module (ex. « Date de réception »),
 *    affichée pour rendre explicite la sémantique du filtre.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { CalendarDays, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePeriode } from '@/lib/periode-context';
import {
  PERIODICITES,
  getOptionsAnnee,
  getOptionsPeriode,
  libellePlage,
  nbPeriodesParAnnee,
  type ModePeriode,
} from '@/lib/periodes';

interface PeriodFilterProps {
  /** Date de référence du module concerné (affichée à côté du filtre). */
  dateRefLabel?: string;
  className?: string;
}

export default function PeriodFilter({ dateRefLabel, className }: PeriodFilterProps) {
  const { selection, setSelection, plage, libelle } = usePeriode();

  const modesAvecAnnee = selection.mode !== 'TOUTES' && selection.mode !== 'PERSONNALISE';
  const nbPeriodes = nbPeriodesParAnnee(selection.mode);
  const optionsPeriode = getOptionsPeriode(selection.mode, selection.annee);
  const periodeActive = selection.mode !== 'TOUTES';
  const selectionInvalide = periodeActive && !plage; // personnalisé incomplet ou incohérent

  function changerMode(mode: ModePeriode) {
    setSelection({
      mode,
      annee: selection.annee,
      index: 1,
      debut: mode === 'PERSONNALISE' ? selection.debut : undefined,
      fin: mode === 'PERSONNALISE' ? selection.fin : undefined,
    });
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 shadow-sm',
        className,
      )}
      role="group"
      aria-label="Filtre par période"
    >
      {/* Rappel de la date de référence du module */}
      {dateRefLabel && (
        <span
          className="hidden xl:inline text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1 max-w-44 truncate"
          title={`Les données sont filtrées selon la ${dateRefLabel.toLowerCase()}`}
        >
          {dateRefLabel}
        </span>
      )}

      {/* Periodicité */}
      <Select value={selection.mode} onValueChange={(v) => changerMode(v as ModePeriode)}>
        <SelectTrigger aria-label="Periodicité" className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="Periodicité" />
        </SelectTrigger>
        <SelectContent>
          {PERIODICITES.map((p) => (
            <SelectItem key={p.value} value={p.value} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Année (masquée en personnalisé) */}
      {modesAvecAnnee && (
        <Select
          value={String(selection.annee)}
          onValueChange={(v) => setSelection({ ...selection, annee: parseInt(v, 10) })}
        >
          <SelectTrigger aria-label="Année" className="h-8 w-[86px] text-xs">
            <SelectValue placeholder="Année" />
          </SelectTrigger>
          <SelectContent>
            {getOptionsAnnee().map((a) => (
              <SelectItem key={a.value} value={a.value} className="text-xs">
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Période dans l'année (mensuel → semestriel) */}
      {nbPeriodes > 1 && (
        <Select
          value={String(selection.index ?? 1)}
          onValueChange={(v) => setSelection({ ...selection, index: parseInt(v, 10) })}
        >
          <SelectTrigger aria-label="Période" className="h-8 w-[190px] text-xs">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            {optionsPeriode.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Personnalisé : du / au */}
      {selection.mode === 'PERSONNALISE' && (
        <>
          <Input
            type="date"
            aria-label="Date de début"
            value={selection.debut ?? ''}
            onChange={(e) => setSelection({ ...selection, debut: e.target.value || undefined })}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label="Date de fin"
            value={selection.fin ?? ''}
            onChange={(e) => setSelection({ ...selection, fin: e.target.value || undefined })}
            className="h-8 w-[140px] text-xs"
          />
        </>
      )}

      {/* Période sélectionnée — toujours visible */}
      <Badge
        variant="outline"
        title={plage ? libellePlage(plage) : libelle}
        className={cn(
          'text-[10px] h-6 gap-1 max-w-[260px]',
          selectionInvalide
            ? 'border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
            : periodeActive
              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'
              : 'border-border text-muted-foreground bg-muted/40',
        )}
      >
        <CalendarDays className="h-3 w-3 shrink-0" />
        <span className="truncate">{libelle}</span>
      </Badge>

      {/* Réinitialisation (retour à « Toutes les périodes ») */}
      {periodeActive && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Réinitialiser le filtre de période"
          title="Réinitialiser le filtre (toutes les périodes)"
          onClick={() => setSelection({ mode: 'TOUTES', annee: selection.annee, index: 1 })}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
