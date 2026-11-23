/**
 * GET /api/kpi/alertes — Alertes de performance détaillées (ADMINISTRATEUR).
 * Même moteur que le tableau de bord (cohérence garantie) : dossiers proches de
 * leur cible, dépassés, accumulations, dégradations, hausse des retours.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { periodeKpiDepuisRequest, paramUrl } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerAlertes,
} from '@/lib/kpi-performance';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const periode = periodeKpiDepuisRequest(request, 1);
    const service = paramUrl(request, 'service');
    const [etapes, objectifs, seuils] = await Promise.all([
      chargerEtapesPeriode(periode, service ? { service } : {}),
      chargerObjectifs(),
      chargerSeuils(),
    ]);
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
    return NextResponse.json({ periode: { debut: periode.debut.toISOString(), fin: periode.fin.toISOString() }, alertes });
  } catch (e) {
    console.error('Erreur /api/kpi/alertes :', e);
    return NextResponse.json({ erreur: 'Erreur lors du calcul des alertes.' }, { status: 500 });
  }
}
