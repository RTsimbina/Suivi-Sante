import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { idSchema } from '@/lib/validation';

// ─── GET : Fiche détaillée d'un prestataire (/api/prestataires/[id]) ─────────
//
// Réutilise le système central de permissions : checkAuth → API_PERMISSIONS
// (préfixe /api/prestataires). Les rôles autorisés en lecture sont
// ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE, SANTE ; les rôles externes
// (PORTAIL_CLIENT, CONTACT_ENTREPRISE) sont refusés au niveau central — aucune
// logique d'autorisation parallèle n'est créée ici.
//
// Isolation des données : le prestataire est un référentiel global interne.
// Un identifiant manipulé dans l'URL ne peut pas contourner les droits :
//  - rôle non autorisé → 403 côté API_PERMISSIONS (avant même cette route) ;
//  - identifiant inconnu → 404 (sans révéler d'autres informations).

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ erreur: 'Identifiant invalide.' }, { status: 400 });
    }

    const prestataire = await db.prestataire.findUnique({
      where: { id },
      include: {
        // Rattachements aux sociétés clientes (conventions actives / suspendues)
        societes: {
          include: { societe: { select: { id: true, nom: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { dossiers: true } },
      },
    });

    if (!prestataire) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    return NextResponse.json({ prestataire });
  } catch (error) {
    console.error('Erreur lors de la récupération du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération du prestataire.' },
      { status: 500 }
    );
  }
}
