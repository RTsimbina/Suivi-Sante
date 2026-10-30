import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { verifierSessionUtilisateur } from '@/lib/session-revocation';

// GET /api/profil — Informations personnelles de l'utilisateur connecté
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.email) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    // P1 Révocation : état réel du compte relu en base (actif + version).
    const session = await verifierSessionUtilisateur(db, token);
    if (!session.ok) {
      return NextResponse.json({ erreur: session.erreur }, { status: session.statut });
    }

    const user = await db.utilisateur.findUnique({
      where: { email: token.email as string },
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        dernierLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ erreur: 'Utilisateur introuvable' }, { status: 404 });
    }

    return NextResponse.json({ utilisateur: user });
  } catch (error) {
    console.error('[PROFIL] Erreur GET:', error);
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 });
  }
}
