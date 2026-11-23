/**
 * /api/kpi/seuils — Seuils d'alerte par service.
 * GET  : liste (ADMINISTRATEUR). Valeurs par défaut si absentes (seed initial).
 * POST : création/mise à jour upsert tracée (motif obligatoire, audit immuable).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { parseJsonBody } from '@/lib/validation/parse';

const schemaMaj = z.object({
  service: z.string().trim().min(1).max(40),
  typeAlerte: z.enum(['PROCHE_CIBLE', 'ACCUMULATION', 'DEGRADATION', 'HAUSSE_RETOURS']),
  valeur: z.number().min(0).max(10_000),
  motif: z.string().trim().min(10).max(500),
});

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const seuils = await db.seuilAlerteKpi.findMany({ orderBy: [{ service: 'asc' }, { typeAlerte: 'asc' }] });
  return NextResponse.json({ seuils });
}

export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const parsed = await parseJsonBody(request, schemaMaj);
  if (!parsed.success) return parsed.response;
  const { service, typeAlerte, valeur, motif } = parsed.data;

  try {
    const { nom, id } = await getUserInfoFromRequest(request);
    const ancien = await db.seuilAlerteKpi.findUnique({
      where: { service_typeAlerte: { service, typeAlerte } },
    });
    const seuil = await db.seuilAlerteKpi.upsert({
      where: { service_typeAlerte: { service, typeAlerte } },
      create: { service, typeAlerte, valeur, modifieParId: id ?? null },
      update: { valeur, modifieParId: id ?? null },
    });
    await logParametreChange({
      entite: 'SeuilAlerteKpi', entiteId: seuil.id, champ: 'valeur',
      ancienneValeur: ancien?.valeur ?? null, nouvelleValeur: valeur,
      modifiePar: nom, modifieParId: id ?? undefined,
      action: ancien ? 'MODIFICATION' : 'CREATION',
      module: 'KPI',
      objet: `Seuil ${typeAlerte} — ${service}`,
      motif, request,
    });
    return NextResponse.json(seuil, { status: 201 });
  } catch (e) {
    console.error('Erreur seuil KPI :', e);
    return NextResponse.json({ erreur: 'Erreur lors de la modification du seuil.' }, { status: 500 });
  }
}
