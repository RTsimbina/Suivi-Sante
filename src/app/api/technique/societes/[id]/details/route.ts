import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── GET : Détails étendus d'une société (barèmes, assurés, prestataires) ────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;

    // Vérifier que la société existe
    const societe = await db.societe.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Récupérer les 3 ensembles en parallèle
    const [baremes, assures, prestataires] = await Promise.all([
      // Barèmes de la société
      db.bareme.findMany({
        where: { societeId: id },
        orderBy: { prestation: 'asc' },
      }),

      // Assurés de la société
      db.assure.findMany({
        where: { societeId: id },
        orderBy: { nom: 'asc' },
        select: {
          id: true,
          nom: true,
          prenom: true,
          nSS: true,
          telephone: true,
          email: true,
          actif: true,
          _count: { select: { dossiers: true } },
        },
      }),

      // Prestataires liés à cette société via PrestataireSociete (avec statut actif/inactif)
      db.prestataireSociete.findMany({
        where: { societeId: id },
        include: {
          prestataire: {
            select: { id: true, nom: true, type: true, telephone: true, actif: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }).then((lienPS) => {
        if (lienPS.length === 0) return [];
        const prestaIds = lienPS.map((l) => l.prestataire.id);
        return db.dossier
          .groupBy({
            by: ['prestataireId'],
            where: { societeId: id, prestataireId: { in: prestaIds } },
            _count: { prestataireId: true },
            _sum: { montantReclame: true },
          })
          .then((grouped) => {
            const dossiersMap = new Map(
              grouped.map((g) => [g.prestataireId!, { nb: g._count.prestataireId, montant: g._sum.montantReclame || 0 }])
            );
            return lienPS.map((l) => {
              const d = dossiersMap.get(l.prestataire.id);
              return {
                lienId: l.id,
                id: l.prestataire.id,
                nom: l.prestataire.nom,
                type: l.prestataire.type,
                telephone: l.prestataire.telephone,
                actifGlobal: l.prestataire.actif,
                actifSociete: l.actif,
                nbDossiers: d?.nb || 0,
                montantTotal: d?.montant || 0,
              };
            });
          });
      }),
    ]);

    return NextResponse.json({
      baremes,
      assures,
      prestataires,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de la société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur.' },
      { status: 500 }
    );
  }
}
