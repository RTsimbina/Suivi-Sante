/**
 * POST /api/dossiers/[id]/retour-correction — Retour pour correction traçable.
 * Corps : { motif } obligatoire. Le statut du dossier est CONSERVÉ (aucune
 * règle de transition modifiée) : l'événement alimente le taux de retour pour
 * correction et reste visible dans la chronologie du dossier.
 * Rôles : matrice POST de /api/dossiers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { enregistrerRetourCorrection } from '@/lib/kpi-etapes';

const schema = z.object({ motif: z.string().trim().min(10).max(500) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.success) return parsed.response;
  const { id } = await params;
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ erreur: 'Identité introuvable.' }, { status: 401 });

  try {
    const dossier = await db.dossier.findUnique({ where: { id }, select: { statut: true } });
    if (!dossier) return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });
    if (['PAYE', 'REJETE'].includes(dossier.statut)) {
      return NextResponse.json({ erreur: 'Dossier terminal : retour impossible.' }, { status: 400 });
    }
    const etape = await db.$transaction((tx) =>
      enregistrerRetourCorrection(tx, id, dossier.statut, userId, parsed.data.motif));
    return NextResponse.json({ ok: true, retour: etape }, { status: 201 });
  } catch (e) {
    console.error('Erreur retour correction :', e);
    return NextResponse.json({ erreur: 'Erreur lors de l\u2019enregistrement du retour.' }, { status: 500 });
  }
}
