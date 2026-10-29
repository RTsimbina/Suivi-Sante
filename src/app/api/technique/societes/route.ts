import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { messageErreurBase } from '@/lib/erreur-migration';
import { parseJsonBody } from '@/lib/validation/parse';
import { societeTechniqueCreateSchema } from '@/lib/validation';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import {
  detecterConflitNom,
  detecterConflitLiaisonEmail,
  messageConflitNom,
  normaliserNom,
} from '@/lib/societe-service';

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
      { erreur: messageErreurBase(error, 'Erreur serveur lors de la récupération des sociétés.') },
      { status: 500 }
    );
  }
}

// ─── POST : Créer une société avec barèmes optionnels ─────────────────────────
//
// ─── RÈGLES MÉTIER (spécifications Sociétés clientes — figées par tests) ────
//   SPEC-1 : doublon de nom détecté AVANT écriture, insensible à la casse,
//            aux accents et aux séparateurs (nom normalisé) → 409 avec la
//            fiche en conflit. L'index unique partiel en base
//            (Societe_nomNormalise_unique) est le dernier rempart.
//   SPEC-6 : un e-mail de contact principal ne peut lier qu'UNE société
//            (garde d'ambiguïté de la résolution CONTACT_ENTREPRISE).
//   SPEC-3 : la création est auditée (CREATION) comme toute écriture de
//            référentiel — rôle figé + operationId via logParametreChange.

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);

    // ─── Validation Zod centralisée (nom requis, NIF / téléphone / e-mails
    //     validés, barèmes : enum prestation, taux 0-100, plafond > 0) ──────
    const parsed = await parseJsonBody(request, societeTechniqueCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, adresse, telephone, email, nif, contactPrincipal, emailContactPrincipal, actif, baremes } = parsed.data;

    // ─── SPEC-1 : unicité du nom (insensible casse / accents / séparateurs) ─
    const existantes = await db.societe.findMany({
      select: { id: true, nom: true, nomNormalise: true, emailContactPrincipal: true },
    });
    const conflitNom = detecterConflitNom(nom, existantes);
    if (conflitNom) {
      return NextResponse.json({ erreur: messageConflitNom(conflitNom) }, { status: 409 });
    }

    // ─── SPEC-6 : e-mail de contact principal non ambigu ────────────────────
    if (emailContactPrincipal) {
      const conflitLiaison = detecterConflitLiaisonEmail(emailContactPrincipal, existantes);
      if (conflitLiaison) {
        return NextResponse.json(
          {
            erreur: `Cet e-mail de contact principal est déjà rattaché à la société « ${conflitLiaison.nom} » — un e-mail de contact ne peut lier qu'une seule société (liaison du portail entreprise).`,
          },
          { status: 409 }
        );
      }
    }

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

    // Créer la société avec ses barèmes (nom normalisé enregistré avec la
    // fiche — cohérent avec la colonne remplie par le backfill de migration)
    const societe = await db.societe.create({
      data: {
        nom,
        nomNormalise: normaliserNom(nom) || null,
        actif: actif ?? true,
        ...(adresse ? { adresse } : {}),
        ...(telephone ? { telephone } : {}),
        ...(email ? { email } : {}),
        ...(nif ? { nif } : {}),
        ...(contactPrincipal ? { contactPrincipal } : {}),
        ...(emailContactPrincipal ? { emailContactPrincipal } : {}),
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

    // ─── SPEC-3 : audit de la création ──────────────────────────────────────
    await logParametreChange({
      entite: 'Societe',
      entiteId: societe.id,
      champ: 'CREATION',
      ancienneValeur: null,
      nouvelleValeur: nom,
      modifiePar: userName,
      modifieParId: userId,
      objet: nom,
      societeId: societe.id,
      request,
    });

    return NextResponse.json(
      { message: 'Société créée avec succès.', societe },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur lors de la création de la société :', error);

    // Rempart dernier niveau : l'index unique partiel en base refuse tout
    // doublon qui aurait échappé à la détection applicative (course entre
    // deux créations simultanées).
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { erreur: 'Une société avec ce nom existe déjà (insensible à la casse et aux accents).' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création de la société.' },
      { status: 500 }
    );
  }
}