/**
 * POST /api/dossiers/[id]/suspension — Suspension de l'étape ouverte.
 * Corps : { motif } (obligatoire, ≥ 10 caractères). Rôles : matrice POST de
 * /api/dossiers (ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE).
 * Horodatage serveur ; la durée suspendue est exclue du temps actif des KPI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { suspendreEtape } from '@/lib/kpi-etapes';

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

  try {
    const dossier = await db.dossier.findUnique({ where: { id }, select: { id: true, statut: true } });
    if (!dossier) return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });
    if (['PAYE', 'REJETE'].includes(dossier.statut)) {
      return NextResponse.json({ erreur: 'Dossier terminal : suspension impossible.' }, { status: 400 });
    }
    const suspension = await db.$transaction((tx) => suspendreEtape(tx, id, parsed.data.motif, userId ?? null));
    return NextResponse.json({ ok: true, suspension });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    if (message.startsWith('ETAPE_ABSENTE') || message.startsWith('DEJA_SUSPENDU')) {
      return NextResponse.json({ erreur: message.split(': ')[1] }, { status: 400 });
    }
    console.error('Erreur suspension :', e);
    return NextResponse.json({ erreur: 'Erreur lors de la suspension.' }, { status: 500 });
  }
}
