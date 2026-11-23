/**
 * GET /api/dossiers/[id]/etapes — Chronologie de traitement d'un dossier
 * (lecture seule, append-only : aucune route ne modifie une étape fermée).
 * Chaque étape : service, responsable (compte + gestionnaire), affectation,
 * début, fin, statuts avant/après, motifs de réaffectation/retour et fenêtres
 * de suspension (motif, horodatages).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const { id } = await params;

  const dossier = await db.dossier.findUnique({
    where: { id },
    select: { id: true, numeroDossier: true, statut: true, dateReception: true },
  });
  if (!dossier) return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 });

  const etapes = await db.etapeTraitement.findMany({
    where: { dossierId: id },
    orderBy: { dateAffectation: 'asc' },
    include: {
      user: { select: { nom: true, role: true } },
      gestionnaire: { select: { nom: true, service: true } },
      suspensions: { orderBy: { suspenduA: 'asc' } },
    },
  });

  return NextResponse.json({ dossier, etapes });
}
