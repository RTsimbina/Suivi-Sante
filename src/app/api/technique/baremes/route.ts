import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── POST : Calculer le ticket modérateur ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { societeId, prestation, montantReclame } = body as {
      societeId: string;
      prestation: string;
      montantReclame: number;
    };

    // Validations
    if (!societeId || typeof societeId !== 'string') {
      return NextResponse.json(
        { erreur: "L'identifiant de la société est obligatoire." },
        { status: 400 }
      );
    }

    if (!prestation || typeof prestation !== 'string') {
      return NextResponse.json(
        { erreur: 'La prestation est obligatoire.' },
        { status: 400 }
      );
    }

    if (typeof montantReclame !== 'number' || montantReclame <= 0) {
      return NextResponse.json(
        { erreur: 'Le montant réclamé doit être un nombre positif.' },
        { status: 400 }
      );
    }

    // Récupérer la société avec ses barèmes
    const societe = await db.societe.findUnique({
      where: { id: societeId },
      select: { id: true, nom: true },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Rechercher le barème actif correspondant à la prestation
    const bareme = await db.bareme.findUnique({
      where: {
        societeId_prestation: {
          societeId,
          prestation: prestation.toUpperCase(),
        },
      },
    });

    if (!bareme) {
      return NextResponse.json(
        {
          erreur: `Aucun barème trouvé pour la prestation "${prestation}" dans la société "${societe.nom}".`,
          societe: { id: societe.id, nom: societe.nom },
        },
        { status: 404 }
      );
    }

    if (!bareme.active) {
      return NextResponse.json(
        {
          erreur: `Le barème pour la prestation "${prestation}" est désactivé dans la société "${societe.nom}".`,
          bareme: {
            prestation: bareme.prestation,
            active: false,
          },
        },
        { status: 400 }
      );
    }

    // Calcul du ticket modérateur
    const montantCouvert = Math.min(montantReclame, bareme.plafond);
    const montantRembourse = montantCouvert * (bareme.tauxCouverture / 100);
    const ticketModerateur = montantReclame - montantRembourse;

    // Construction de l'explication en français
    const plafondAtteint = montantReclame > bareme.plafond;
    let explication: string;

    if (plafondAtteint) {
      explication = [
        `Pour la prestation "${prestation}" de la société "${societe.nom}" :`,
        `Le montant réclamé (${montantReclame.toLocaleString('fr-FR')} FCFA) dépasse le plafond de ${bareme.plafond.toLocaleString('fr-FR')} FCFA.`,
        `Le montant couvert est donc plafonné à ${montantCouvert.toLocaleString('fr-FR')} FCFA.`,
        `Avec un taux de couverture de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} FCFA.`,
        `Le ticket modérateur à la charge du bénéficiaire est de ${ticketModerateur.toLocaleString('fr-FR')} FCFA.`,
      ].join(' ');
    } else {
      explication = [
        `Pour la prestation "${prestation}" de la société "${societe.nom}" :`,
        `Le montant réclamé (${montantReclame.toLocaleString('fr-FR')} FCFA) est dans la limite du plafond de ${bareme.plafond.toLocaleString('fr-FR')} FCFA.`,
        `Avec un taux de couverture de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} FCFA.`,
        `Le ticket modérateur à la charge du bénéficiaire est de ${ticketModerateur.toLocaleString('fr-FR')} FCFA.`,
      ].join(' ');
    }

    return NextResponse.json({
      societe: { id: societe.id, nom: societe.nom },
      bareme: {
        prestation: bareme.prestation,
        tauxCouverture: bareme.tauxCouverture,
        plafond: bareme.plafond,
        description: bareme.description ?? null,
      },
      calcul: {
        montantReclame,
        plafondAtteint,
        montantCouvert,
        tauxCouverture: bareme.tauxCouverture,
        montantRembourse: Math.round(montantRembourse * 100) / 100,
        ticketModerateur: Math.round(ticketModerateur * 100) / 100,
      },
      explication,
    });
  } catch (error) {
    console.error('Erreur lors du calcul du ticket modérateur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du calcul du ticket modérateur.' },
      { status: 500 }
    );
  }
}