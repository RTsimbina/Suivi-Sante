/**
 * kpi-api.ts — Helpers partagés des routes KPI (contexte serveur + période).
 * L'identité vient EXCLUSIVEMENT des en-têtes posés par le proxy Edge après
 * validation du JWT (x-user-id / x-user-role) — jamais d'un paramètre client.
 */

import { NextRequest } from 'next/server';
import { db } from './db';
import { plageDepuisParams } from './periodes';
import type { PeriodeKpi } from './kpi-performance';

export interface ContexteKpi { userId: string | null; role: string | null; }

export function contexteKpi(request: NextRequest): ContexteKpi {
  return {
    userId: request.headers.get('x-user-id'),
    role: request.headers.get('x-user-role'),
  };
}

/**
 * Service géré d'un compte (R2 — Responsable de service). Résolu CÔTÉ SERVEUR
 * depuis l'identifiant du JWT (jamais d'un paramètre client) ; null si le
 * compte n'a pas de service associé → la route doit répondre fail-closed (403).
 */
export async function serviceResponsableDuCompte(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await db.utilisateur.findUnique({
    where: { id: userId },
    select: { serviceResponsable: true },
  });
  return u?.serviceResponsable ?? null;
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
