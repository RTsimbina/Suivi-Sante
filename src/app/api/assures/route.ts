import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── GET : Lister tous les assurés ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const societeId = searchParams.get('societeId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {
      ...(societeId ? { societeId } : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search } },
              { prenom: { contains: search } },
              { nSS: { contains: search } },
              { email: { contains: search } },
              { telephone: { contains: search } },
            ],
          }
        : {}),
    };

    const [assures, total] = await Promise.all([
      db.assure.findMany({
        where,
        include: {
          societe: { select: { id: true, nom: true } },
          _count: { select: { dossiers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.assure.count({ where }),
    ]);

    return NextResponse.json({
      assures,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des assurés :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération des assurés.' },
      { status: 500 }
    );
  }
}

// ─── POST : Créer un assuré (Admin uniquement) ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { societeId, nom, prenom, nSS, dateNaissance, sexe, telephone, email, adresse, actif } = body;

    // Validations
    if (!societeId || !nom) {
      return NextResponse.json(
        { erreur: 'La société et le nom sont obligatoires.' },
        { status: 400 }
      );
    }

    // Vérifier la société
    const societe = await db.societe.findUnique({ where: { id: societeId } });
    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Vérifier l'unicité du NSS
    if (nSS) {
      const existingNSS = await db.assure.findUnique({ where: { nSS } });
      if (existingNSS) {
        return NextResponse.json(
          { erreur: 'Un assuré avec ce numéro de sécurité sociale existe déjà.' },
          { status: 409 }
        );
      }
    }

    const assure = await db.assure.create({
      data: {
        societeId,
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        nSS: nSS ? nSS.trim() : null,
        dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
        sexe: sexe || null,
        telephone: telephone || null,
        email: email ? email.toLowerCase().trim() : null,
        adresse: adresse || null,
        actif: actif !== false,
      },
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { dossiers: true } },
      },
    });

    return NextResponse.json(
      { message: 'Assuré créé avec succès.', assure },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de la création de l\'assuré :', error);

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { erreur: 'Un assuré avec ces informations existe déjà (NSS ou email dupliqué).' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création de l\'assuré.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Modifier un assuré (Admin uniquement) ───────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { id, nom, prenom, nSS, dateNaissance, sexe, telephone, email, adresse, societeId, actif } = body;

    if (!id) {
      return NextResponse.json({ erreur: "L'id est requis." }, { status: 400 });
    }

    const existing = await db.assure.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: 'Assuré introuvable.' }, { status: 404 });
    }

    // Vérifier unicité NSS si changé
    if (nSS && nSS !== existing.nSS) {
      const existingNSS = await db.assure.findUnique({ where: { nSS } });
      if (existingNSS) {
        return NextResponse.json(
          { erreur: 'Un assuré avec ce numéro de sécurité sociale existe déjà.' },
          { status: 409 }
        );
      }
    }

    // Vérifier la société si changée
    if (societeId) {
      const societe = await db.societe.findUnique({ where: { id: societeId } });
      if (!societe) {
        return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (nom) updateData.nom = nom.trim();
    if (prenom !== undefined) updateData.prenom = prenom ? prenom.trim() : null;
    if (nSS !== undefined) updateData.nSS = nSS ? nSS.trim() : null;
    if (dateNaissance !== undefined) updateData.dateNaissance = dateNaissance ? new Date(dateNaissance) : null;
    if (sexe !== undefined) updateData.sexe = sexe || null;
    if (telephone !== undefined) updateData.telephone = telephone || null;
    if (email !== undefined) updateData.email = email ? email.toLowerCase().trim() : null;
    if (adresse !== undefined) updateData.adresse = adresse || null;
    if (societeId) updateData.societeId = societeId;
    if (typeof actif === 'boolean') updateData.actif = actif;

    const updated = await db.assure.update({
      where: { id },
      data: updateData,
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { dossiers: true } },
      },
    });

    return NextResponse.json({ message: 'Assuré mis à jour avec succès.', assure: updated });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'assuré :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la mise à jour de l\'assuré.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer un assuré (Admin uniquement) ───────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ erreur: "L'id est requis." }, { status: 400 });
    }

    const assure = await db.assure.findUnique({
      where: { id },
      include: { _count: { select: { dossiers: true } } },
    });

    if (!assure) {
      return NextResponse.json({ erreur: 'Assuré introuvable.' }, { status: 404 });
    }

    if (assure._count.dossiers > 0) {
      return NextResponse.json(
        { erreur: `Impossible de supprimer cet assuré : ${assure._count.dossiers} dossier(s) y sont rattaché(s).` },
        { status: 409 }
      );
    }

    await db.assure.delete({ where: { id } });

    return NextResponse.json({ message: `L'assuré "${assure.nom}" a été supprimé avec succès.` });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'assuré :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la suppression de l\'assuré.' },
      { status: 500 }
    );
  }
}