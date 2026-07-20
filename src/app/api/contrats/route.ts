import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── GET : Liste des contrats ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const contrats = await db.contrat.findMany({
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { appelsDeFonds: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = contrats.map((c) => ({
      ...c,
      soldeDisponible: c.budgetAnnuel - c.budgetUtilise,
      tauxUtilisation: c.budgetAnnuel > 0 ? Math.round((c.budgetUtilise / c.budgetAnnuel) * 100) : 0,
    }));

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}

// ─── POST : Créer un contrat ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { societeId, reference, budgetAnnuel, dateDebut, dateFin, statut } = body;

    if (!societeId || !reference || !budgetAnnuel || !dateDebut || !dateFin) {
      return NextResponse.json(
        { erreur: 'Champs obligatoires : societeId, reference, budgetAnnuel, dateDebut, dateFin.' },
        { status: 400 }
      );
    }

    // Vérifier la société
    const societe = await db.societe.findUnique({ where: { id: societeId } });
    if (!societe) {
      return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });
    }

    const validStatuts = ['ACTIF', 'EXPIRE', 'SUSPENDU'];
    const contratStatut = validStatuts.includes(statut) ? statut : 'ACTIF';

    const contrat = await db.contrat.create({
      data: {
        societeId,
        reference: reference.trim(),
        budgetAnnuel: Number(budgetAnnuel),
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        statut: contratStatut,
      },
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { appelsDeFonds: true } },
      },
    });

    return NextResponse.json(contrat, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ erreur: 'Un contrat avec cette référence existe déjà.' }, { status: 409 });
    }
    return NextResponse.json({ erreur: 'Erreur lors de la création du contrat.' }, { status: 500 });
  }
}