/**
 * POST /api/controle-medical/[id] — Étapes de CONTRÔLE MÉDICAL (hors circuit
 * des statuts : aucune colonne gestionnaire dédiée sur Dossier). Deux phases :
 *   { phase: 'DEBUT' } → ouvre l'étape de contrôle médical ;
 *   { phase: 'FIN' }   → la clôture (le temps actif est mesurable).
 * Rôles : SANTE + ADMINISTRATEUR (entrée dédiée dans API_PERMISSIONS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { ouvrirEtapeControleMedical, fermerEtapeControleMedical } from '@/lib/kpi-etapes';

const schema = z.object({ phase: z.enum(['DEBUT', 'FIN']) });

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
    const dossier = await db.dossier.findUnique({ where: { id }, select: { id: true } });
    if (!dossier) return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });
    const etape = await db.$transaction((tx) =>
      parsed.data.phase === 'DEBUT'
        ? ouvrirEtapeControleMedical(tx, id, userId)
        : fermerEtapeControleMedical(tx, id));
    return NextResponse.json({ ok: true, etape });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    if (message.startsWith('ETAPE_ABSENTE') || message.startsWith('DEJA_OUVERTE')) {
      return NextResponse.json({ erreur: message.split(': ')[1] }, { status: 400 });
    }
    console.error('Erreur contrôle médical :', e);
    return NextResponse.json({ erreur: 'Erreur lors de l\u2019enregistrement.' }, { status: 500 });
  }
}
