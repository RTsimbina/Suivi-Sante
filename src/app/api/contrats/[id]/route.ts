import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── GET : Un contrat par ID ───────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    const contrat = await db.contrat.findUnique({
      where: { id },
      include: {
        societe: { select: { id: true, nom: true } },
        appelsDeFonds: { select: { montant: true, statut: true }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!contrat) {
      return NextResponse.json({ erreur: 'Contrat introuvable.' }, { status: 404 });
    }

    const budget = Number(contrat.budgetAnnuel) || 0;
    const utilise = contrat.appelsDeFonds.reduce((s: number, a) => s + (Number(a.montant) || 0), 0);

    return NextResponse.json({
      id: contrat.id,
      societeId: contrat.societeId,
      societe: contrat.societe,
      reference: contrat.reference,
      budgetAnnuel: budget,
      budgetUtilise: utilise,
      soldeDisponible: budget - utilise,
      tauxUtilisation: budget > 0 ? Math.round((utilise / budget) * 100) : 0,
      dateDebut: contrat.dateDebut.toISOString(),
      dateFin: contrat.dateFin.toISOString(),
      statut: contrat.statut,
      appelsDeFonds: contrat.appelsDeFonds,
      createdAt: contrat.createdAt.toISOString(),
      updatedAt: contrat.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ erreur: 'Erreur.' }, { status: 500 });
  }
}

// ─── PUT : Mettre à jour un contrat ────────────────────────────────────────

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    const body = await request.json();
    const { reference, budgetAnnuel, dateDebut, dateFin, statut } = body;

    const existing = await db.contrat.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: 'Contrat introuvable.' }, { status: 404 });
    }

    const validStatuts = ['ACTIF', 'EXPIRE', 'SUSPENDU'];

    const updated = await db.contrat.update({
      where: { id },
      data: {
        ...(reference ? { reference: reference.trim() } : {}),
        ...(budgetAnnuel !== undefined ? { budgetAnnuel: Number(budgetAnnuel) } : {}),
        ...(dateDebut ? { dateDebut: new Date(dateDebut) } : {}),
        ...(dateFin ? { dateFin: new Date(dateFin) } : {}),
        ...(statut && validStatuts.includes(statut) ? { statut } : {}),
      },
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { appelsDeFonds: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ erreur: 'Un contrat avec cette référence existe déjà.' }, { status: 409 });
    }
    return NextResponse.json({ erreur: 'Erreur lors de la mise à jour.' }, { status: 500 });
  }
}

// ─── DELETE : Supprimer un contrat ─────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    const existing = await db.contrat.findUnique({
      where: { id },
      include: { _count: { select: { appelsDeFonds: true } } },
    });

    if (!existing) {
      return NextResponse.json({ erreur: 'Contrat introuvable.' }, { status: 404 });
    }

    if (existing._count.appelsDeFonds > 0) {
      return NextResponse.json(
        { erreur: `Impossible de supprimer : ${existing._count.appelsDeFonds} appel(s) de fonds lié(s).` },
        { status: 409 }
      );
    }

    await db.contrat.delete({ where: { id } });

    return NextResponse.json({ message: 'Contrat supprimé.' });
  } catch {
    return NextResponse.json({ erreur: 'Erreur lors de la suppression.' }, { status: 500 });
  }
}