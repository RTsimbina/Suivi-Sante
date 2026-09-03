import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { prestataireCreateSchema, prestataireUpdateSchema } from '@/lib/validation';

// ─── GET : Lister tous les prestataires ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search } },
              { telephone: { contains: search } },
              { email: { contains: search } },
              { adresse: { contains: search } },
            ],
          }
        : {}),
    };

    const [prestataires, total] = await Promise.all([
      db.prestataire.findMany({
        where,
        include: {
          _count: { select: { dossiers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.prestataire.count({ where }),
    ]);

    return NextResponse.json({
      prestataires,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des prestataires :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération des prestataires.' },
      { status: 500 }
    );
  }
}

// ─── POST : Créer un prestataire (Admin uniquement) ────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (nom, type ∈ enum) ──────────────────────
    const parsed = await parseJsonBody(request, prestataireCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, type, telephone, email, adresse, nif, statut, rib, actif } = parsed.data;

    const prestataire = await db.prestataire.create({
      data: {
        nom,
        type,
        telephone: telephone ?? null,
        email: email ? email.toLowerCase() : null,
        adresse: adresse ?? null,
        nif: nif ?? null,
        statut: statut ?? null,
        rib: rib ?? null,
        actif: actif !== false,
      },
      include: {
        _count: { select: { dossiers: true } },
      },
    });

    return NextResponse.json(
      { message: 'Prestataire créé avec succès.', prestataire },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de la création du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création du prestataire.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Modifier un prestataire (Admin uniquement) ──────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (whitelist, enum type, booléen actif) ───
    const parsed = await parseJsonBody(request, prestataireUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { id, nom, type, telephone, email, adresse, nif, statut, rib, actif } = parsed.data;

    const existing = await db.prestataire.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (nom !== undefined) updateData.nom = nom;
    if (type !== undefined) updateData.type = type;
    if (telephone !== undefined) updateData.telephone = telephone ?? null;
    if (email !== undefined) updateData.email = email ? email.toLowerCase() : null;
    if (adresse !== undefined) updateData.adresse = adresse ?? null;
    if (nif !== undefined) updateData.nif = nif ?? null;
    if (statut !== undefined) updateData.statut = statut ?? null;
    if (rib !== undefined) updateData.rib = rib ?? null;
    // Le schéma Zod garantit un booléen (avant : typeof vérifié ici)
    if (actif !== undefined) updateData.actif = actif;

    const updated = await db.prestataire.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { dossiers: true } },
      },
    });

    return NextResponse.json({ message: 'Prestataire mis à jour avec succès.', prestataire: updated });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la mise à jour du prestataire.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer un prestataire (Admin uniquement) ──────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ erreur: "L'id est requis." }, { status: 400 });
    }

    const prestataire = await db.prestataire.findUnique({
      where: { id },
      include: { _count: { select: { dossiers: true } } },
    });

    if (!prestataire) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    if (prestataire._count.dossiers > 0) {
      return NextResponse.json(
        { erreur: `Impossible de supprimer ce prestataire : ${prestataire._count.dossiers} dossier(s) y sont rattaché(s).` },
        { status: 409 }
      );
    }

    await db.prestataire.delete({ where: { id } });

    return NextResponse.json({ message: `Le prestataire "${prestataire.nom}" a été supprimé avec succès.` });
  } catch (error) {
    console.error('Erreur lors de la suppression du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la suppression du prestataire.' },
      { status: 500 }
    );
  }
}