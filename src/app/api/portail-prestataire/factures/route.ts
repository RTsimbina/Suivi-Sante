import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal, sommer } from '@/lib/money';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import { getPrestationLabel } from '@/lib/prestations';
import {
  deriveStatutFacture,
  soldeFacture,
  STATUTS_FACTURE,
  STATUT_FACTURE_LABELS,
  type StatutFacture,
} from '@/lib/portail-prestataire';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';
import type { Prisma } from '@prisma/client';

// ─── GET : Factures / Règlements du prestataire connecté ───────────────────
// Vue financière : les dossiers de catégorie REGLEMENT_PRESTATAIRE du
// prestataire (règlement direct au prestataire — cf. CATEGORIES_DOSSIER).
// Chaque facture affiche : n° (référence dossier), date, société cliente,
// période, montant facturé (montantReclame), montant réglé (montantPaye),
// solde restant, statut du règlement (dérivé du workflow plateforme —
// voir portail-prestataire.ts) et date de règlement (datePaiement).
//
// Le statut étant DÉRIVÉ (statut dossier + montants), la requête applique
// d'abord les filtres SQL exacts (périmètre, période, société, n°, statut
// de workflow translatable), puis affine en mémoire sur le statut dérivé
// (jeu borné : LIMITE_FAITURES). Le périmètre reste contraint serveur.

const LIMITE_FACTURES = 2000;
const LIMITES_PAGE = { min: 1, max: 100, defaut: 20 };

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
    const plage = plageDepuisParams(params);

    const where: Prisma.DossierWhereInput = {
      prestataireId,
      categorieDossier: 'REGLEMENT_PRESTATAIRE',
    };
    Object.assign(where, filtreDateChamp('dateReception', plage));

    // Filtre société cliente (restrictif : un id étranger ne renvoie rien).
    const societeId = params.get('societeId') || '';
    if (societeId) where.societeId = societeId;

    // Filtre n° de facture (référence du dossier).
    const numero = (params.get('numero') || '').trim();
    if (numero) {
      where.numeroDossier = { contains: numero, mode: 'insensitive' };
    }

    const lignes = await db.dossier.findMany({
      where,
      include: { societe: { select: { id: true, nom: true } } },
      orderBy: { dateReception: 'desc' },
      take: LIMITE_FACTURES,
    });

    // Dérivation du statut de facture + filtre dérivé éventuel.
    const statutFiltre = (params.get('statutFacture') || '') as StatutFacture | '';
    const statutFiltreValide = STATUTS_FACTURE.includes(statutFiltre as StatutFacture)
      ? (statutFiltre as StatutFacture)
      : null;

    const derivees = lignes.map(l => ({
      brut: l,
      statutFacture: deriveStatutFacture(l),
    }));

    const filtrees = statutFiltreValide
      ? derivees.filter(d => d.statutFacture === statutFiltreValide)
      : derivees;

    // Totaux sur l'ensemble filtré (Decimal → précision monétaire).
    const totalFacture = sommer(filtrees.map(d => d.brut.montantReclame));
    const totalRegle = sommer(filtrees.map(d => d.brut.montantPaye));
    const totalSolde = sommer(filtrees.map(d => soldeFacture(d.brut)));

    // Pagination mémoire (après filtre dérivé).
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limitBrute = parseInt(params.get('limit') || String(LIMITES_PAGE.defaut), 10) || LIMITES_PAGE.defaut;
    const limit = Math.min(LIMITES_PAGE.max, Math.max(LIMITES_PAGE.min, limitBrute));
    const total = filtrees.length;
    const debut = (page - 1) * limit;

    return NextResponse.json({
      factures: filtrees.slice(debut, debut + limit).map(({ brut: l, statutFacture }) => ({
        id: l.id,
        numeroFacture: l.numeroDossier,
        date: l.dateReception,
        periode: periodeLabel(l.dateReception),
        societe: l.societe,
        typeLabel: getPrestationLabel(l.typeDossier),
        montantFacture: enNombre(versDecimal(l.montantReclame)) ?? 0,
        montantRegule: enNombre(versDecimal(l.montantPaye)) ?? 0,
        solde: enNombre(soldeFacture(l)) ?? 0,
        statutFacture,
        statutFactureLabel: STATUT_FACTURE_LABELS[statutFacture],
        statutDossier: l.statut,
        dateReglement: l.datePaiement,
        referenceReglement: l.referencePaiement,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totaux: {
        montantFacture: enNombre(totalFacture) ?? 0,
        montantRegule: enNombre(totalRegle) ?? 0,
        solde: enNombre(totalSolde) ?? 0,
      },
      statutsDisponibles: STATUTS_FACTURE.map(s => ({
        value: s,
        label: STATUT_FACTURE_LABELS[s],
      })),
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur factures :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des factures.' },
      { status: 500 }
    );
  }
}

/** Libellé de période (mois/année en français, fuseau plateforme). */
function periodeLabel(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Indian/Antananarivo',
  }).format(date);
}
