'use client';

/**
 * navigation-locale.ts — Onglet local d'une vue (état composant, convention
 * des vues existantes comme dossier-detail). Type sûr : seuls les onglets
 * déclarés sont acceptés.
 */

import { useState } from 'react';

export function useOngletLocal<T extends string>(valeurs: readonly T[], defaut: T) {
  const [onglet, setOnglet] = useState<T>(defaut);
  const choisir = (v: T) => {
    if (valeurs.includes(v)) setOnglet(v);
  };
  return [onglet, choisir] as const;
}
