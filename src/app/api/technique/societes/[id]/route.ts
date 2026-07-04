import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { Prisma } from '@prisma/client';

// Types
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

// ─── GET : Récupérer une société avec ses barèmes ─────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;

    const societe = await db.societe.findUnique({
      where: { id },
      include: {
        baremes: { orderBy: { prestation: 'asc' } },
        _count: { select: { dossiers: true, contrats: true } },
      },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ societe });
  } catch (error) {
    console.error('Erreur lors de la récupération de la société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération de la société.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Mettre à jour une société et/ou ses barèmes ────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const { nom, adresse, telephone, email, nif, contactPrincipal, baremes } = body as {
      nom?: string;
      adresse?: string;
      telephone?: string;
      email?: string;
      nif?: string;
      contactPrincipal?: string;
      baremes?: BaremeInput[];
    };

    // Vérifier que la société existe
    const existing = await db.societe.findUnique({
      where: { id },
      include: { baremes: true },
    });

    if (!existing) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Validation du nom si fourni
    if (nom !== undefined) {
      if (typeof nom !== 'string' || nom.trim().length === 0) {
        return NextResponse.json(
          { erreur: 'Le nom de la société ne peut pas être vide.' },
          { status: 400 }
        );
      }
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

    // Préparer les opérations de barèmes (upsert par prestation)
    let baremesOperations: Prisma.BaremeCreateWithoutSocieteInput[] | undefined;
    if (baremes && baremes.length > 0) {
      baremesOperations = baremes.map((b) => ({
        prestation: b.prestation,
        tauxCouverture: b.tauxCouverture,
        plafond: b.plafond,
        description: b.description ?? null,
        active: b.active ?? true,
      }));
    }

    // Mettre à jour la société
    // Stratégie : supprimer les anciens barèmes et recréer les nouveaux
    // (upsert massif avec transaction pour la cohérence)
    const updatedSociete = await db.$transaction(async (tx) => {
      // Si des barèmes sont fournis, les remplacer
      if (baremes && baremesOperations) {
        await tx.bareme.deleteMany({ where: { societeId: id } });

        for (const b of baremesOperations) {
          await tx.bareme.create({
            data: {
              societeId: id,
              prestation: b.prestation,
              tauxCouverture: b.tauxCouverture,
              plafond: b.plafond,
              description: b.description ?? null,
              active: b.active ?? true,
            },
          });
        }
      }

      return tx.societe.update({
        where: { id },
        data: {
          ...(nom ? { nom: nom.trim() } : {}),
          ...(adresse !== undefined ? { adresse: adresse?.trim() || null } : {}),
          ...(telephone !== undefined ? { telephone: telephone?.trim() || null } : {}),
          ...(email !== undefined ? { email: email?.trim() || null } : {}),
          ...(nif !== undefined ? { nif: nif?.trim() || null } : {}),
          ...(contactPrincipal !== undefined ? { contactPrincipal: contactPrincipal?.trim() || null } : {}),
        },
        include: {
          baremes: { orderBy: { prestation: 'asc' } },
          _count: { select: { dossiers: true, contrats: true } },
        },
      });
    });

    return NextResponse.json({
      message: 'Société mise à jour avec succès.',
      societe: updatedSociete,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la société :', error);

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
      { erreur: 'Erreur serveur lors de la mise à jour de la société.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer une société ───────────────────────────────────────────

export async function DELETE(
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
      include: {
        _count: { select: { dossiers: true, contrats: true } },
      },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Vérifier qu'aucun dossier n'est lié
    if (societe._count.dossiers > 0) {
      return NextResponse.json(
        {
          erreur: `Impossible de supprimer cette société : ${societe._count.dossiers} dossier(s) y sont rattaché(s). Supprimez ou réaffectez les dossiers avant de supprimer la société.`,
        },
        { status: 409 }
      );
    }

    // Supprimer la société (les barèmes et contrats seront supprimés en cascade par Prisma si configuré)
    // Pour SQLite, on supprime d'abord les barèmes et contrats manuellement
    await db.$transaction(async (tx) => {
      await tx.bareme.deleteMany({ where: { societeId: id } });
      await tx.contrat.deleteMany({ where: { societeId: id } });
      await tx.societe.delete({ where: { id } });
    });

    return NextResponse.json({
      message: `La société "${societe.nom}" a été supprimée avec succès.`,
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la suppression de la société.' },
      { status: 500 }
    );
  }
}