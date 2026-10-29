import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal } from '@/lib/money';
import { plageDepuisParams } from '@/lib/periodes';
import { getPrestationLabel } from '@/lib/prestations';
import {
  STATUTS_FACTURE,
  STATUT_FACTURE_LABELS,
  type StatutFacture,
} from '@/lib/portail-prestataire';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';
import { Prisma } from '@prisma/client';

// ─── GET : Factures / Règlements du prestataire connecté ───────────────────
// Vue financière : les dossiers de catégorie REGLEMENT_PRESTATAIRE du
// prestataire (règlement direct au prestataire — cf. CATEGORIES_DOSSIER).
// Chaque facture affiche : n° (référence dossier), date, société cliente,
// période, montant facturé (montantReclame), montant réglé (montantPaye),
// solde restant, statut du règlement (dérivé du workflow plateforme —
// voir portail-prestataire.ts) et date de règlement (datePaiement).
//
// CONSOLIDATION — tout en SQL (précision monétaire Decimal conservée côté
// base, exactitude au-delà de 2 000 factures) : le statut de facture DÉRIVÉ
// est calculé par un CASE SQL qui reproduit EXACTEMENT deriveStatutFacture
// (même précédence : REJETEE préempte tout, puis PARTIELLEMENT_REGLEE, puis
// REGLEE, puis les statuts de workflow) ; le filtre dérivé, la pagination
// (OFFSET/LIMIT) et les totaux (SUM) s'exécutent alors EN BASE. Remplace un
// findMany plafonné à 2 000 lignes qui rendait la liste incomplète (factures
// 2001+ invisibles) et les totaux inexacts au-delà de ce volume.
// Le SQL est entièrement paramétré ($queryRaw tagué) ; le périmètre
// prestataireId, la catégorie et le filtre de statut (liste blanche) sont
// des constantes serveur — aucune entrée navigateur n'est interpolée.

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

    // Filtre société cliente (restrictif : un id étranger ne renvoie rien).
    const societeId = params.get('societeId') || '';

    // Filtre n° de facture (référence du dossier).
    const numero = (params.get('numero') || '').trim();

    // Filtre statut dérivé (liste blanche — jamais interpolé brut).
    const statutFiltre = (params.get('statutFacture') || '') as StatutFacture | '';
    const statutFiltreValide = STATUTS_FACTURE.includes(statutFiltre as StatutFacture)
      ? (statutFiltre as StatutFacture)
      : null;

    // ─── Périmètre + filtres navigateur (restrictifs uniquement) ────────────
    const filtres = [
      Prisma.sql`d."prestataireId" = ${prestataireId}`,
      Prisma.sql`d."categorieDossier" = 'REGLEMENT_PRESTATAIRE'`,
    ];
    if (societeId) filtres.push(Prisma.sql`d."societeId" = ${societeId}`);
    if (numero) filtres.push(Prisma.sql`d."numeroDossier" ILIKE ${`%${numero}%`}`);
    if (plage) {
      filtres.push(
        Prisma.sql`d."dateReception" >= ${plage.debut}`,
        Prisma.sql`d."dateReception" < ${plage.fin}` // fin exclusive (PlagePeriode)
      );
    }
    const whereFiltres = Prisma.join(filtres, ' AND ');

    // ─── Dérivation SQL du statut de facture ────────────────────────────────
    // "du" = COALESCE(validé, réclamé, 0) — même définition que montantDu().
    // Le CASE reproduit l'ordre de deriveStatutFacture :
    //   REJETEE              ← statut REJETE (préempte tout)
    //   PARTIELLEMENT_REGLEE ← 0 < payé < du (préempte tout)
    //   REGLEE               ← statut PAYE ou payé ≥ du (hors partielle)
    //   VALIDEE              ← VALIDE / EN_COMPTABILITE / EN_PAIEMENT
    //   EN_TRAITEMENT        ← EN_ANALYSE
    //   SOUMISE              ← RECU et tout autre cas (défaut)
    const base = Prisma.sql`
      WITH base AS (
        SELECT d."id", d."numeroDossier", d."dateReception", d."datePaiement",
               d."referencePaiement", d."statut", d."typeDossier",
               d."montantReclame", d."montantValide", d."montantPaye",
               d."societeId",
               COALESCE(d."montantValide", d."montantReclame", 0) AS "du"
        FROM "Dossier" d
        WHERE ${whereFiltres}
      ),
      derivees AS (
        SELECT b.*,
          CASE
            WHEN b."statut" = 'REJETE' THEN 'REJETEE'
            WHEN b."montantPaye" IS NOT NULL AND b."montantPaye" > 0
                 AND b."montantPaye" < b."du" THEN 'PARTIELLEMENT_REGLEE'
            WHEN b."statut" = 'PAYE' OR (b."montantPaye" IS NOT NULL AND b."montantPaye" >= b."du")
                 THEN 'REGLEE'
            WHEN b."statut" IN ('VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT') THEN 'VALIDEE'
            WHEN b."statut" = 'EN_ANALYSE' THEN 'EN_TRAITEMENT'
            ELSE 'SOUMISE'
          END AS "statutFacture",
          CASE WHEN b."statut" = 'REJETE' THEN 0
               ELSE GREATEST(b."du" - COALESCE(b."montantPaye", 0), 0) END AS "solde"
        FROM base b
      )
    `;

    const filtreStatut = statutFiltreValide
      ? Prisma.sql` WHERE "statutFacture" = ${statutFiltreValide}`
      : Prisma.empty;

    // ─── Page + total (COUNT(*) OVER sur l'ensemble filtré) ─────────────────
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limitBrute = parseInt(params.get('limit') || String(LIMITES_PAGE.defaut), 10) || LIMITES_PAGE.defaut;
    const limit = Math.min(LIMITES_PAGE.max, Math.max(LIMITES_PAGE.min, limitBrute));

    interface LigneFactureSql {
      id: string;
      numeroDossier: string;
      dateReception: Date;
      datePaiement: Date | null;
      referencePaiement: string | null;
      statut: string;
      typeDossier: string;
      montantReclame: Prisma.Decimal | string | number | null;
      montantValide: Prisma.Decimal | string | number | null;
      montantPaye: Prisma.Decimal | string | number | null;
      statutFacture: string;
      solde: Prisma.Decimal | string | number | null;
      societeId: string | null;
      societeNom: string | null;
      total: number | bigint;
    }

    const [lignes, totauxRows] = await Promise.all([
      db.$queryRaw<LigneFactureSql[]>(Prisma.sql`
        ${base}
        SELECT x."id", x."numeroDossier", x."dateReception", x."datePaiement",
               x."referencePaiement", x."statut", x."typeDossier",
               x."montantReclame", x."montantValide", x."montantPaye",
               x."statutFacture", x."solde",
               x."societeId", s."nom" AS "societeNom",
               COUNT(*) OVER() AS "total"
        FROM derivees x
        LEFT JOIN "Societe" s ON s."id" = x."societeId"
        ${filtreStatut}
        ORDER BY x."dateReception" DESC, x."id" DESC
        OFFSET ${(page - 1) * limit} LIMIT ${limit}
      `),
      db.$queryRaw<{
        totalFacture: Prisma.Decimal | string | number | null;
        totalRegle: Prisma.Decimal | string | number | null;
        totalSolde: Prisma.Decimal | string | number | null;
      }[]>(Prisma.sql`
        ${base}
        SELECT COALESCE(SUM("montantReclame"), 0) AS "totalFacture",
               COALESCE(SUM("montantPaye"), 0)    AS "totalRegle",
               COALESCE(SUM("solde"), 0)          AS "totalSolde"
        FROM derivees
        ${filtreStatut}
      `),
    ]);

    const total = lignes.length > 0 ? Number(lignes[0].total) : 0;
    const totaux = totauxRows[0] ?? {
      totalFacture: 0,
      totalRegle: 0,
      totalSolde: 0,
    };

    const enStatut = (valeur: string): StatutFacture =>
      (STATUTS_FACTURE as string[]).includes(valeur)
        ? (valeur as StatutFacture)
        : 'SOUMISE'; // inatteignable : le CASE SQL ne produit que les 6 valeurs

    return NextResponse.json({
      factures: lignes.map(l => {
        const statutFacture = enStatut(l.statutFacture);
        return {
          id: l.id,
          numeroFacture: l.numeroDossier,
          date: l.dateReception,
          periode: periodeLabel(l.dateReception),
          societe: l.societeId
            ? { id: l.societeId, nom: l.societeNom ?? '' }
            : null,
          typeLabel: getPrestationLabel(l.typeDossier),
          montantFacture: enNombre(versDecimal(l.montantReclame)) ?? 0,
          montantRegule: enNombre(versDecimal(l.montantPaye)) ?? 0,
          solde: enNombre(versDecimal(l.solde)) ?? 0,
          statutFacture,
          statutFactureLabel: STATUT_FACTURE_LABELS[statutFacture],
          statutDossier: l.statut,
          dateReglement: l.datePaiement,
          referenceReglement: l.referencePaiement,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totaux: {
        montantFacture: enNombre(versDecimal(totaux.totalFacture)) ?? 0,
        montantRegule: enNombre(versDecimal(totaux.totalRegle)) ?? 0,
        solde: enNombre(versDecimal(totaux.totalSolde)) ?? 0,
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
