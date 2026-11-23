/**
 * GET /api/kpi/performance — Bundle complet de performance (Administration).
 * Rôle : ADMINISTRATEUR uniquement (matrice API_PERMISSIONS, default-deny).
 * Paramètres : conventions de période (periodes.ts) + service, userId,
 * societeId, typeDossier, statut. Les chiffres sont calculés par le moteur
 * kpi-performance — même source que les exports (cohérence garantie).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { contexteKpi, periodeKpiDepuisRequest, paramUrl } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerPerformance,
  calculerAlertes, resoudrePerimetreKpi, type FiltresKpi,
} from '@/lib/kpi-performance';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const { role } = contexteKpi(request);
    const periode = periodeKpiDepuisRequest(request);

    const filtres: FiltresKpi = {};
    const service = paramUrl(request, 'service');
    const userIdParam = paramUrl(request, 'userId');
    const societeId = paramUrl(request, 'societeId');
    const typeDossier = paramUrl(request, 'typeDossier');
    const statut = paramUrl(request, 'statut');

    // Périmètre serveur : seul ADMINISTRATEUR accède à cette route (matrice) ;
    // resoudrePerimetreKpi borne tout de même l'userId consultable.
    const perimetre = resoudrePerimetreKpi(role, null, userIdParam);
    if (perimetre.niveau !== 'GLOBAL') {
      return NextResponse.json({ erreur: 'Accès global réservé aux administrateurs.' }, { status: 403 });
    }
    if (service) filtres.service = service;
    if (perimetre.userIdEffective) filtres.userId = perimetre.userIdEffective;
    if (societeId) filtres.societeId = societeId;
    if (typeDossier) filtres.typeDossier = typeDossier;
    if (statut) filtres.statut = statut;

    const [etapes, objectifs, seuils, utilisateurs] = await Promise.all([
      chargerEtapesPeriode(periode, filtres),
      chargerObjectifs(),
      chargerSeuils(),
      db.utilisateur.findMany({ where: { actif: true }, select: { id: true, nom: true, role: true } }),
    ]);

    const noms = new Map(utilisateurs.map((u) => [u.id, `${u.nom} (${u.role})`]));
    const performance = calculerPerformance(etapes, periode, objectifs, { noms });
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);

    return NextResponse.json({
      periode: { debut: periode.debut.toISOString(), fin: periode.fin.toISOString() },
      filtres,
      performance,
      alertes,
      objectifs,
    });
  } catch (e) {
    console.error('Erreur /api/kpi/performance :', e);
    return NextResponse.json({ erreur: 'Erreur lors du calcul des performances.' }, { status: 500 });
  }
}
