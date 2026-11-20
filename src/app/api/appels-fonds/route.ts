import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logAuditOperation, getUserInfoFromRequest } from '@/lib/audit-log';
import { parseJsonBody } from "@/lib/validation/parse";
import { appelFondsCreateSchema } from "@/lib/validation";
import { plageDepuisParams, filtreDateChamp } from "@/lib/periodes";
import { versDecimal, superieurA, formaterAr } from "@/lib/money";
import { Decimal } from "@/lib/money";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const contratId = searchParams.get("contratId") || undefined;
    const statut = searchParams.get("statut") || undefined;

    const where: Record<string, unknown> = {};
    if (contratId) where.contratId = contratId;
    if (statut) where.statut = statut;

    // Filtre de période réutilisable (date de référence : AppelDeFonds.dateAppel)
    Object.assign(where, filtreDateChamp("dateAppel", plageDepuisParams(searchParams)));

    const appels = await db.appelDeFonds.findMany({
      where,
      include: {
        contrat: {
          include: { societe: { select: { id: true, nom: true } } },
        },
      },
      orderBy: { dateAppel: "desc" },
    });

    return NextResponse.json(appels);
  } catch (error) {
    console.error('[APPELS_FONDS] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur lors de l'opération." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Erreurs sentinelles (levées dans la transaction, converties en réponses)
  class ContratIntrouvable extends Error {}
  class ContratNonActif extends Error {
    constructor(public statutContrat: string) { super(`Contrat ${statutContrat}`); }
  }
  class ContratHorsPeriode extends Error {}
  class DepassementBudget extends Error {
    constructor(public details: Record<string, unknown>) { super('Dépassement du budget annuel'); }
  }

  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée ────────────────────────────────────────
    // FIX audit majeur : le montant n'était jamais contrôlé — un montant
    // négatif était accepté et diminuait le budget utilisé du contrat.
    // montantPositif garantit maintenant un nombre > 0 (montant strictement positif).
    const parsed = await parseJsonBody(request, appelFondsCreateSchema);
    if (!parsed.success) return parsed.response;
    const { contratId, montant, dateAppel, observations } = parsed.data;

    // FIX audit P2 : création de l'appel ET synchronisation du budgetUtilise
    // dans UNE SEULE transaction — avant, un échec entre les deux écrivait
    // un appel sans budget synchronisé (budgetUtilise faux → plafonds faux).
    const appel = await db.$transaction(async (tx) => {
      // ─── BIZ-6 : verrou sur la ligne du contrat ─────────────────────────
      // Sérialise les appels concurrents sur le MÊME contrat : sans verrou,
      // deux POST simultanés relisaient le même budgetUtilise et dépassaient
      // tous deux le budget annuel (course classique de réservation).
      await tx.$queryRaw`SELECT "id" FROM "Contrat" WHERE "id" = ${contratId} FOR UPDATE`;
      const contrat = await tx.contrat.findUnique({ where: { id: contratId } });
      if (!contrat) throw new ContratIntrouvable();

      // ─── BIZ-6 : contrat ACTIF exigé ────────────────────────────────────
      // Ancien comportement : aucun contrôle de statut — un appel de fonds
      // pouvait être créé sur un contrat résilié ou suspendu.
      if (contrat.statut !== 'ACTIF') {
        throw new ContratNonActif(contrat.statut);
      }

      // ─── BIZ-6 : la date d'appel doit tomber dans la période contractuelle
      if (dateAppel < new Date(contrat.dateDebut) || dateAppel > new Date(contrat.dateFin)) {
        throw new ContratHorsPeriode();
      }

      // ─── BIZ-6 : budget disponible (comparaison Decimal exacte) ─────────
      // Ancien comportement : l'incrément était fait sans AUCUN contrôle —
      // le solde affiché pouvait dépasser 100 % sans erreur.
      const budgetUtilise = versDecimal(contrat.budgetUtilise) ?? new Decimal(0);
      const budgetAnnuel = versDecimal(contrat.budgetAnnuel) ?? new Decimal(0);
      const budgetApres = budgetUtilise.plus(versDecimal(montant) ?? new Decimal(0));
      if (superieurA(budgetApres, budgetAnnuel)) {
        const solde = budgetAnnuel.minus(budgetUtilise);
        throw new DepassementBudget({
          budgetAnnuel: formaterAr(budgetAnnuel),
          budgetUtilise: formaterAr(budgetUtilise),
          soldeDisponible: formaterAr(solde.isNegative() ? new Decimal(0) : solde),
          montantDemande: formaterAr(montant),
        });
      }

      const nouvelAppel = await tx.appelDeFonds.create({
        data: {
          contratId,
          montant,
          dateAppel,
          observations: observations ?? null,
          statut: "EN_ATTENTE",
        },
        include: { contrat: { include: { societe: true } } },
      });

      // Synchroniser le budgetUtilise du contrat (champ cache) — même transaction
      await tx.contrat.update({
        where: { id: contratId },
        data: { budgetUtilise: { increment: montant } },
      });

      return nouvelAppel;
    });

    // ─── Audit : création d'appel de fonds (operationId) ───────────────────
    const { nom: auditNom, id: auditId } = await getUserInfoFromRequest(request);
    await logAuditOperation({
      entite: 'AppelDeFonds',
      entiteId: appel.id,
      action: 'CREATION',
      modifiePar: auditNom,
      modifieParId: auditId,
      objet: `Appel de fonds — ${appel.contrat?.reference ?? ''}`,
      societeId: appel.contrat?.societeId ?? undefined,
      resume: `Montant : ${appel.montant} Ar`,
      request,
    });

    return NextResponse.json(appel, { status: 201 });
  } catch (error) {
    if (error instanceof ContratIntrouvable) {
      return NextResponse.json({ erreur: "Contrat introuvable" }, { status: 404 });
    }
    if (error instanceof ContratNonActif) {
      return NextResponse.json(
        { erreur: `Contrat non actif (statut « ${error.statutContrat} ») : aucun nouvel appel de fonds possible.` },
        { status: 422 }
      );
    }
    if (error instanceof ContratHorsPeriode) {
      return NextResponse.json(
        { erreur: "La date d'appel est hors de la période contractuelle du contrat." },
        { status: 422 }
      );
    }
    if (error instanceof DepassementBudget) {
      return NextResponse.json(
        { erreur: "Budget annuel insuffisant : l'appel de fonds dépasserait le solde disponible du contrat.", ...error.details },
        { status: 422 }
      );
    }
    console.error('[APPELS_FONDS] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}