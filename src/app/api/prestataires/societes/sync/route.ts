import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

/**
 * POST /api/prestataires/societes/sync
 * Synchronise la table PrestataireSociete à partir des dossiers existants.
 * Pour chaque dossier ayant un prestataireId + societeId, crée un lien
 * PrestataireSociete (actif: true) s'il n'existe pas déjà.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // 1. Récupérer toutes les paires (prestataireId, societeId) uniques des dossiers
    const dossiers = await db.dossier.findMany({
      where: {
        prestataireId: { not: null },
        societeId: { not: null },
      },
      select: { prestataireId: true, societeId: true },
      distinct: ['prestataireId', 'societeId'],
    });

    if (dossiers.length === 0) {
      return NextResponse.json({
        message: 'Aucun dossier avec prestataire trouvé.',
        created: 0, existing: 0,
      });
    }

    // 2. Récupérer les liens déjà existants
    const existingLinks = await db.prestataireSociete.findMany({
      select: { prestataireId: true, societeId: true },
    });
    const existingSet = new Set(
      existingLinks.map(l => `${l.prestataireId}|${l.societeId}`)
    );

    // 3. Filtrer les nouvelles paires à créer
    const toCreate = dossiers.filter(
      d => !existingSet.has(`${d.prestataireId}|${d.societeId}`)
    );

    // 4. Créer les liens en batch
    let created = 0;
    if (toCreate.length > 0) {
      const result = await db.prestataireSociete.createMany({
        data: toCreate.map(d => ({
          prestataireId: d.prestataireId!,
          societeId: d.societeId,
          actif: true,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    return NextResponse.json({
      message: `Synchronisation terminée. ${created} lien(s) créé(s), ${existingLinks.length} déjà existant(s).`,
      created,
      existing: existingLinks.length,
      total: dossiers.length,
    });
  } catch (error) {
    console.error('Erreur synchronisation prestataire-société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la synchronisation.' },
      { status: 500 }
    );
  }
}
