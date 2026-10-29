import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal } from '@/lib/money';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import { getPrestationLabel } from '@/lib/prestations';
import { TYPE_LABELS as TYPES_PRESTATAIRE_LABELS } from '@/components/suivisante/prestataires/types';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';
import { Prisma } from '@prisma/client';

// ─── GET : Données du portail prestataire ──────────────────────────────────
// Renvoie le profil du prestataire connecté, ses sociétés clientes
// (conventions), ses indicateurs de la période sélectionnée et ses derniers
// actes. TOUTES les données sont filtrées côté serveur par le prestataireId
// résolu depuis le JWT — aucune donnée d'un autre prestataire n'est accessible,
// même en manipulant l'URL, les ids ou les paramètres.

const KPI_FACTURES_VIDE = [{
  facturesemises: 0, facturesreglees: 0, facturesrejetees: 0,
  montantfacture: 0, montantregule: 0, montantrestant: 0,
}];

export async function GET(request: NextRequest) {
  try {
    const resolution = await resoudreIdentitePortailPrestataire(request);
    if (!resolution.ok) return resolution.response;

    // Mode administrateur : démonstration sans données prestataire.
    if (!estPrestataire(resolution.identite)) {
      return NextResponse.json({
        type: 'ADMINISTRATEUR',
        message: 'Mode administrateur. Utilisez un compte prestataire pour tester le portail.',
      });
    }

    const prestataireId = resolution.identite.prestataireId;

    // Filtre de période réutilisable (date de référence : Dossier.dateReception),
    // appliqué APRÈS la résolution du périmètre : l'isolation est garantie.
    const plage = plageDepuisParams(new URL(request.url).searchParams);

    // Profil du prestataire (référentiel global — fiche lue pour soi-même).
    const prestataire = await db.prestataire.findUnique({
      where: { id: prestataireId },
      select: {
        id: true, nom: true, type: true, telephone: true, email: true,
        adresse: true, nif: true, stat: true, statutJuridique: true,
        statut: true, actif: true,
      },
    });
    if (!prestataire) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    // Sociétés clientes (conventions) — toutes, avec leur état actif/inactif :
    // l'historique reste visible, les conventions inactives sont marquées
    // (les actes y sont refusés automatiquement par le plateau technique).
    const conventions = await db.prestataireSociete.findMany({
      where: { prestataireId },
      include: { societe: { select: { id: true, nom: true } } },
      orderBy: { societe: { nom: 'asc' } },
    });

    // ─── Indicateurs de la période ──────────────────────────────────────────
    // Actes (vue médicale) : tous les dossiers du prestataire.
    const whereActes: Prisma.DossierWhereInput = { prestataireId };
    Object.assign(whereActes, filtreDateChamp('dateReception', plage));

    const [actesRealises, assureDistintcs, actesParSociete] = await Promise.all([
      db.dossier.count({ where: whereActes }),
      db.dossier.findMany({
        where: { ...whereActes, assureId: { not: null } },
        select: { assureId: true },
        distinct: ['assureId'],
      }),
      db.dossier.groupBy({
        by: ['societeId'],
        where: whereActes,
        _count: { _all: true },
      }),
    ]);

    // Factures (vue financière) : dossiers de règlement prestataire —
    // c'est le prestataire qui est payé directement. Les dossiers
    // REMBOURSEMENT_ASSURE sont réglés à l'assuré (vue Actes uniquement).
    //
    // CONSOLIDATION — KPI par agrégat SQL unique (précision monétaire Decimal
    // conservée côté base) : remplace un findMany plafonné à 2000 lignes,
    // qui rendait les compteurs et sommes inexacts au-delà de ce volume.
    // Les compteurs dérivent EXACTEMENT la logique de deriveStatutFacture
    // (src/lib/portail-prestataire.ts) :
    //   REJETEE              ← statut REJETE (préempte tout)
    //   PARTIELLEMENT_REGLEE ← 0 < payé < dû, dû = COALESCE(validé, réclamé) (préempte tout)
    //   REGLEE               ← statut PAYE ou payé ≥ dû (hors partielle)
    // Une facture partiellement réglée est donc comptée « en attente » :
    // il lui reste un solde à encaisser (cohérent avec montantRestant).
    // Le SQL est entièrement paramétré ($queryRaw tagué) ; le périmètre
    // prestataireId et la catégorie sont des constantes serveur — aucune
    // entrée navigateur n'entre dans la requête (la période vient de
    // plageDepuisParams, dates serveur).
    const filtresFactures = [
      Prisma.sql`d."prestataireId" = ${prestataireId}`,
      Prisma.sql`d."categorieDossier" = 'REGLEMENT_PRESTATAIRE'`,
    ];
    if (plage) {
      filtresFactures.push(
        Prisma.sql`d."dateReception" >= ${plage.debut}`,
        Prisma.sql`d."dateReception" < ${plage.fin}` // fin exclusive (PlagePeriode)
      );
    }

    const [kpiFactures] = await db.$queryRaw<{
      facturesemises: number | bigint;
      facturesreglees: number | bigint;
      facturesrejetees: number | bigint;
      montantfacture: string | number | bigint | null;
      montantregule: string | number | bigint | null;
      montantrestant: string | number | bigint | null;
    }>(Prisma.sql`
      WITH f AS (
        SELECT d."statut", d."montantReclame", d."montantValide", d."montantPaye",
               COALESCE(d."montantValide", d."montantReclame", 0) AS "du"
        FROM "Dossier" d
        WHERE ${Prisma.join(filtresFactures, ' AND ')}
      )
      SELECT
        COUNT(*)::int AS facturesemises,
        COUNT(*) FILTER (
          WHERE "statut" <> 'REJETE'
            AND NOT ("montantPaye" IS NOT NULL AND "montantPaye" > 0 AND "montantPaye" < "du")
            AND ("statut" = 'PAYE' OR ("montantPaye" IS NOT NULL AND "montantPaye" >= "du"))
        )::int AS facturesreglees,
        COUNT(*) FILTER (WHERE "statut" = 'REJETE')::int AS facturesrejetees,
        COALESCE(SUM("montantReclame"), 0) AS montantfacture,
        COALESCE(SUM("montantPaye"), 0) AS montantregule,
        COALESCE(SUM(CASE WHEN "statut" = 'REJETE' THEN 0
                          ELSE GREATEST("du" - COALESCE("montantPaye", 0), 0) END), 0) AS montantrestant
      FROM f
    `) ?? KPI_FACTURES_VIDE;

    const facturesEmises = Number(kpiFactures.facturesemises);
    const facturesRegles = Number(kpiFactures.facturesreglees);
    const facturesRejetees = Number(kpiFactures.facturesrejetees);
    const facturesEnAttente = Math.max(0, facturesEmises - facturesRegles - facturesRejetees);
    const montantFacture = Math.round(enNombre(kpiFactures.montantfacture) * 100) / 100;
    const montantRegule = Math.round(enNombre(kpiFactures.montantregule) * 100) / 100;
    const montantRestant = Math.round(enNombre(kpiFactures.montantrestant) * 100) / 100;

    // Derniers actes (aperçu tableau de bord, même périmètre + période).
    const derniersActes = await db.dossier.findMany({
      where: whereActes,
      include: {
        societe: { select: { id: true, nom: true } },
        assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
      },
      orderBy: { dateReception: 'desc' },
      take: 8,
    });

    const nbActesParSociete = new Map<string, number>();
    for (const g of actesParSociete) {
      if (g.societeId) nbActesParSociete.set(g.societeId, g._count._all);
    }

    return NextResponse.json({
      type: 'PRESTATAIRE',
      prestataire: {
        ...prestataire,
        typeLabel: TYPES_PRESTATAIRE_LABELS[prestataire.type] ?? prestataire.type,
      },
      societes: conventions.map(c => ({
        idLien: c.id,
        societeId: c.societe.id,
        nom: c.societe.nom,
        conventionActive: c.actif,
        dateLiaison: c.createdAt,
        nbActes: nbActesParSociete.get(c.societe.id) ?? 0,
      })),
      kpis: {
        actesRealises,
        assuresPrisEnCharge: assureDistintcs.length,
        facturesEmises,
        facturesEnAttente,
        facturesRegles,
        facturesRejetees,
        montantFacture,
        montantRegule,
        montantRestant,
      },
      derniersActes: derniersActes.map(d => ({
        id: d.id,
        numeroDossier: d.numeroDossier,
        typeDossier: d.typeDossier,
        typeLabel: getPrestationLabel(d.typeDossier),
        statut: d.statut,
        beneficiaire: d.beneficiaire,
        dateReception: d.dateReception,
        montantReclame: enNombre(versDecimal(d.montantReclame)) ?? 0,
        montantPaye: enNombre(versDecimal(d.montantPaye)) ?? 0,
        societe: d.societe,
        assure: d.assure ? {
          nom: d.assure.nom,
          prenom: d.assure.prenom,
          typeBeneficiaire: d.assure.typeBeneficiaire,
        } : null,
      })),
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des données.' },
      { status: 500 }
    );
  }
}
