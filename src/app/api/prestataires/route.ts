import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { prestataireCreateSchema, prestataireUpdateSchema } from '@/lib/validation';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { Prisma, type Prestataire } from '@prisma/client';

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
  { cle: 'type', libelle: 'Type / Catégorie' },
  { cle: 'statutJuridique', libelle: 'Statut juridique' },
  { cle: 'statut', libelle: 'Statut conventionnel' },
  { cle: 'nif', libelle: 'NIF', egale: identiqueSansSeparateurs },
  { cle: 'stat', libelle: 'Num STAT', egale: identiqueSansSeparateurs },
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'email', libelle: 'Adresse e-mail', egale: identiqueSansCasse },
  { cle: 'adresse', libelle: 'Adresse' },
  { cle: 'rib', libelle: 'RIB / Coordonnées bancaires', egale: identiqueSansSeparateurs },
  {
    cle: 'actif',
    libelle: 'Compte actif',
    formatter: (v) => (v === true ? 'Actif' : v === false ? 'Inactif' : null),
  },
];

// ─── Doublons : normalisation + détection ────────────────────────────────────
// « Absence de doublons lorsque cela est applicable » : un nom normalisé
// (casse/accents/espaces), un e-mail, un NIF ou un Num STAT ne peuvent pas
// être partagés par deux prestataires actifs du référentiel.

function normaliserTexte(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normaliserIdentification(v: string | null | undefined): string | null {
  if (!v) return null;
  const compact = v.replace(/[\s.-]/g, '').toUpperCase();
  return compact || null;
}

/**
 * Cherche un doublon (nom normalisé, e-mail, NIF, Num STAT) parmi les
 * prestataires existants. Renvoie le message d'erreur français du premier
 * doublon trouvé, ou null si tout est unique. `idExclu` protège la mise à
 * jour (le prestataire lui-même n'est pas son propre doublon).
 */
async function trouverDoublon(
  data: {
    nom?: string;
    email?: string | null;
    nif?: string | null;
    stat?: string | null;
  },
  idExclu?: string
): Promise<string | null> {
  const prestataires = await db.prestataire.findMany({
    where: idExclu ? { id: { not: idExclu } } : undefined,
    select: { id: true, nom: true, email: true, nif: true, stat: true, actif: true },
  });

  const nomNouveau = data.nom ? normaliserTexte(data.nom) : null;
  const emailNouveau = data.email ? data.email.toLowerCase() : null;
  const nifNouveau = normaliserIdentification(data.nif);
  const statNouveau = normaliserIdentification(data.stat);

  for (const p of prestataires) {
    if (nomNouveau && normaliserTexte(p.nom) === nomNouveau) {
      return `Un prestataire portant ce nom existe déjà : « ${p.nom} ».`;
    }
    if (emailNouveau && p.email && p.email.toLowerCase() === emailNouveau) {
      return `L'adresse e-mail ${emailNouveau} est déjà utilisée par le prestataire « ${p.nom} ».`;
    }
    if (nifNouveau && normaliserIdentification(p.nif) === nifNouveau) {
      return `Le NIF ${data.nif} est déjà attribué au prestataire « ${p.nom} ».`;
    }
    if (statNouveau && normaliserIdentification(p.stat) === statNouveau) {
      return `Le Numéro STAT ${data.stat} est déjà attribué au prestataire « ${p.nom} ».`;
    }
  }
  return null;
}

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

    // ─── Validation Zod centralisée (nom, type ∈ enum, formats NIF/STAT/RIB) ─
    const parsed = await parseJsonBody(request, prestataireCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, type, telephone, email, adresse, nif, stat, statutJuridique, statut, rib, actif } = parsed.data;

    // ─── Doublons (nom normalisé, e-mail, NIF, Num STAT) ────────────────────
    const doublon = await trouverDoublon({ nom, email, nif, stat });
    if (doublon) {
      return NextResponse.json({ erreur: doublon }, { status: 409 });
    }

    // ─── Utilisateur pour la traçabilité (nom, id, rôle depuis le JWT) ──────
    const { nom: userName, id: userId, role: userRole } = await getUserInfoFromRequest(request);

    const prestataire = await db.prestataire.create({
      data: {
        nom,
        type,
        telephone: telephone ?? null,
        email: email ? email.toLowerCase() : null,
        adresse: adresse ?? null,
        nif: nif ?? null,
        stat: stat ?? null,
        statutJuridique: statutJuridique ?? null,
        statut: statut ?? null,
        rib: rib ?? null,
        actif: actif !== false,
      },
      include: {
        _count: { select: { dossiers: true } },
      },
    });

    // ─── Journal d'Audit des Paramétrages : trace de CREATION ───────────────
    // Enregistrée côté serveur uniquement ; le journal est immuable
    // (aucun endpoint de modification/suppression n'existe pour HistoriqueParametre).
    await logParametreChange({
      entite: 'Prestataire',
      entiteId: prestataire.id,
      champ: 'CREATION',
      ancienneValeur: null,
      nouvelleValeur: prestataire.nom,
      modifiePar: userName,
      modifieParId: userId,
      roleUtilisateur: userRole,
      objet: `${prestataire.nom} (${prestataire.type})`,
      request,
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

// ─── PUT : Modifier un prestataire (Admin + Service Technique) ─────────────────

export async function PUT(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (whitelist, enum type, formats) ─────────
    const parsed = await parseJsonBody(request, prestataireUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { id, nom, type, telephone, email, adresse, nif, stat, statutJuridique, statut, rib, actif } = parsed.data;

    const existing = await db.prestataire.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    // ─── Doublons, en excluant le prestataire modifié ───────────────────────
    const doublon = await trouverDoublon(
      {
        nom: nom ?? undefined,
        email: email !== undefined ? email : undefined,
        nif: nif !== undefined ? nif : undefined,
        stat: stat !== undefined ? stat : undefined,
      },
      id
    );
    if (doublon) {
      return NextResponse.json({ erreur: doublon }, { status: 409 });
    }

    // ─── Valeurs candidates : seuls les champs fournis changent ─────────────
    const valeurs: Prisma.PrestataireUpdateInput = {};
    if (nom !== undefined) valeurs.nom = nom;
    if (type !== undefined) valeurs.type = type;
    if (telephone !== undefined) valeurs.telephone = telephone ?? null;
    if (email !== undefined) valeurs.email = email ? email.toLowerCase() : null;
    if (adresse !== undefined) valeurs.adresse = adresse ?? null;
    if (nif !== undefined) valeurs.nif = nif ?? null;
    if (stat !== undefined) valeurs.stat = stat ?? null;
    if (statutJuridique !== undefined) valeurs.statutJuridique = statutJuridique ?? null;
    if (statut !== undefined) valeurs.statut = statut ?? null;
    if (rib !== undefined) valeurs.rib = rib ?? null;
    // Le schéma Zod garantit un booléen (avant : typeof vérifié ici)
    if (actif !== undefined) valeurs.actif = actif;

    // ─── Journal d'Audit des Paramétrages : une trace PAR champ modifié ─────
    // Chaque opération conserve date, utilisateur, rôle, ancienne/nouvelle
    // valeur, IP, navigateur, session — côté serveur uniquement (immuable).
    const { nom: userName, id: userId, role: userRole } = await getUserInfoFromRequest(request);

    for (const champ of CHAMPS_FICHE_PRESTATAIRE) {
      if (!(champ.cle in valeurs)) continue;
      const ancienne = (existing[champ.cle] as ValeurChamp) ?? null;
      const nouvelle = (valeurs[champ.cle as keyof Prisma.PrestataireUpdateInput] as ValeurChamp) ?? null;
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
        objet: (valeurs.nom as string) || existing.nom,
        request,
      });
    }

    // Rien à modifier → réponse sans écriture (et sans trace vide dans le journal)
    if (Object.keys(valeurs).length === 0) {
      return NextResponse.json({ message: 'Aucune modification détectée.', prestataire: existing });
    }

    const updated = await db.prestataire.update({
      where: { id },
      data: valeurs,
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

    // ─── Journal d'Audit : trace de SUPPRESSION AVANT la suppression ────────
    // (l'entité disparaît du référentiel, la trace conserve son identité)
    const { nom: userName, id: userId, role: userRole } = await getUserInfoFromRequest(request);
    await logParametreChange({
      entite: 'Prestataire',
      entiteId: id,
      champ: 'SUPPRESSION',
      ancienneValeur: prestataire.nom,
      nouvelleValeur: null,
      modifiePar: userName,
      modifieParId: userId,
      roleUtilisateur: userRole,
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
