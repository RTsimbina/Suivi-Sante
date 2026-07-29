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

      // Prestataires ayant des dossiers pour cette société
      db.dossier.groupBy({
        by: ['prestataireId'],
        where: {
          societeId: id,
          prestataireId: { not: null },
        },
        _count: { prestataireId: true },
        _sum: { montantReclame: true },
      }).then((grouped) => {
        // Récupérer les infos des prestataires
        const ids = grouped.map((g) => g.prestataireId!).filter(Boolean);
        if (ids.length === 0) return [];
        return db.prestataire
          .findMany({
            where: { id: { in: ids } },
            select: { id: true, nom: true, type: true, telephone: true, actif: true },
          })
          .then((prestas) => {
            const map = new Map(prestas.map((p) => [p.id, p]));
            return grouped
              .map((g) => {
                const p = map.get(g.prestataireId!);
                if (!p) return null;
                return {
                  id: p.id,
                  nom: p.nom,
                  type: p.type,
                  telephone: p.telephone,
                  actif: p.actif,
                  nbDossiers: g._count.prestataireId,
                  montantTotal: g._sum.montantReclame || 0,
                };
              })
              .filter(Boolean)
              .sort((a, b) => (b as any).nbDossiers - (a as any).nbDossiers);
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
