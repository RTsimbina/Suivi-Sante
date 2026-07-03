import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// Types pour la validation
interface BaremeInput {
  prestation: string;
  tauxCouverture: number;
  plafond: number;
  description?: string;
  active?: boolean;
}

const PRESTATIONS_VALIDES = [
  'HOSPITALISATION',
  'CONSULTATION',
  'PHARMACIE',
  'MATERNITE',
  'CHIRURGIE',
  'EXAMEN',
  'SOINS DENTAIRES',
  'OPTIQUE',
];

// ─── GET : Lister toutes les sociétés ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const withBaremes = searchParams.get('withBaremes') === 'true';

    const societes = await db.societe.findMany({
      orderBy: { nom: 'asc' },
      include: {
        baremes: withBaremes
          ? {
              where: { active: true },
              orderBy: { prestation: 'asc' },
            }
          : false,
        _count: { select: { dossiers: true, contrats: true, baremes: true } },
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

    const body = await request.json();
    const { nom, baremes } = body as {
      nom: string;
      baremes?: BaremeInput[];
    };

    // Validation du nom
    if (!nom || typeof nom !== 'string' || nom.trim().length === 0) {
      return NextResponse.json(
        { erreur: 'Le nom de la société est obligatoire.' },
        { status: 400 }
      );
    }

    // Validation des barèmes si fournis
    if (baremes && Array.isArray(baremes)) {
      for (const b of baremes) {
        if (!b.prestation || !PRESTATIONS_VALIDES.includes(b.prestation)) {
          return NextResponse.json(
            {
              erreur: `Prestation invalide : "${b.prestation}". Valeurs autorisées : ${PRESTATIONS_VALIDES.join(', ')}.`,
            },
            { status: 400 }
          );
        }
        if (typeof b.tauxCouverture !== 'number' || b.tauxCouverture < 0 || b.tauxCouverture > 100) {
          return NextResponse.json(
            { erreur: `Le taux de couverture pour "${b.prestation}" doit être un nombre entre 0 et 100.` },
            { status: 400 }
          );
        }
        if (typeof b.plafond !== 'number' || b.plafond < 0) {
          return NextResponse.json(
            { erreur: `Le plafond pour "${b.prestation}" doit être un nombre positif.` },
            { status: 400 }
          );
        }
      }

      // Vérifier les doublons de prestation dans le tableau
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
        nom: nom.trim(),
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