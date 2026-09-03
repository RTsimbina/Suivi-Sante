import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { societeTechniqueCreateSchema } from '@/lib/validation';

// ─── GET : Lister toutes les sociétés ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const withBaremes = searchParams.get('withBaremes') === 'true';
    const search = (searchParams.get('search') || '').trim();

    const where: any = {};
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { telephone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { nif: { contains: search } },
      ];
    }

    const societes = await db.societe.findMany({
      where,
      orderBy: { nom: 'asc' },
      include: {
        baremes: withBaremes
          ? {
              where: { active: true },
              orderBy: { prestation: 'asc' },
            }
          : false,
        _count: { select: { dossiers: true, contrats: true, assures: true, baremes: true } },
      },
    });

    return NextResponse.json({ societes, total: societes.length });
  } catch (error) {
    console.error('Erreur lors de la récupération des sociétés :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération des sociétés.' },
      { status: 500 }
    );
  }
}

// ─── POST : Créer une société avec barèmes optionnels ─────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (nom requis, barèmes : enum prestation,
    //     taux 0-100, plafond > 0) ────────────────────────────────────────────
    const parsed = await parseJsonBody(request, societeTechniqueCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, adresse, telephone, email, nif, contactPrincipal, baremes } = parsed.data;

    // Vérifier les doublons de prestation dans le tableau
    if (baremes && baremes.length > 0) {
      const prestations = baremes.map((b) => b.prestation);
      const doublons = prestations.filter((p, i) => prestations.indexOf(p) !== i);
      if (doublons.length > 0) {
        return NextResponse.json(
          { erreur: `Prestations en doublon : ${[...new Set(doublons)].join(', ')}.` },
          { status: 400 }
        );
      }
    }

    // Créer la société avec ses barèmes
    const societe = await db.societe.create({
      data: {
        nom,
        ...(adresse ? { adresse } : {}),
        ...(telephone ? { telephone } : {}),
        ...(email ? { email } : {}),
        ...(nif ? { nif } : {}),
        ...(contactPrincipal ? { contactPrincipal } : {}),
        baremes: baremes && baremes.length > 0
          ? {
              create: baremes.map((b) => ({
                prestation: b.prestation,
                tauxCouverture: b.tauxCouverture,
                plafond: b.plafond,
                description: b.description ?? null,
                active: b.active ?? true,
              })),
            }
          : undefined,
      },
      include: {
        baremes: { orderBy: { prestation: 'asc' } },
      },
    });

    return NextResponse.json(
      { message: 'Société créée avec succès.', societe },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de la création de la société :', error);

    // Gérer l'erreur d'unicité (nom de société dupliqué si applicable)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { erreur: 'Une société avec ce nom existe déjà.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création de la société.' },
      { status: 500 }
    );
  }
}