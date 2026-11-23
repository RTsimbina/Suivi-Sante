/**
 * POST /api/dossiers/[id]/reprise — Reprise après suspension (horodatage serveur).
 * Rôles : matrice POST de /api/dossiers (ADMINISTRATEUR, ACCUEIL, TECHNIQUE,
 * COMPTABILITE). Le temps suspendu reste exclu du temps actif.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { reprendreEtape } from '@/lib/kpi-etapes';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const userId = request.headers.get('x-user-id');

  try {
    const reprise = await db.$transaction((tx) => reprendreEtape(tx, id, userId ?? null));
    return NextResponse.json({ ok: true, reprise });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    if (message.startsWith('ETAPE_ABSENTE') || message.startsWith('AUCUNE_SUSPENSION')) {
      return NextResponse.json({ erreur: message.split(': ')[1] }, { status: 400 });
    }
    console.error('Erreur reprise :', e);
    return NextResponse.json({ erreur: 'Erreur lors de la reprise.' }, { status: 500 });
  }
}
