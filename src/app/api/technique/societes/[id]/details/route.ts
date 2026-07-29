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

      // Prestataires liés à cette société via PrestataireSociete
      getPrestatairesForSociete(id),
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

// ─── Helper : prestataires pour une société avec stats dossiers ─────────────
async function getPrestatairesForSociete(societeId: string) {
  // Essayer via PrestataireSociete d'abord
  const lienPS = await db.prestataireSociete.findMany({
    where: { societeId },
    include: {
      prestataire: {
        select: { id: true, nom: true, type: true, telephone: true, actif: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fallback : si PrestataireSociete vide, utiliser les dossiers
  if (lienPS.length === 0) {
    try {
      const grouped = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: { societeId, prestataireId: { not: null } },
        _count: true,
        _sum: { montantReclame: true },
      });
      const ids = grouped.map((g) => g.prestataireId!).filter(Boolean);
      if (ids.length === 0) return [];
      const prestas = await db.prestataire.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, type: true, telephone: true, actif: true },
      });
      const map = new Map(prestas.map((p) => [p.id, p]));
      return grouped
        .map((g) => {
          const p = map.get(g.prestataireId!);
          if (!p) return null;
          return {
            lienId: '',
            id: p.id,
            nom: p.nom,
            type: p.type,
            telephone: p.telephone,
            actifGlobal: p.actif,
            actifSociete: true,
            nbDossiers: g._count,
            montantTotal: g._sum.montantReclame || 0,
          };
        })
        .filter(Boolean);
    } catch (err) {
      console.error('Erreur fallback dossiers pour prestataires :', err);
      return [];
    }
  }

  // PrestataireSociete a des données : enrichir avec les dossiers
  const prestaIds = lienPS.map((l) => l.prestataire.id);
  try {
    const grouped = await db.dossier.groupBy({
      by: ['prestataireId'],
      where: { societeId, prestataireId: { in: prestaIds } },
      _count: true,
      _sum: { montantReclame: true },
    });
    const dossiersMap = new Map(
      grouped.map((g) => [g.prestataireId!, { nb: g._count, montant: g._sum.montantReclame || 0 }])
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
  } catch (err) {
    console.error('Erreur stats dossiers pour prestataires :', err);
    // Retourner les liens sans stats plutôt que de planter
    return lienPS.map((l) => ({
      lienId: l.id,
      id: l.prestataire.id,
      nom: l.prestataire.nom,
      type: l.prestataire.type,
      telephone: l.prestataire.telephone,
      actifGlobal: l.prestataire.actif,
      actifSociete: l.actif,
      nbDossiers: 0,
      montantTotal: 0,
    }));
  }
}
