import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';

const AVATAR_OPTIONS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
] as const;

// PATCH /api/profil/avatar
// Corps : { avatar: "A" | "B" | ... | "H" | null }
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    const { avatar } = (await request.json()) as { avatar?: string | null };

    // Valider la valeur
    if (avatar !== null && !AVATAR_OPTIONS.includes(avatar as typeof AVATAR_OPTIONS[number])) {
      return NextResponse.json(
        { erreur: 'Avatar invalide. Valeurs autorisées : A-H ou null' },
        { status: 400 },
      );
    }

    // Récupérer l'ancien avatar pour l'historique
    const user = await db.utilisateur.findUnique({
      where: { email: session.user.email },
      select: { id: true, avatar: true },
    });

    if (!user) {
      return NextResponse.json({ erreur: 'Utilisateur introuvable' }, { status: 404 });
    }

    // Mettre à jour
    await db.utilisateur.update({
      where: { id: user.id },
      data: { avatar },
    });

    // Tracer dans HistoriqueParametre
    await db.historiqueParametre.create({
      data: {
        entite: 'Utilisateur',
        entiteId: user.id,
        champ: 'avatar',
        ancienneValeur: user.avatar || '(aucun)',
        nouvelleValeur: avatar || '(aucun)',
        modifiePar: user.id,
      },
    }).catch(() => {});

    return NextResponse.json({ message: 'Avatar mis à jour', avatar });
  } catch (error) {
    console.error('[PROFIL] Erreur avatar:', error);
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 });
  }
}
