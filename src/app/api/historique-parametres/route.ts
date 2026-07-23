import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// Types d'entités autorisés pour le filtre
const ENTITES_VALIDES = [
  'Bareme', 'Contrat', 'Utilisateur', 'Societe', 'Prestataire', 'Assure',
];

/**
 * GET /api/historique-parametres
 * Admin uniquement — Récupérer le journal des modifications de paramétrage.
 *
 * Query params :
 *   - entite      : filtre par type d'entité (optionnel)
 *   - entiteId    : filtre par ID d'entité (optionnel)
 *   - page        : numéro de page (défaut 1)
 *   - limit       : résultats par page (défaut 50, max 200)
 *
 * Le journal est en lecture seule — aucun POST/PUT/DELETE n'existe.
 * Les enregistrements sont créés automatiquement par l'utilitaire audit-log.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const entite = searchParams.get('entite');
    const entiteId = searchParams.get('entiteId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    // Construire le filtre where
    const where: Record<string, unknown> = {};
    if (entite) {
      if (!ENTITES_VALIDES.includes(entite)) {
        return NextResponse.json(
          { erreur: `Entité invalide. Valeurs : ${ENTITES_VALIDES.join(', ')}` },
          { status: 400 }
        );
      }
      where.entite = entite;
    }
    if (entiteId) {
      where.entiteId = entiteId;
    }

    const [entries, total] = await Promise.all([
      db.historiqueParametre.findMany({
        where,
        orderBy: { dateModification: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.historiqueParametre.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur historique-parametres:', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la récupération du journal.' },
      { status: 500 }
    );
  }
}
