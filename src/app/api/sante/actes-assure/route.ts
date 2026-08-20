import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = request.nextUrl;
    const assureId = searchParams.get('assureId');
    const typeDossier = searchParams.get('typeDossier') || undefined;
    const statut = searchParams.get('statut') || undefined;
    const prestataireId = searchParams.get('prestataireId') || undefined;
    const dateDebut = searchParams.get('dateDebut') || undefined;
    const dateFin = searchParams.get('dateFin') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '15', 10)));

    if (!assureId) {
      return Response.json({ erreur: 'assureId est requis.' }, { status: 400 });
    }

    // Construire les filtres Where
    const where: Record<string, unknown> = {
      assureId,
      statut: { not: 'REJETE' },
    };

    if (typeDossier) where.typeDossier = typeDossier;
    if (statut) where.statut = statut;
    if (prestataireId) where.prestataireId = prestataireId;

    // Filtres dates
    const dateFilter: Record<string, unknown> = {};
    if (dateDebut) dateFilter.gte = new Date(dateDebut);
    if (dateFin) {
      const fin = new Date(dateFin);
      fin.setHours(23, 59, 59, 999);
      dateFilter.lte = fin;
    }
    if (Object.keys(dateFilter).length > 0) where.dateReception = dateFilter;

    // Recherche texte
    if (search) {
      where.OR = [
        { numeroDossier: { contains: search, mode: 'insensitive' } },
        { beneficiaire: { contains: search, mode: 'insensitive' } },
        { prestataireLegacy: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Compter le total
    const total = await db.dossier.count({ where });

    // Récupérer la page
    const dossiers = await db.dossier.findMany({
      where,
      include: {
        prestataire: { select: { id: true, nom: true, type: true } },
      },
      orderBy: { dateReception: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Types d'acte distincts pour le filtre (tous les types de cet assuré, année courante)
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const finAnnee = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const typesDistincts = await db.dossier.findMany({
      where: {
        assureId,
        statut: { not: 'REJETE' },
        dateReception: { gte: debutAnnee, lte: finAnnee },
      },
      select: { typeDossier: true },
      distinct: ['typeDossier'],
      orderBy: { typeDossier: 'asc' },
    });

    // Statuts distincts pour le filtre
    const statutsDistincts = await db.dossier.findMany({
      where: { assureId, statut: { not: 'REJETE' } },
      select: { statut: true },
      distinct: ['statut'],
      orderBy: { statut: 'asc' },
    });

    return Response.json({
      dossiers: dossiers.map(d => ({
        id: d.id,
        numeroDossier: d.numeroDossier,
        typeDossier: d.typeDossier,
        beneficiaire: d.beneficiaire,
        dateReception: d.dateReception,
        dateSoins: d.dateSoins,
        montantReclame: d.montantReclame,
        montantValide: d.montantValide,
        montantPaye: d.montantPaye,
        partPatient: d.partPatient,
        statut: d.statut,
        prestataireId: d.prestataireId,
        prestataire: d.prestataire?.nom || d.prestataireLegacy || null,
        prestataireType: d.prestataire?.type || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filtres: {
        typesActe: typesDistincts.map(t => t.typeDossier),
        statuts: statutsDistincts.map(s => s.statut),
      },
    });
  } catch (error) {
    console.error('[SANTÉ] Erreur recherche actes:', error);
    return Response.json(
      { erreur: "Une erreur est survenue lors de la recherche des actes." },
      { status: 500 }
    );
  } finally {
    await db.$disconnect();
  }
}
