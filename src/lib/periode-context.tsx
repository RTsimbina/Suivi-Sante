'use client';

/**
 * ─── Contexte de filtrage par période ──────────────────────────────────────
 *
 * État UNIQUE et partagé du filtre de période, consommé par toutes les vues
 * via le hook `usePeriode()`. Évite de dupliquer la logique de filtrage :
 *
 *   const { selection, setSelection, plage, libelle, queryString } = usePeriode();
 *   fetch(`/api/dossiers?${params}${queryString ? '&' + queryString : ''}`);
 *
 * `queryString` est '' tant que « Toutes les périodes » est sélectionné :
 * les requêtes restent alors inchangées (aucun filtrage serveur).
 * ──────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  calculePlage,
  libellePeriode,
  selectionVersParams,
  anneeCouranteFuseau,
  type PlagePeriode,
  type SelectionPeriode,
} from './periodes';

interface PeriodeContextValue {
  /** Sélection courante du filtre (source de vérité). */
  selection: SelectionPeriode;
  /** Met à jour la sélection (déclenche le recalcul et le refetch des vues). */
  setSelection: (s: SelectionPeriode) => void;
  /** Plage UTC résolue, ou null si « Toutes les périodes » / sélection incomplète. */
  plage: PlagePeriode | null;
  /** Libellé français de la période sélectionnée (toujours affichable). */
  libelle: string;
  /** Paramètres d'URL à ajouter aux appels API ('' si aucune période). */
  queryString: string;
}

const PeriodeContext = createContext<PeriodeContextValue | null>(null);

export function PeriodeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<SelectionPeriode>(() => ({
    mode: 'TOUTES',
    annee: anneeCouranteFuseau(),
    index: 1,
  }));

  const value = useMemo<PeriodeContextValue>(() => {
    const plage = calculePlage(selection);
    const queryString = selectionVersParams(selection).toString();
    return {
      selection,
      setSelection,
      plage,
      libelle: libellePeriode(selection),
      queryString,
    };
  }, [selection]);

  return <PeriodeContext.Provider value={value}>{children}</PeriodeContext.Provider>;
}

/** Accès au filtre de période partagé. À utiliser sous un <PeriodeProvider>. */
export function usePeriode(): PeriodeContextValue {
  const ctx = useContext(PeriodeContext);
  if (!ctx) {
    throw new Error('usePeriode doit être utilisé à l’intérieur d’un <PeriodeProvider>.');
  }
  return ctx;
}
