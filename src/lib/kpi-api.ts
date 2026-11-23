/**
 * kpi-api.ts — Helpers partagés des routes KPI (contexte serveur + période).
 * L'identité vient EXCLUSIVEMENT des en-têtes posés par le proxy Edge après
 * validation du JWT (x-user-id / x-user-role) — jamais d'un paramètre client.
 */

import { NextRequest } from 'next/server';
import { plageDepuisParams } from './periodes';
import type { PeriodeKpi } from './kpi-performance';

export interface ContexteKpi { userId: string | null; role: string | null; }

export function contexteKpi(request: NextRequest): ContexteKpi {
  return {
    userId: request.headers.get('x-user-id'),
    role: request.headers.get('x-user-role'),
  };
}

/** Période depuis les paramètres URL (conventions periodes.ts) ; TOUTES par défaut. */
export function periodeKpiDepuisRequest(request: NextRequest, defautAnnees = 3): PeriodeKpi {
  const { searchParams } = new URL(request.url);
  const plage = plageDepuisParams(searchParams);
  if (plage) return { debut: plage.debut, fin: plage.fin };
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut: new Date(fin.getFullYear() - defautAnnees, 0, 1), fin };
}

/** Paramètre de filtre optionnel depuis l'URL. */
export function paramUrl(request: NextRequest, nom: string): string | undefined {
  const v = new URL(request.url).searchParams.get(nom);
  return v && v.trim() !== '' ? v.trim() : undefined;
}
