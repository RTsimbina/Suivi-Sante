import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';

/**
 * GET /api/profil/historique
 * Récupère l'historique des modifications de l'utilisateur connecté (son propre profil uniquement).
 *
 * Query params :
 *   - limit : nombre max d'entrées (défaut 20, max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.id) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const entries = await db.historiqueParametre.findMany({
      where: {
        entite: 'Utilisateur',
        entiteId: token.id as string,
      },
      orderBy: { dateModification: 'desc' },
      take: limit,
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('[PROFIL] Erreur historique:', error);
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 });
  }
}
