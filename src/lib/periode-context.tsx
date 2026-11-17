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

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  calculePlage,
  libellePeriode,
  paramsVersSelection,
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Restauration depuis l'URL (/?periodeMode=...&periodeAnnee=...) : après
  // F5/Ctrl+R ou partage de lien, le filtre de période affiché est celui de
  // l'URL. Paramètres absents ou invalides ⇒ « TOUTES » (comportement sûr).
  const [selection, setSelection] = useState<SelectionPeriode>(
    () => paramsVersSelection(searchParams) ?? {
      mode: 'TOUTES',
      annee: anneeCouranteFuseau(),
      index: 1,
    },
  );

  // Miroir URL : toute modification de la sélection est reflétée dans l'URL
  // (router.replace — pas d'entrée d'historique pour un simple filtre), en
  // préservant les autres paramètres (vue, onglet, ...). La comparaison évite
  // toute boucle : après le replace, l'URL correspond déjà à la sélection.
  useEffect(() => {
    const actuelle = new URLSearchParams(searchParams.toString());
    for (const cle of [...actuelle.keys()]) {
      if (cle.startsWith('periode')) actuelle.delete(cle);
    }
    for (const [cle, valeur] of selectionVersParams(selection)) {
      actuelle.set(cle, valeur);
    }
    const qs = actuelle.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [selection, searchParams, router, pathname]);

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
