import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';

// POST /api/profil/changer-mot-de-passe
// Exige : ancienMotDePasse, nouveauMotDePasse
// Vérifie l'ancien mdp, hache le nouveau, trace dans HistoriqueParametre
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    const { ancienMotDePasse, nouveauMotDePasse } = await request.json() as {
      ancienMotDePasse?: string;
      nouveauMotDePasse?: string;
    };

    // Validations
    if (!ancienMotDePasse || !nouveauMotDePasse) {
      return NextResponse.json({ erreur: 'Champs requis manquants' }, { status: 400 });
    }
    if (nouveauMotDePasse.length < 6) {
      return NextResponse.json({ erreur: 'Le nouveau mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }
    if (ancienMotDePasse === nouveauMotDePasse) {
      return NextResponse.json({ erreur: 'Le nouveau mot de passe doit être différent de l\'ancien' }, { status: 400 });
    }

    // Récupérer l'utilisateur avec le hash du mot de passe
    const user = await db.utilisateur.findUnique({
      where: { email: session.user.email },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ erreur: 'Utilisateur introuvable' }, { status: 404 });
    }

    // Vérifier l'ancien mot de passe
    const ancienValide = await compare(ancienMotDePasse, user.password);
    if (!ancienValide) {
      return NextResponse.json({ erreur: 'Ancien mot de passe incorrect' }, { status: 403 });
    }

    // Hacher et mettre à jour
    const nouveauHash = await hash(nouveauMotDePasse, 12);
    await db.utilisateur.update({
      where: { id: user.id },
      data: { password: nouveauHash },
    });

    // Tracer dans HistoriqueParametre
    await db.historiqueParametre.create({
      data: {
        entite: 'Utilisateur',
        entiteId: user.id,
        champ: 'password',
        ancienneValeur: '******',
        nouvelleValeur: '******',
        modifiePar: user.id,
      },
    }).catch(() => {
      // Ne pas bloquer si l'historique échoue
    });

    return NextResponse.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('[PROFIL] Erreur changement mdp:', error);
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 });
  }
}
