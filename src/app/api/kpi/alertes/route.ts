/**
 * GET /api/kpi/alertes — Alertes de performance détaillées.
 * Rôles (matrice) : ADMINISTRATEUR + DIRECTION_GENERALE (global, R1) +
 * RESPONSABLE_SERVICE (portée forcée à son service, R2 — fail-closed).
 * Même moteur que le tableau de bord (cohérence garantie) : dossiers proches de
 * leur cible, dépassés, accumulations, dégradations, hausse des retours.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { contexteKpi, periodeKpiDepuisRequest, paramUrl, serviceResponsableDuCompte } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerAlertes, KpiVolumeEtapesDepasse,
} from '@/lib/kpi-performance';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const periode = periodeKpiDepuisRequest(request, 1);
    const { userId, role } = contexteKpi(request);

    // Portée serveur : le service du compte RESPONSABLE_SERVICE ÉCRASE tout
    // paramètre ; fail-closed (403) si le rôle n'a pas de service associé.
    let service = paramUrl(request, 'service');
    if (role === 'RESPONSABLE_SERVICE') {
      const serviceCompte = await serviceResponsableDuCompte(userId);
      if (!serviceCompte) {
        return NextResponse.json({ erreur: 'Aucun service associé à votre compte. Contactez votre administrateur.' }, { status: 403 });
      }
      service = serviceCompte;
    }

    const [etapes, objectifs, seuils] = await Promise.all([
      chargerEtapesPeriode(periode, service ? { service } : {}),
      chargerObjectifs(),
      chargerSeuils(),
    ]);
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
    return NextResponse.json({ periode: { debut: periode.debut.toISOString(), fin: periode.fin.toISOString() }, alertes });
  } catch (e) {
    if (e instanceof KpiVolumeEtapesDepasse) {
      return NextResponse.json({ erreur: e.message, totalEtapes: e.total, limite: e.limite }, { status: 413 });
    }
    console.error('Erreur /api/kpi/alertes :', e);
    return NextResponse.json({ erreur: 'Erreur lors du calcul des alertes.' }, { status: 500 });
  }
}
