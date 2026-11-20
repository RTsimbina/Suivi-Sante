'use client';

/**
 * ─── État d'URL pour les sous-modules (onglets des vues) ───────────────────
 *
 * Remplace les `useState` d'onglets internes : la valeur est lue depuis le
 * paramètre d'URL (/?vue=technique&onglet=calcul) et toute modification est
 * poussée dans l'URL avec les mécanismes natifs de Next.js (router.push).
 * Après F5/Ctrl+R, l'onglet consulté est restauré depuis l'URL.
 *
 * L'onglet par défaut n'écrit PAS de paramètre dans l'URL (URL propre) ;
 * un paramètre inconnu retombe sur le défaut sans être réécrit (pas de
 * boucle de correction).
 *
 * Un état optimiste rend le clic instantané : la navigation (router.push)
 * est asynchrone, l'onglet affiché bascule immédiatement puis l'URL se met
 * à jour. Dès que searchParams change (invalidation dérivée — voir plus bas), l.URL
 * redevient la seule source de vérité.
 * ────────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PARAM_ONGLET } from '@/lib/navigation';

/**
 * Synchronise un onglet de vue avec le paramètre `onglet` de l'URL.
 * @param valeurs onglets valides de la vue (liste fermée, fallback au défaut)
 * @param defaut  onglet affiché si le paramètre est absent ou invalide
 */
export function useOngletUrl(valeurs: readonly string[], defaut: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const brut = searchParams.get(PARAM_ONGLET);
  const depuisUrl = brut && valeurs.includes(brut) ? brut : defaut;

  const paramsCourants = searchParams.toString();
  // État optimiste : { valeur cliquée, query string AU MOMENT du clic }.
  // Invalidé de façon DÉRIVÉE (pas d'effet) : dès que searchParams évolue
  // (navigation aboutie, retour arrière, changement de vue), la query
  // courante diffère de celle du clic → l'optimiste est ignoré et l'URL
  // redevient la source de vérité unique. Éviter un setState synchrone dans
  // un useEffect (rendu en cascade — règle react-hooks/set-state-in-effect,
  // cf. react.dev/learn/you-might-not-need-an-effect).
  const [optimiste, setOptimiste] = useState<{ valeur: string; pourUrl: string } | null>(null);
  const valeurOptimiste =
    optimiste && optimiste.pourUrl === paramsCourants ? optimiste.valeur : null;

  const onglet = valeurOptimiste ?? depuisUrl;

  const setOnglet = (v: string) => {
    setOptimiste({ valeur: v, pourUrl: paramsCourants });
    const params = new URLSearchParams(searchParams.toString());
    // URL propre : l'onglet par défaut n'apparaît pas dans l'URL
    if (v === defaut) params.delete(PARAM_ONGLET);
    else params.set(PARAM_ONGLET, v);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return [onglet, setOnglet] as const;
}
