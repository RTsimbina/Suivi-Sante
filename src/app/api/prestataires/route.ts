import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { prestataireCreateSchema, prestataireUpdateSchema } from '@/lib/validation';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { Prisma, type Prestataire } from '@prisma/client';
import {
  formaterMessageDoublons,
  construireMetadonneesException,
  resoudreDoublons,
  normaliserNom,
  type ConflitDoublon,
} from '@/lib/prestataire-doublons';
import {
  VERROU_UNICITE_PRESTATAIRES,
  verifierDoublonsEnBase,
} from '@/lib/prestataire-service';

// ─── Erreur de contrôle métier (doublons / exception) ───────────────────────

class DoublonErreur extends Error {
  constructor(
    public status: number,
    public payload: Record<string, unknown>
  ) {
    super('doublon');
  }
}

/** Détection d'une violation d'unicité côté base (index partiels appliqués) */
function estViolationUnique(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// ─── Traçabilité : descriptif des champs modifiables de la fiche prestataire ──
// Chaque champ est journalisé individuellement dans le Journal d'Audit des
// Paramétrages avec son libellé lisible, l'ancienne et la nouvelle valeur
// (exigence de traçabilité par champ, ex. « Champ : Téléphone »).

type ValeurChamp = string | boolean | null;

interface DescriptifChamp {
  cle: keyof Prestataire & string;
  libelle: string;
  /** Normalisation pour comparaison (ex. insensible à la casse des identifiants). */
  egale?: (a: ValeurChamp, b: ValeurChamp) => boolean;
  /** Rendu de la valeur dans le journal (ex. Actif/Inactif pour le booléen). */
  formatter?: (v: ValeurChamp) => string | null;
}

const identiqueSansSeparateurs = (a: ValeurChamp, b: ValeurChamp) =>
  String(a ?? '').replace(/[\s.-]/g, '').toUpperCase() ===
  String(b ?? '').replace(/[\s.-]/g, '').toUpperCase();

const identiqueSansCasse = (a: ValeurChamp, b: ValeurChamp) =>
  String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

const CHAMPS_FICHE_PRESTATAIRE: DescriptifChamp[] = [
  { cle: 'nom', libelle: 'Nom / Raison sociale' },
  { cle: 'code', libelle: 'Code prestataire', egale: identiqueSansCasse },
  { cle: 'type', libelle: 'Type / Catégorie' },
  { cle: 'statutJuridique', libelle: 'Statut juridique' },
  { cle: 'statut', libelle: 'Statut conventionnel' },
  { cle: 'nif', libelle: 'NIF', egale: identiqueSansSeparateurs },
  { cle: 'stat', libelle: 'Num STAT', egale: identiqueSansSeparateurs },
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'email', libelle: 'Adresse e-mail', egale: identiqueSansCasse },
  { cle: 'adresse', libelle: 'Adresse' },
  { cle: 'rib', libelle: 'RIB / Coordonnées bancaires', egale: identiqueSansSeparateurs },
  { cle: 'iban', libelle: 'IBAN', egale: identiqueSansCasse },
  {
    cle: 'actif',
    libelle: 'Compte actif',
    formatter: (v) => (v === true ? 'Actif' : v === false ? 'Inactif' : null),
  },
];

// ─── GET : Lister tous les prestataires ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';
    const statutJuridique = searchParams.get('statutJuridique') || '';
    const societeId = searchParams.get('societeId') || '';
    const groupeId = searchParams.get('groupeId') || '';
    const actifParam = searchParams.get('actif') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {
      ...(type ? { type } : {}),
      ...(statutJuridique ? { statutJuridique } : {}),
      ...(groupeId ? { groupePrestataireId: groupeId } : {}),
      ...(societeId ? { societes: { some: { societeId } } } : {}),
      ...(actifParam === 'true' ? { actif: true } : {}),
      ...(actifParam === 'false' ? { actif: false } : {}),
      ...(search
        ? {
            OR: [
              { nom: { contains: search } },
              { nomNormalise: { contains: search.toLowerCase() } },
              { code: { contains: search.toUpperCase() } },
              { nif: { contains: search.toUpperCase() } },
              { stat: { contains: search } },
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
          groupePrestataire: { select: { id: true, nom: true } },
          societes: { select: { societe: { select: { id: true, nom: true } }, actif: true } },
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

// ─── POST : Créer un prestataire (Administrateur / Service Technique) ──────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (nom, type ∈ enum, formats NIF/STAT/RIB/IBAN/code) ─
    const parsed = await parseJsonBody(request, prestataireCreateSchema, { exposerBrut: true });
    if (!parsed.success) return parsed.response;
    const donnees = parsed.data;

    // ─── Demande d'exception de doublon (hors schéma — réservée Administrateur) ─
    const bodyException = (parsed.raw ?? {}) as Record<string, unknown>;
    const exceptionDemandee = Boolean(bodyException.exceptionDoublon);
    const motifException =
      typeof bodyException.motifException === 'string' ? bodyException.motifException : null;

    // ─── Utilisateur pour la traçabilité (nom, id, rôle depuis le JWT) ──────
    const { nom: userName, id: userId, role: userRole } = await getUserInfoFromRequest(request);

    const operationId = crypto.randomUUID();
    const nomNormalise = donnees.nom ? normaliserNom(donnees.nom) : null;

    // ─── Transaction verrouillée : détection → décision → écriture ──────────
    let prestataireCree: Prestataire;
    let conflitsException: ConflitDoublon[] = [];

    try {
      const resultat = await db.$transaction(async (tx) => {
        await tx.$executeRaw(VERROU_UNICITE_PRESTATAIRES);

        // Détection ciblée : uniquement les lignes partageant une valeur unique
        const conflits = await verifierDoublonsEnBase(tx, { ...donnees, nomNormalise });

        const decision = resoudreDoublons({
          conflits,
          roleDemandeur: userRole ?? 'inconnu',
          exceptionDemandee,
          motif: motifException,
          exceptionsPreexistantes: [],
        });

        if (decision.action === 'BLOQUER_409') {
          throw new DoublonErreur(409, {
            erreur:
              decision.raison === 'MOTIF_REQUIS'
                ? 'Un motif est requis pour valider une exception de doublon (ex : appartenance au même groupe de prestataires).'
                : formaterMessageDoublons(decision.conflits),
            doublons: decision.conflits.map((c) => ({
              champ: c.champ,
              valeur: c.valeur,
              prestataireExistantId: c.prestataireExistantId,
              prestataireExistantNom: c.prestataireExistantNom,
              prestataireExistantCode: c.prestataireExistantCode,
            })),
          });
        }
        if (decision.action === 'REFUSER_403') {
          throw new DoublonErreur(403, {
            erreur:
              "Exception de doublon refusée : seul un Administrateur peut valider un enregistrement malgré un doublon.",
            doublons: decision.conflits.map((c) => ({ champ: c.champ, valeur: c.valeur })),
          });
        }

        const exceptionValidee = decision.action === 'EXCEPTION_AUTORISEE';

        // Vérifier le groupe référencé avant toute écriture
        if (donnees.groupePrestataireId) {
          const groupe = await tx.groupePrestataire.findUnique({
            where: { id: donnees.groupePrestataireId },
          });
          if (!groupe) {
            throw new DoublonErreur(400, { erreur: 'Groupe de prestataires introuvable.' });
          }
        }

        const prestataire = await tx.prestataire.create({
          data: {
            nom: donnees.nom,
            nomNormalise,
            type: donnees.type,
            code: donnees.code ?? null,
            telephone: donnees.telephone ?? null,
            email: donnees.email ? donnees.email.toLowerCase() : null,
            adresse: donnees.adresse ?? null,
            nif: donnees.nif ?? null,
            stat: donnees.stat ?? null,
            statutJuridique: donnees.statutJuridique ?? null,
            statut: donnees.statut ?? null,
            rib: donnees.rib ?? null,
            iban: donnees.iban ?? null,
            actif: donnees.actif !== false,
            groupePrestataireId: donnees.groupePrestataireId ?? null,
            exceptionValidee,
          },
          include: { _count: { select: { dossiers: true } } },
        });

        // Trace structurelle de chaque dérogation validée (couverture des
        // modifications ultérieures + traçabilité indépendante du journal)
        if (exceptionValidee) {
          await tx.exceptionDoublon.createMany({
            data: decision.conflits.map((c) => ({
              prestataireId: prestataire.id,
              prestataireExistantId: c.prestataireExistantId,
              prestataireExistantNom: c.prestataireExistantNom,
              champ: c.champ,
              valeur: c.valeur,
              motif: decision.motif,
              contexte: 'CREATION',
              operationId,
              valideParNom: userName,
              valideParId: userId,
              valideParRole: userRole ?? 'inconnu',
            })),
          });
        }

        return { prestataire, decision };
      });

      prestataireCree = resultat.prestataire;
      if (resultat.decision.action === 'EXCEPTION_AUTORISEE') {
        conflitsException = resultat.decision.conflits;
      }
    } catch (error) {
      if (error instanceof DoublonErreur) throw error;
      if (estViolationUnique(error)) {
        return NextResponse.json(
          {
            erreur:
              'Un prestataire avec des informations identiques existe déjà (contrainte base de données).',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // ─── Journal d'Audit : trace de CREATION (regroupée par operationId) ────
    await logParametreChange({
      entite: 'Prestataire',
      entiteId: prestataireCree.id,
      champ: 'CREATION',
      action: 'CREATION',
      ancienneValeur: null,
      nouvelleValeur: prestataireCree.nom,
      modifiePar: userName,
      modifieParId: userId,
      roleUtilisateur: userRole,
      operationId,
      objet: `${prestataireCree.nom} (${prestataireCree.type})`,
      request,
    });

    // ─── Traçabilité des exceptions validées : une entrée CRITIQUE par doublon ─
    for (const conflit of conflitsException) {
      await logParametreChange({
        entite: 'Prestataire',
        entiteId: prestataireCree.id,
        champ: 'EXCEPTION_DOUBLON',
        action: 'EXCEPTION_DOUBLON',
        niveau: 'CRITIQUE',
        ancienneValeur: conflit.valeur,
        nouvelleValeur: conflit.valeur,
        modifiePar: userName,
        modifieParId: userId,
        roleUtilisateur: userRole,
        operationId,
        objet: `${prestataireCree.nom} (${prestataireCree.type})`,
        motif: motifException ?? undefined,
        metadonnees: construireMetadonneesException(conflit, {
          prestataireId: prestataireCree.id,
          prestataireNom: prestataireCree.nom,
          motif: motifException ?? '',
          valideParNom: userName,
          valideParId: userId,
          valideParRole: userRole ?? 'inconnu',
          dateValidation: new Date(),
          groupeId: prestataireCree.groupePrestataireId,
          groupeNom: null,
        }),
        request,
      });
    }

    return NextResponse.json(
      {
        message:
          conflitsException.length > 0
            ? "Prestataire créé avec une exception de doublon validée par un Administrateur (tracée dans le Journal d'Audit)."
            : 'Prestataire créé avec succès.',
        prestataire: { id: prestataireCree.id, nom: prestataireCree.nom },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof DoublonErreur) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    console.error('Erreur lors de la création du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la création du prestataire.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Modifier un prestataire (Administrateur / Service Technique) ────────

export async function PUT(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (whitelist, enum type, formats) ─────────
    const parsed = await parseJsonBody(request, prestataireUpdateSchema, { exposerBrut: true });
    if (!parsed.success) return parsed.response;
    const donnees = parsed.data;
    const id = donnees.id;

    const bodyException = (parsed.raw ?? {}) as Record<string, unknown>;
    const exceptionDemandee = Boolean(bodyException.exceptionDoublon);
    const motifException =
      typeof bodyException.motifException === 'string' ? bodyException.motifException : null;

    // ─── Utilisateur pour la traçabilité (nom, id, rôle depuis le JWT) ──────
    const { nom: userName, id: userId, role: userRoleOptional } = await getUserInfoFromRequest(request);
    const userRole = userRoleOptional ?? 'inconnu';

    const operationId = crypto.randomUUID();

    // ─── Transaction verrouillée : contrôle → décision → écriture ───────────
    let nomFinal = '';
    let conflitsException: ConflitDoublon[] = [];
    let updated: Prestataire;

    try {
      const resultat = await db.$transaction(async (tx) => {
        await tx.$executeRaw(VERROU_UNICITE_PRESTATAIRES);

        const existing = await tx.prestataire.findUnique({
          where: { id },
          include: { exceptionsDoublon: { select: { champ: true, valeur: true } } },
        });
        if (!existing) {
          throw new DoublonErreur(404, { erreur: 'Prestataire introuvable.' });
        }

        // Valeurs candidates : seuls les champs fournis changent
        const valeurs: Record<string, unknown> = {};
        if (donnees.nom !== undefined) valeurs.nom = donnees.nom;
        if (donnees.type !== undefined) valeurs.type = donnees.type;
        if (donnees.code !== undefined) valeurs.code = donnees.code;
        if (donnees.telephone !== undefined) valeurs.telephone = donnees.telephone ?? null;
        if (donnees.email !== undefined) valeurs.email = donnees.email ? donnees.email.toLowerCase() : null;
        if (donnees.adresse !== undefined) valeurs.adresse = donnees.adresse ?? null;
        if (donnees.nif !== undefined) valeurs.nif = donnees.nif ?? null;
        if (donnees.stat !== undefined) valeurs.stat = donnees.stat ?? null;
        if (donnees.statutJuridique !== undefined) valeurs.statutJuridique = donnees.statutJuridique ?? null;
        if (donnees.statut !== undefined) valeurs.statut = donnees.statut ?? null;
        if (donnees.rib !== undefined) valeurs.rib = donnees.rib ?? null;
        if (donnees.iban !== undefined) valeurs.iban = donnees.iban ?? null;
        if (donnees.groupePrestataireId !== undefined) {
          valeurs.groupePrestataireId = donnees.groupePrestataireId ?? null;
        }
        if (donnees.actif !== undefined) valeurs.actif = donnees.actif;

        // Le nom change → recalculer nomNormalise
        const nomFutur = (valeurs.nom as string) ?? existing.nom;
        if (valeurs.nom !== undefined) valeurs.nomNormalise = normaliserNom(nomFutur);

        // Détection sur l'état FUTUR de la fiche (hors elle-même)
        const donneesFutures = {
          nom: nomFutur,
          nomNormalise:
            (valeurs.nomNormalise as string | null) ??
            existing.nomNormalise ??
            normaliserNom(nomFutur),
          nif: (valeurs.nif as string | null | undefined) !== undefined ? (valeurs.nif as string | null) : existing.nif,
          stat: (valeurs.stat as string | null | undefined) !== undefined ? (valeurs.stat as string | null) : existing.stat,
          email: (valeurs.email as string | null | undefined) !== undefined ? (valeurs.email as string | null) : existing.email,
          code: (valeurs.code as string | null | undefined) !== undefined ? (valeurs.code as string | null) : existing.code,
        };

        const conflits = await verifierDoublonsEnBase(tx, donneesFutures, id);

        const decision = resoudreDoublons({
          conflits,
          roleDemandeur: userRole ?? 'inconnu',
          exceptionDemandee,
          motif: motifException,
          exceptionsPreexistantes: existing.exceptionsDoublon,
        });

        if (decision.action === 'BLOQUER_409') {
          throw new DoublonErreur(409, {
            erreur:
              decision.raison === 'MOTIF_REQUIS'
                ? 'Un motif est requis pour valider une exception de doublon (ex : appartenance au même groupe de prestataires).'
                : formaterMessageDoublons(decision.conflits),
            doublons: decision.conflits.map((c) => ({
              champ: c.champ,
              valeur: c.valeur,
              prestataireExistantId: c.prestataireExistantId,
              prestataireExistantNom: c.prestataireExistantNom,
              prestataireExistantCode: c.prestataireExistantCode,
            })),
          });
        }
        if (decision.action === 'REFUSER_403') {
          throw new DoublonErreur(403, {
            erreur:
              "Exception de doublon refusée : seul un Administrateur peut valider un enregistrement malgré un doublon.",
            doublons: decision.conflits.map((c) => ({ champ: c.champ, valeur: c.valeur })),
          });
        }

        // Vérifier le groupe référencé avant écriture
        if (valeurs.groupePrestataireId) {
          const groupe = await tx.groupePrestataire.findUnique({
            where: { id: String(valeurs.groupePrestataireId) },
          });
          if (!groupe) {
            throw new DoublonErreur(400, { erreur: 'Groupe de prestataires introuvable.' });
          }
        }

        const exceptionValidee =
          existing.exceptionValidee || decision.action === 'EXCEPTION_AUTORISEE';

        const updatedTx = await tx.prestataire.update({
          where: { id },
          data: { ...valeurs, exceptionValidee } as Prisma.PrestataireUpdateInput,
          include: { _count: { select: { dossiers: true } } },
        });

        // Tracer structurellement les NOUVELLES exceptions validées
        if (decision.action === 'EXCEPTION_AUTORISEE' && decision.conflits.length > 0) {
          await tx.exceptionDoublon.createMany({
            data: decision.conflits.map((c) => ({
              prestataireId: id,
              prestataireExistantId: c.prestataireExistantId,
              prestataireExistantNom: c.prestataireExistantNom,
              champ: c.champ,
              valeur: c.valeur,
              motif: decision.motif,
              contexte: 'MODIFICATION',
              operationId,
              valideParNom: userName,
              valideParId: userId,
              valideParRole: userRole ?? 'inconnu',
            })),
          });
        }

        return { existing, updatedTx, decision, valeurs };
      });

      const existing = resultat.existing;
      updated = resultat.updatedTx;
      if (resultat.decision.action === 'EXCEPTION_AUTORISEE') {
        conflitsException = resultat.decision.conflits;
      }
      nomFinal = updated.nom;

      // ─── Audit champ-par-champ (avec operationId partagé) ────────────────
      // Comparaison ancien état vs valeurs candidates (ce qui a été écrit).
      const futur: Record<string, unknown> = { ...existing, ...resultat.valeurs };
      for (const champ of CHAMPS_FICHE_PRESTATAIRE) {
        const ancienne = (existing[champ.cle] as ValeurChamp) ?? null;
        const nouvelle = (futur[champ.cle] as ValeurChamp) ?? null;
        const changeDetecte = champ.egale ? !champ.egale(ancienne, nouvelle) : ancienne !== nouvelle;
        if (!changeDetecte) continue;

        await logParametreChange({
          entite: 'Prestataire',
          entiteId: id,
          champ: champ.libelle,
          ancienneValeur: champ.formatter ? champ.formatter(ancienne) : ancienne,
          nouvelleValeur: champ.formatter ? champ.formatter(nouvelle) : nouvelle,
          modifiePar: userName,
          modifieParId: userId,
          roleUtilisateur: userRole,
          operationId,
          objet: nomFinal,
          request,
        });
      }
    } catch (error) {
      if (error instanceof DoublonErreur) throw error;
      if (estViolationUnique(error)) {
        return NextResponse.json(
          {
            erreur:
              'Un prestataire avec des informations identiques existe déjà (contrainte base de données).',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // ─── Traçabilité des exceptions validées lors de cette modification ─────
    if (conflitsException.length > 0) {
      for (const conflit of conflitsException) {
        await logParametreChange({
          entite: 'Prestataire',
          entiteId: id,
          champ: 'EXCEPTION_DOUBLON',
          action: 'EXCEPTION_DOUBLON',
          niveau: 'CRITIQUE',
          ancienneValeur: conflit.valeur,
          nouvelleValeur: conflit.valeur,
          modifiePar: userName,
          modifieParId: userId,
          roleUtilisateur: userRole,
          operationId,
          objet: nomFinal,
          motif: motifException ?? undefined,
          metadonnees: construireMetadonneesException(conflit, {
            prestataireId: id,
            prestataireNom: nomFinal,
            motif: motifException ?? '',
            valideParNom: userName,
            valideParId: userId,
            valideParRole: userRole ?? 'inconnu',
            dateValidation: new Date(),
            groupeId: (updated.groupePrestataireId as string | null) ?? null,
            groupeNom: null,
          }),
          request,
        });
      }
    }

    return NextResponse.json({ message: 'Prestataire mis à jour avec succès.', prestataire: updated });
  } catch (error) {
    if (error instanceof DoublonErreur) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    console.error('Erreur lors de la mise à jour du prestataire :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la mise à jour du prestataire.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer un prestataire (Administrateur / Service Technique) ────

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

    // ─── Journal d'Audit : trace de SUPPRESSION AVANT la suppression ────────
    const { nom: userName, id: userId, role: userRole } = await getUserInfoFromRequest(request);
    const operationId = crypto.randomUUID();
    await logParametreChange({
      entite: 'Prestataire',
      entiteId: id,
      champ: 'SUPPRESSION',
      action: 'SUPPRESSION',
      ancienneValeur: prestataire.nom,
      nouvelleValeur: null,
      modifiePar: userName,
      modifieParId: userId,
      roleUtilisateur: userRole,
      operationId,
      objet: `${prestataire.nom} (${prestataire.type})`,
      request,
    });

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
