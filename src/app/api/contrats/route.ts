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
        appelsDeFonds: { select: { montant: true, statut: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = contrats.map((c) => {
      const budget = Number(c.budgetAnnuel) || 0;
      const utilise = c.appelsDeFonds.reduce((sum: number, a) => sum + (Number(a.montant) || 0), 0);
      const solde = budget - utilise;
      const taux = budget > 0 ? Math.round((utilise / budget) * 100) : 0;
      return {
        id: c.id,
        societeId: c.societeId,
        societe: c.societe,
        reference: c.reference,
        budgetAnnuel: budget,
        budgetUtilise: utilise,
        soldeDisponible: solde,
        tauxUtilisation: taux,
        dateDebut: c.dateDebut.toISOString(),
        dateFin: c.dateFin.toISOString(),
        statut: c.statut,
        _count: { appelsDeFonds: c.appelsDeFonds.length },
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

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