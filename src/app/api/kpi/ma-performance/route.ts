/**
 * GET /api/kpi/ma-performance — Espace personnel du collaborateur.
 * Rôles internes (matrice : ADMINISTRATEUR + ACCUEIL/TECHNIQUE/COMPTABILITE/SANTE).
 * SÉCURITÉ : l'identifiant mesuré est TOUJOURS celui du JWT (x-user-id posé
 * par le proxy Edge) — tout paramètre client est ignoré. Aucune URL, aucun
 * identifiant ni paramètre de requête ne permet de voir un autre collaborateur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { contexteKpi, periodeKpiDepuisRequest } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, calculerPerformance, tempsActifMs,
  objectifPour, type FiltresKpi,
} from '@/lib/kpi-performance';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const { userId, role } = contexteKpi(request);
    if (!userId) {
      return NextResponse.json({ erreur: 'Identité utilisateur introuvable.' }, { status: 401 });
    }
    const periode = periodeKpiDepuisRequest(request, 2);

    // L'userId du JWT ÉCRASE tout paramètre (anti-usurpation, testé).
    const filtres: FiltresKpi = { userId };
    const etapes = await chargerEtapesPeriode(periode, filtres);
    const objectifs = await chargerObjectifs();
    const moi = await db.utilisateur.findUnique({
      where: { id: userId },
      select: { nom: true, role: true },
    });

    const performance = calculerPerformance(etapes, periode, objectifs, {
      noms: new Map([[userId, moi?.nom ?? '']]),
    });
    const mesKpis = performance.parCollaborateur.find((k) => k.userId === userId) ?? null;

    // Dossiers nécessitant une attention particulière : mes étapes ouvertes
    // proches ou au-delà de l'objectif, triées par dépassement décroissant.
    const finMesure = new Date(Math.min(periode.fin.getTime(), Date.now()));
    const attention = etapes
      .filter((e) => e.type === 'TRAVAIL' && !e.dateFin)
      .map((e) => {
        const obj = objectifPour(objectifs, e.service, e.dossier.typeDossier);
        const pct = obj > 0 ? Math.round((tempsActifMs(e, e.suspensions, finMesure) / (obj * 60_000)) * 100) : 0;
        return {
          dossierId: e.dossier.id,
          numeroDossier: e.dossier.numeroDossier,
          service: e.service,
          pourcentageObjectif: pct,
          enRetard: pct >= 100,
        };
      })
      .filter((x) => x.pourcentageObjectif >= 80)
      .sort((a, b) => b.pourcentageObjectif - a.pourcentageObjectif)
      .slice(0, 10);

    return NextResponse.json({
      periode: { debut: periode.debut.toISOString(), fin: periode.fin.toISOString() },
      utilisateur: { nom: moi?.nom ?? '', role: moi?.role ?? role },
      kpis: mesKpis,
      attention,
    });
  } catch (e) {
    console.error('Erreur /api/kpi/ma-performance :', e);
    return NextResponse.json({ erreur: 'Erreur lors du calcul de votre performance.' }, { status: 500 });
  }
}
