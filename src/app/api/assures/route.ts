import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── GET : Lister les assurés (avec filtres famille) ──────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const societeId = searchParams.get('societeId') || '';
    const typeBeneficiaire = searchParams.get('typeBeneficiaire') || ''; // ASSURE | CONJOINT | ENFANT
    const famille = searchParams.get('famille') || ''; // codeFamille
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const avecAyantsDroit = searchParams.get('avecAyantsDroit') === 'true';

    const where: Record<string, unknown> = {
      ...(societeId ? { societeId } : {}),
      ...(typeBeneficiaire ? { typeBeneficiaire } : {}),
      ...(famille ? { codeFamille: famille } : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search } },
              { prenom: { contains: search } },
              { nSS: { contains: search } },
              { matricule: { contains: search } },
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
        orderBy: [{ typeBeneficiaire: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.assure.count({ where }),
    ]);

    // Si avecAyantsDroit, charger les ayants droit pour les assurés principaux de cette page
    let ayantsDroitMap: Record<string, any[]> = {};
    if (avecAyantsDroit && assures.length > 0) {
      const principalIds = assures
        .filter((a) => a.typeBeneficiaire === 'ASSURE')
        .map((a) => a.id);
      if (principalIds.length > 0) {
        const ayantsDroit = await db.assure.findMany({
          where: { assurePrincipalId: { in: principalIds } },
          include: {
            societe: { select: { id: true, nom: true } },
            _count: { select: { dossiers: true } },
          },
          orderBy: { typeBeneficiaire: 'asc' },
        });
        for (const ad of ayantsDroit) {
          const pid = ad.assurePrincipalId;
          if (pid) {
            if (!ayantsDroitMap[pid]) ayantsDroitMap[pid] = [];
            ayantsDroitMap[pid].push(ad);
          }
        }
      }
    }

    // Comptes par type
    const statsTypes = await db.assure.groupBy({
      by: ['typeBeneficiaire'],
      _count: true,
    });
    const countsByType: Record<string, number> = {};
    for (const st of statsTypes) {
      countsByType[st.typeBeneficiaire] = st._count;
    }

    return NextResponse.json({
      assures,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      ayantsDroitMap: avecAyantsDroit ? ayantsDroitMap : undefined,
      countsByType,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des assurés :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération des assurés.' },
      { status: 500 }
    );
  }
}

// ─── POST : Créer un assuré ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      societeId, nom, prenom, nSS, matricule, typeBeneficiaire,
      assurePrincipalId, codeFamille, dateNaissance, sexe,
      dateEffet, bareme, telephone, email, adresse, actif,
    } = body;

    // Validations
    if (!societeId || !nom) {
      return NextResponse.json(
        { erreur: 'La société et le nom sont obligatoires.' },
        { status: 400 }
      );
    }

    // Valider le type de bénéficiaire
    const validTypes = ['ASSURE', 'CONJOINT', 'ENFANT'];
    const tType = typeBeneficiaire || 'ASSURE';
    if (!validTypes.includes(tType)) {
      return NextResponse.json(
        { erreur: `Type de bénéficiaire invalide. Valeurs autorisées : ${validTypes.join(', ')}` },
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

    // Vérifier l'unicité du matricule
    if (matricule) {
      const existingMat = await db.assure.findFirst({ where: { matricule } });
      if (existingMat) {
        return NextResponse.json(
          { erreur: `Un assuré avec le matricule "${matricule}" existe déjà (${existingMat.prenom ? existingMat.prenom + ' ' : ''}${existingMat.nom}).` },
          { status: 409 }
        );
      }
    }

    // Vérifier l'assuré principal si c'est un ayant droit
    if (tType !== 'ASSURE' && assurePrincipalId) {
      const principal = await db.assure.findUnique({ where: { id: assurePrincipalId } });
      if (!principal) {
        return NextResponse.json(
          { erreur: 'Assuré principal introuvable.' },
          { status: 404 }
        );
      }
      if (principal.typeBeneficiaire !== 'ASSURE') {
        return NextResponse.json(
          { erreur: 'L\'assuré référencé n\'est pas un assuré principal.' },
          { status: 400 }
        );
      }
    }

    const assure = await db.assure.create({
      data: {
        societeId,
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        nSS: nSS ? nSS.trim() : null,
        matricule: matricule ? matricule.trim() : null,
        typeBeneficiaire: tType,
        assurePrincipalId: tType !== 'ASSURE' ? (assurePrincipalId || null) : null,
        codeFamille: codeFamille ? String(codeFamille).trim() : null,
        dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
        sexe: sexe || null,
        dateEffet: dateEffet ? new Date(dateEffet) : null,
        bareme: bareme !== undefined && bareme !== null ? parseFloat(bareme) : null,
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
        { erreur: 'Un assuré avec ces informations existe déjà (NSS, matricule ou email dupliqué).' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création de l\'assuré.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Modifier un assuré ─────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      id, nom, prenom, nSS, matricule, typeBeneficiaire,
      assurePrincipalId, codeFamille, dateNaissance, sexe,
      dateEffet, bareme, telephone, email, adresse, societeId, actif,
    } = body;

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

    // Vérifier unicité matricule si changé
    if (matricule && matricule !== existing.matricule) {
      const existingMat = await db.assure.findFirst({ where: { matricule } });
      if (existingMat) {
        return NextResponse.json(
          { erreur: `Un assuré avec le matricule "${matricule}" existe déjà.` },
          { status: 409 }
        );
      }
    }

    // Vérifier la société si changée
    if (societeId && societeId !== existing.societeId) {
      const societe = await db.societe.findUnique({ where: { id: societeId } });
      if (!societe) {
        return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (nom) updateData.nom = nom.trim();
    if (prenom !== undefined) updateData.prenom = prenom ? prenom.trim() : null;
    if (nSS !== undefined) updateData.nSS = nSS ? nSS.trim() : null;
    if (matricule !== undefined) updateData.matricule = matricule ? matricule.trim() : null;
    if (typeBeneficiaire !== undefined) updateData.typeBeneficiaire = typeBeneficiaire;
    if (assurePrincipalId !== undefined) updateData.assurePrincipalId = assurePrincipalId || null;
    if (codeFamille !== undefined) updateData.codeFamille = codeFamille ? String(codeFamille).trim() : null;
    if (dateNaissance !== undefined) updateData.dateNaissance = dateNaissance ? new Date(dateNaissance) : null;
    if (sexe !== undefined) updateData.sexe = sexe || null;
    if (dateEffet !== undefined) updateData.dateEffet = dateEffet ? new Date(dateEffet) : null;
    if (bareme !== undefined) updateData.bareme = bareme !== null ? parseFloat(bareme) : null;
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

// ─── DELETE : Supprimer un assuré ─────────────────────────────────────────────

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

    // Vérifier si c'est un assuré principal avec des ayants droit
    if (assure.typeBeneficiaire === 'ASSURE') {
      const ayantsDroitCount = await db.assure.count({
        where: { assurePrincipalId: id },
      });
      if (ayantsDroitCount > 0) {
        return NextResponse.json(
          { erreur: `Impossible de supprimer cet assuré principal : ${ayantsDroitCount} ayant(s) droit y sont rattaché(s). Supprimez d'abord les ayants droit.` },
          { status: 409 }
        );
      }
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
