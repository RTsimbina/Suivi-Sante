/**
 * POST /api/dossiers/[id]/debut-traitement — Le collaborateur marque le début
 * effectif de son traitement (distingue « attente avant prise en charge » et
 * « temps de traitement actif », exigence §4). Idempotent : 400 si déjà marqué.
 * Rôles : matrice POST de /api/dossiers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { marquerDebutTraitement } from '@/lib/kpi-etapes';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ erreur: 'Identité introuvable.' }, { status: 401 });

  try {
    const etape = await db.$transaction((tx) => marquerDebutTraitement(tx, id, userId, userRole));
    return NextResponse.json({ ok: true, etape });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    if (message.startsWith('ETAPE_ABSENTE') || message.startsWith('DEJA_MARQUE')) {
      return NextResponse.json({ erreur: message.split(': ')[1] }, { status: 400 });
    }
    console.error('Erreur début traitement :', e);
    return NextResponse.json({ erreur: 'Erreur lors du marquage.' }, { status: 500 });
  }
}
