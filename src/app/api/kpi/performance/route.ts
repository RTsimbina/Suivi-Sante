/**
 * GET /api/kpi/performance — Bundle complet de performance.
 * Rôles (matrice API_PERMISSIONS) : ADMINISTRATEUR + DIRECTION_GENERALE
 * (consultation globale, R1) + RESPONSABLE_SERVICE (portée FORCÉE côté
 * serveur à son service, R2 — fail-closed si aucun service associé).
 * Paramètres : conventions de période (periodes.ts) + service, userId,
 * societeId, typeDossier, statut. Les chiffres sont calculés par le moteur
 * kpi-performance — même source que les exports (cohérence garantie).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { contexteKpi, periodeKpiDepuisRequest, paramUrl, serviceResponsableDuCompte } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerPerformance,
  calculerAlertes, resoudrePerimetreKpi, type FiltresKpi,
} from '@/lib/kpi-performance';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const { userId, role } = contexteKpi(request);
    const periode = periodeKpiDepuisRequest(request);

    const filtres: FiltresKpi = {};
    const serviceParam = paramUrl(request, 'service');
    const userIdParam = paramUrl(request, 'userId');
    const societeId = paramUrl(request, 'societeId');
    const typeDossier = paramUrl(request, 'typeDossier');
    const statut = paramUrl(request, 'statut');

    // Périmètre serveur : GLOBAL (admin / direction générale), SERVICE
    // (responsable de service — le service du compte ÉCRASE tout paramètre
    // contradictoire), PERSONNEL (collaborateur). Fail-closed : un
    // RESPONSABLE_SERVICE sans service associé est refusé (403).
    const serviceResponsable = role === 'RESPONSABLE_SERVICE'
      ? await serviceResponsableDuCompte(userId) : null;
    const perimetre = resoudrePerimetreKpi(role, userId, userIdParam, serviceResponsable);
    if (perimetre.niveau === 'PERSONNEL' || (perimetre.niveau === 'SERVICE' && !perimetre.serviceEffective)) {
      return NextResponse.json({ erreur: 'Accès refusé : aucun périmètre de consultation valide pour ce compte.' }, { status: 403 });
    }
    if (perimetre.serviceEffective) {
      filtres.service = perimetre.serviceEffective;
    } else if (serviceParam) {
      filtres.service = serviceParam;
    }
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
