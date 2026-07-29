import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserIdFromRequest } from '@/lib/audit-log';

// ─── GET : Lister tous les liens prestataire-société ────────────────────────
// Query params optionnels : societeId, prestataireId

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const societeId = searchParams.get('societeId');
    const prestataireId = searchParams.get('prestataireId');

    const where: Record<string, unknown> = {};
    if (societeId) where.societeId = societeId;
    if (prestataireId) where.prestataireId = prestataireId;

    const liens = await db.prestataireSociete.findMany({
      where,
      include: {
        prestataire: { select: { id: true, nom: true, type: true, telephone: true, actif: true } },
        societe: { select: { id: true, nom: true, actif: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ liens });
  } catch (error) {
    console.error('Erreur récupération liens prestataire-société :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── POST : Lier un prestataire à une société ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { prestataireId, societeId } = body as { prestataireId?: string; societeId?: string };

    if (!prestataireId || !societeId) {
      return NextResponse.json({ erreur: 'prestataireId et societeId requis.' }, { status: 400 });
    }

    // Vérifier que les deux existent
    const [prestataire, societe] = await Promise.all([
      db.prestataire.findUnique({ where: { id: prestataireId } }),
      db.societe.findUnique({ where: { id: societeId } }),
    ]);

    if (!prestataire) return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    if (!societe) return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });

    const lien = await db.prestataireSociete.upsert({
      where: { prestataireId_societeId: { prestataireId, societeId } },
      update: { actif: true },
      create: { prestataireId, societeId, actif: true },
    });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: lien.id, champ: 'CREATION',
      ancienneValeur: null, nouvelleValeur: `${prestataire.nom} → ${societe.nom}`, modifiePar: userId,
    });

    return NextResponse.json({ lien }, { status: 201 });
  } catch (error) {
    console.error('Erreur création lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── PATCH : Toggle actif/inactif ────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { id, actif } = body as { id?: string; actif?: boolean };

    if (!id || actif === undefined) {
      return NextResponse.json({ erreur: 'id et actif requis.' }, { status: 400 });
    }

    const existing = await db.prestataireSociete.findUnique({
      where: { id },
      include: { prestataire: true, societe: true },
    });

    if (!existing) return NextResponse.json({ erreur: 'Lien introuvable.' }, { status: 404 });

    const updated = await db.prestataireSociete.update({
      where: { id },
      data: { actif },
    });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: id, champ: 'actif',
      ancienneValeur: existing.actif ? 'Actif' : 'Inactif',
      nouvelleValeur: actif ? 'Actif' : 'Inactif',
      modifiePar: userId,
    });

    return NextResponse.json({
      lien: updated,
      message: actif
        ? `${existing.prestataire.nom} réactivé pour ${existing.societe.nom}.`
        : `${existing.prestataire.nom} désactivé pour ${existing.societe.nom}. Les actes seront refusés automatiquement.`,
    });
  } catch (error) {
    console.error('Erreur toggle lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── DELETE : Retirer un prestataire d'une société ──────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ erreur: 'id requis.' }, { status: 400 });

    const existing = await db.prestataireSociete.findUnique({
      where: { id },
      include: { prestataire: true, societe: true },
    });

    if (!existing) return NextResponse.json({ erreur: 'Lien introuvable.' }, { status: 404 });

    await db.prestataireSociete.delete({ where: { id } });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: id, champ: 'SUPPRESSION',
      ancienneValeur: `${existing.prestataire.nom} → ${existing.societe.nom}`,
      nouvelleValeur: null, modifiePar: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
