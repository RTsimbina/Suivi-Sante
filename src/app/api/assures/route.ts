import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { assureCreateSchema, assureUpdateSchema } from '@/lib/validation';

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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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

    // ─── Validation Zod centralisée ─────────────────────────────────────────
    // typeBeneficiaire ∈ [ASSURE, CONJOINT, ENFANT], sexe ∈ [M, F],
    // barème ∈ [0, 1], dates valides — règles définies une seule fois.
    const parsed = await parseJsonBody(request, assureCreateSchema);
    if (!parsed.success) return parsed.response;
    const {
      societeId, nom, prenom, nSS, matricule, typeBeneficiaire,
      assurePrincipalId, codeFamille, dateNaissance, sexe,
      dateEffet, bareme, telephone, email, adresse, actif,
    } = parsed.data;

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
    if (typeBeneficiaire !== 'ASSURE' && assurePrincipalId) {
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
        nom,
        prenom: prenom ?? null,
        nSS: nSS ?? null,
        matricule: matricule ?? null,
        typeBeneficiaire,
        assurePrincipalId: typeBeneficiaire !== 'ASSURE' ? (assurePrincipalId ?? null) : null,
        codeFamille: codeFamille ?? null,
        dateNaissance: dateNaissance ?? null,
        sexe: sexe ?? null,
        dateEffet: dateEffet ?? null,
        bareme: bareme ?? null,
        telephone: telephone ?? null,
        email: email ? email.toLowerCase() : null,
        adresse: adresse ?? null,
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

    // ─── Validation Zod centralisée (whitelist + enums + dates + barème) ────
    const parsed = await parseJsonBody(request, assureUpdateSchema);
    if (!parsed.success) return parsed.response;
    const {
      id, nom, prenom, nSS, matricule, typeBeneficiaire,
      assurePrincipalId, codeFamille, dateNaissance, sexe,
      dateEffet, bareme, telephone, email, adresse, societeId, actif,
    } = parsed.data;

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

      // Vérifier si l'assuré a des dossiers — bloquer le changement de société
      // car les dossiers sont liés à la société et le plafond dépend de la société
      const dossierCount = await db.dossier.count({ where: { assureId: id } });
      if (dossierCount > 0) {
        return NextResponse.json(
          { erreur: `Impossible de changer la société : ${dossierCount} dossier(s) sont rattachés à cet assuré. Les dossiers doivent être réassignés manuellement avant tout changement de société.` },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (nom !== undefined) updateData.nom = nom;
    if (prenom !== undefined) updateData.prenom = prenom ?? null;
    if (nSS !== undefined) updateData.nSS = nSS ?? null;
    if (matricule !== undefined) updateData.matricule = matricule ?? null;
    // Le schéma Zod garantit typeBeneficiaire ∈ [ASSURE, CONJOINT, ENFANT]
    if (typeBeneficiaire !== undefined) {
      updateData.typeBeneficiaire = typeBeneficiaire;
    }
    if (assurePrincipalId !== undefined) {
      if (assurePrincipalId) {
        const principal = await db.assure.findUnique({ where: { id: assurePrincipalId } });
        if (!principal) {
          return NextResponse.json({ erreur: 'Assuré principal introuvable.' }, { status: 404 });
        }
        if (principal.typeBeneficiaire !== 'ASSURE') {
          return NextResponse.json({ erreur: "L'assuré référencé n'est pas un assuré principal." }, { status: 400 });
        }
        if (principal.societeId !== (existing.societeId)) {
          return NextResponse.json({ erreur: "L'assuré principal n'appartient pas à la même société." }, { status: 400 });
        }
      }
      updateData.assurePrincipalId = assurePrincipalId || null;
    }
    if (codeFamille !== undefined) updateData.codeFamille = codeFamille ?? null;
    if (dateNaissance !== undefined) updateData.dateNaissance = dateNaissance ?? null;
    if (sexe !== undefined) updateData.sexe = sexe ?? null;
    if (dateEffet !== undefined) updateData.dateEffet = dateEffet ?? null;
    if (bareme !== undefined) updateData.bareme = bareme ?? null;
    if (telephone !== undefined) updateData.telephone = telephone ?? null;
    if (email !== undefined) updateData.email = email ? email.toLowerCase() : null;
    if (adresse !== undefined) updateData.adresse = adresse ?? null;
    if (societeId !== undefined) updateData.societeId = societeId;
    // Le schéma Zod garantit un booléen
    if (actif !== undefined) updateData.actif = actif;

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
