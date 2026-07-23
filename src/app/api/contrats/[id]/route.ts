import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserIdFromRequest } from '@/lib/audit-log';

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
    const userId = getUserIdFromRequest(request);

    const body = await request.json();
    const { reference, budgetAnnuel, dateDebut, dateFin, statut } = body;

    const existing = await db.contrat.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: 'Contrat introuvable.' }, { status: 404 });
    }

    const validStatuts = ['ACTIF', 'EXPIRE', 'SUSPENDU'];

    // Préparer les données de mise à jour et collecter les changements pour l'audit
    const updateData: Record<string, unknown> = {};
    const changes: { champ: string; ancienneValeur: unknown; nouvelleValeur: unknown }[] = [];

    if (reference) {
      const trimmed = reference.trim();
      if (trimmed !== existing.reference) {
        updateData.reference = trimmed;
        changes.push({ champ: 'reference', ancienneValeur: existing.reference, nouvelleValeur: trimmed });
      }
    }
    if (budgetAnnuel !== undefined) {
      const numBudget = Number(budgetAnnuel);
      if (String(numBudget) !== String(Number(existing.budgetAnnuel))) {
        updateData.budgetAnnuel = numBudget;
        changes.push({ champ: 'budgetAnnuel', ancienneValeur: existing.budgetAnnuel, nouvelleValeur: numBudget });
      }
    }
    if (dateDebut) {
      const d = new Date(dateDebut);
      if (d.getTime() !== existing.dateDebut.getTime()) {
        updateData.dateDebut = d;
        changes.push({ champ: 'dateDebut', ancienneValeur: existing.dateDebut.toISOString(), nouvelleValeur: d.toISOString() });
      }
    }
    if (dateFin) {
      const d = new Date(dateFin);
      if (d.getTime() !== existing.dateFin.getTime()) {
        updateData.dateFin = d;
        changes.push({ champ: 'dateFin', ancienneValeur: existing.dateFin.toISOString(), nouvelleValeur: d.toISOString() });
      }
    }
    if (statut && validStatuts.includes(statut)) {
      if (statut !== existing.statut) {
        updateData.statut = statut;
        changes.push({ champ: 'statut', ancienneValeur: existing.statut, nouvelleValeur: statut });
      }
    }

    const updated = await db.contrat.update({
      where: { id },
      data: updateData,
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { appelsDeFonds: true } },
      },
    });

    // Audit log : enregistrer chaque champ modifié
    for (const change of changes) {
      await logParametreChange({
        entite: 'Contrat', entiteId: id, ...change, modifiePar: userId,
      });
    }

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
    const userId = getUserIdFromRequest(request);

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

    // Audit log : suppression
    await logParametreChange({
      entite: 'Contrat', entiteId: id, champ: 'SUPPRESSION',
      ancienneValeur: `Réf: ${existing.reference}, Budget: ${existing.budgetAnnuel}, Statut: ${existing.statut}`,
      nouvelleValeur: null, modifiePar: userId,
    });

    return NextResponse.json({ message: 'Contrat supprimé.' });
  } catch {
    return NextResponse.json({ erreur: 'Erreur lors de la suppression.' }, { status: 500 });
  }
}
