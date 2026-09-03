import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { parseJsonBody } from '@/lib/validation/parse';
import { changerMotDePasseSchema } from '@/lib/validation';

// POST /api/profil/changer-mot-de-passe
// Exige : ancienMotDePasse, nouveauMotDePasse
// Vérifie l'ancien mdp, hache le nouveau, trace dans HistoriqueParametre
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.email) {
      return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 });
    }

    // ─── Validation Zod centralisée (politique mot de passe partagée) ───────
    const parsed = await parseJsonBody(request, changerMotDePasseSchema);
    if (!parsed.success) return parsed.response;
    const { ancienMotDePasse, nouveauMotDePasse } = parsed.data;

    // Règle métier locale : le nouveau doit différer de l'ancien
    if (ancienMotDePasse === nouveauMotDePasse) {
      return NextResponse.json({ erreur: 'Le nouveau mot de passe doit être différent de l\'ancien' }, { status: 400 });
    }

    // Récupérer l'utilisateur avec le hash du mot de passe
    const user = await db.utilisateur.findUnique({
      where: { email: token.email as string },
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
