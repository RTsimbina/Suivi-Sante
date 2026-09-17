import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal } from '@/lib/money';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import { getParentType, getPrestationLabel, PARENT_TYPES, ALL_SOUS_TYPES } from '@/lib/prestations';
import { STATUT_DOSSIER_LABELS } from '@/lib/portail-prestataire';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';
import type { Prisma } from '@prisma/client';

// ─── GET : Actes médicaux réalisés par le prestataire connecté ─────────────
// Vue médicale : tous les dossiers (actes) rattachés au prestataire, avec
// l'assuré concerné et la société cliente. L'isolation est garantie côté
// serveur : le where est TOUJOURS contraint par le prestataireId résolu
// depuis le JWT — les filtres du navigateur (societeId, assureId, type…)
// ne peuvent que RESTREINDRE ce périmètre, jamais l'élargir.

const LIMITES = { min: 1, max: 50, defaut: 15 };

export async function GET(request: NextRequest) {
  try {
    const resolution = await resoudreIdentitePortailPrestataire(request);
    if (!resolution.ok) return resolution.response;
    if (!estPrestataire(resolution.identite)) {
      return NextResponse.json(
        { erreur: 'Mode administrateur : utilisez un compte prestataire.' },
        { status: 403 }
      );
    }
    const prestataireId = resolution.identite.prestataireId;

    const params = new URL(request.url).searchParams;

    // Filtre de période commun (Dossier.dateReception), après le périmètre.
    const plage = plageDepuisParams(params);

    const where: Prisma.DossierWhereInput = { prestataireId };
    Object.assign(where, filtreDateChamp('dateReception', plage));

    // ─── Filtres navigateur (restrictifs uniquement) ────────────────────────
    const societeId = params.get('societeId') || '';
    if (societeId) where.societeId = societeId;

    const assureId = params.get('assureId') || '';
    if (assureId) where.assureId = assureId;

    // Type d'acte : parent (ex. CONSULTATION) ou sous-type exact.
    const typeActe = params.get('typeActe') || '';
    if (typeActe) {
      if ((PARENT_TYPES as readonly string[]).includes(typeActe)) {
        const sousTypes = ALL_SOUS_TYPES.filter(st => getParentType(st) === typeActe);
        where.typeDossier = sousTypes.length ? { in: sousTypes } : typeActe;
      } else {
        where.typeDossier = typeActe;
      }
    }

    // Statut du dossier (workflow plateforme).
    const statut = params.get('statut') || '';
    if (statut) where.statut = statut;

    // Recherche libre : n° de dossier ou bénéficiaire.
    const search = (params.get('search') || '').trim();
    if (search) {
      where.OR = [
        { numeroDossier: { contains: search, mode: 'insensitive' } },
        { beneficiaire: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ─── Pagination serveur ────────────────────────────────────────────────
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limitBrute = parseInt(params.get('limit') || String(LIMITES.defaut), 10) || LIMITES.defaut;
    const limit = Math.min(LIMITES.max, Math.max(LIMITES.min, limitBrute));

    const [total, actes] = await Promise.all([
      db.dossier.count({ where }),
      db.dossier.findMany({
        where,
        include: {
          societe: { select: { id: true, nom: true } },
          assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
        },
        orderBy: { dateReception: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      actes: actes.map(d => ({
        id: d.id,
        numeroDossier: d.numeroDossier,
        typeDossier: d.typeDossier,
        typeLabel: getPrestationLabel(d.typeDossier),
        statut: d.statut,
        statutLabel: STATUT_DOSSIER_LABELS[d.statut] ?? d.statut,
        beneficiaire: d.beneficiaire,
        dateReception: d.dateReception,
        dateSoins: d.dateSoins,
        montantReclame: enNombre(versDecimal(d.montantReclame)) ?? 0,
        montantValide: enNombre(versDecimal(d.montantValide)),
        montantPaye: enNombre(versDecimal(d.montantPaye)),
        partPatient: enNombre(versDecimal(d.partPatient)),
        motifRejet: d.motifRejet,
        societe: d.societe,
        assure: d.assure ? {
          nom: d.assure.nom,
          prenom: d.assure.prenom,
          typeBeneficiaire: d.assure.typeBeneficiaire,
        } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      filtres: {
        typesActe: PARENT_TYPES.map(p => ({ value: p, label: getPrestationLabel(p) })),
        statuts: Object.entries(STATUT_DOSSIER_LABELS).map(([value, label]) => ({ value, label })),
      },
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur actes :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des actes.' },
      { status: 500 }
    );
  }
}
