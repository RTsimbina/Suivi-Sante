import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';

// GET /api/profil — Informations personnelles de l'utilisateur connecté
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    const user = await db.utilisateur.findUnique({
      where: { email: session.user.email },
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
