/**
 * GET /api/kpi/export?format=xlsx|pdf — Exports du module KPI (ADMINISTRATEUR).
 * Consomme le même moteur que le tableau de bord → cohérence garantie (§12).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { getUserInfoFromRequest } from '@/lib/audit-log';
import { db } from '@/lib/db';
import { periodeKpiDepuisRequest, paramUrl } from '@/lib/kpi-api';
import {
  chargerEtapesPeriode, chargerObjectifs, chargerSeuils, calculerPerformance,
  calculerAlertes, type FiltresKpi,
} from '@/lib/kpi-performance';
import { genererExcelKpi, genererPdfKpi } from '@/lib/kpi-export';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  try {
    const format = (new URL(request.url).searchParams.get('format') ?? 'xlsx').toLowerCase();
    if (format !== 'xlsx' && format !== 'pdf') {
      return NextResponse.json({ erreur: 'Format non supporté (xlsx ou pdf).' }, { status: 400 });
    }
    const periode = periodeKpiDepuisRequest(request);
    const service = paramUrl(request, 'service');
    const filtres: FiltresKpi = service ? { service } : {};

    const [etapes, objectifs, seuils, utilisateurs, auditNom] = await Promise.all([
      chargerEtapesPeriode(periode, filtres),
      chargerObjectifs(),
      chargerSeuils(),
      db.utilisateur.findMany({ where: { actif: true }, select: { id: true, nom: true, role: true } }),
      getUserInfoFromRequest(request).then((u) => u.nom).catch(() => ''),
    ]);
    const noms = new Map(utilisateurs.map((u) => [u.id, `${u.nom} (${u.role})`]));

    const global = calculerPerformance(etapes, periode, objectifs, { noms });
    const alertes = calculerAlertes(etapes, periode, objectifs, seuils);
    const donnees = {
      periode: `${periode.debut.toLocaleDateString('fr-FR')} — ${periode.fin.toLocaleDateString('fr-FR')}`,
      generePar: auditNom,
      global, alertes,
    };

    if (format === 'pdf') {
      const buf = genererPdfKpi(donnees);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="kpi-collaborateurs-${Date.now()}.pdf"`,
        },
      });
    }
    const buf = await genererExcelKpi(donnees);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="kpi-collaborateurs-${Date.now()}.xlsx"`,
      },
    });
  } catch (e) {
    console.error('Erreur /api/kpi/export :', e);
    return NextResponse.json({ erreur: 'Erreur lors de la génération de l\u2019export.' }, { status: 500 });
  }
}
