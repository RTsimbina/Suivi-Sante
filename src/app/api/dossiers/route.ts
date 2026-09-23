import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logAuditOperation, getUserInfoFromRequest } from '@/lib/audit-log';
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSociete,
} from "@/lib/data-isolation";
import { Prisma } from "@prisma/client";
import { verifierPlafondAnnuel, type PlafondCheckResult } from "@/lib/plafond-check";
import { sommer, superieurOuEgal, enNombre, appliquerTaux, moins } from "@/lib/money";
import { parseJsonBody } from "@/lib/validation/parse";
import { dossierCreateSchema } from "@/lib/validation";
import {
  genererNumeroDossier,
  avecRetryNumeroDossier,
} from "@/lib/numero-dossier";
import { plageDepuisParams, filtreDateChamp } from "@/lib/periodes";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const statut = searchParams.get("statut") || undefined;
    const service = searchParams.get("service") || undefined;
    const societe = searchParams.get("societe") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      1000,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );

    // ─── Isolation des données (RLS applicatif, voir data-isolation.ts) ────
    // Rôles externes : périmètre société FORCÉ depuis le JWT — tout
    // ?societeId client est ignoré (écrasé). Fail-closed si compte sans société.
    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    const where: Prisma.DossierWhereInput = {};

    // ─── Filtre de période réutilisable (date de référence : Dossier.dateReception) ───
    // Appliqué AVANT avecPerimetreSociete : le périmètre société reste garanti par-dessus.
    const plage = plageDepuisParams(searchParams);
    Object.assign(where, filtreDateChamp('dateReception', plage));

    // Filter by statut (supports comma-separated: "VALIDE,REJETE")
    if (statut) {
      const statuts = statut.split(',').map(s => s.trim()).filter(Boolean);
      if (statuts.length === 1) {
        where.statut = statuts[0];
      } else if (statuts.length > 1) {
        where.statut = { in: statuts };
      }
    }

    // Filter by service — maps to which gestionnaire relation to check
    if (service === "RECEPTION") {
      where.gestionnaireAccueilId = { not: null };
    } else if (service === "TECHNIQUE") {
      where.gestionnaireTechniqueId = { not: null };
    } else if (service === "COMPTABILITE") {
      where.gestionnaireComptaId = { not: null };
    }

    // Filter by societe name (case-insensitive)
    if (societe) {
      where.societe = {
        nom: { contains: societe, mode: "insensitive" },
      };
    }

    // Search by beneficiaire or numeroDossier
    if (search) {
      where.OR = [
        { beneficiaire: { contains: search, mode: "insensitive" } },
        { numeroDossier: { contains: search, mode: "insensitive" } },
      ];
    }

    // ─── Fusion du périmètre : écrase tout societeId client pour les rôles restreints ───
    const skip = (page - 1) * limit;

    const whereFiltre = avecPerimetreSociete(where, perimetre);

    const [dossiers, total] = await Promise.all([
      db.dossier.findMany({
        where: whereFiltre,
        include: {
          societe: true,
          gestionnaireAccueil: true,
          gestionnaireTechnique: true,
          gestionnaireCompta: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.dossier.count({ where: whereFiltre }),
    ]);

    return NextResponse.json({
      dossiers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching dossiers:", error);
    return NextResponse.json({ erreur: "Erreur lors de la récupération des dossiers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (type, champs requis, montants, enums) ──
    const parsed = await parseJsonBody(request, dossierCreateSchema);
    if (!parsed.success) return parsed.response;
    const {
      dateReception,
      societeId,
      beneficiaire,
      typeDossier,
      categorieDossier,
      gestionnaireAccueilId,
      montantReclame,
      assureId,
      nSS,
      prestataireId,
      dateSoins,
      moyenPaiement,
      observations,
      source,
      montantValide,
      ticketModerateur,
    } = parsed.data;
    // numeroDossier du client volontairement ignoré : généré côté serveur
    // (voir numéro-dossier.ts — avant : total+1 calculé sur la liste du
    // demandeur, source de doublons dès deux créations simultanées).

    // ─── Vérification du plafond annuel ────────────────────────────────────
    // Si un assureId est fourni, vérifier que le plafond n'est pas atteint.
    // Ce contrôle est le même que simuler-acte, appliqué automatiquement.
    let plafondResult: PlafondCheckResult | null = null;
    if (assureId && societeId && typeDossier && montantReclame) {
      plafondResult = await verifierPlafondAnnuel({
        assureId,
        societeId,
        typeActe: typeDossier,
        montantDemande: montantReclame,
        prestataireId: prestataireId || undefined,
      });

      // Bloquer si le plafond est atteint (assuré inactif, plafond acte/global épuisé)
      if (!plafondResult.autorise &&
          ['ASSURE_INACTIF', 'PLAFOND_ACTE_ATTEINT', 'PLAFOND_GLOBAL_ATTEINT', 'PRESTATAIRE_INACTIF'].includes(plafondResult.raison)) {
        return NextResponse.json({ erreur: plafondResult.message,
            plafondAtteint: true,
            plafondDetails: plafondResult.details,
            raison: plafondResult.raison,
          },
          { status: 422 }
        );
      }
    }

    const userId = request.headers.get('x-user-id') || '';

    // ─── Historique initial ────────────────────────────────────────────────
    const historiqueEntries: Record<string, unknown>[] = [
      { date: new Date().toISOString(), statut: "RECU", commentaire: "Dossier créé manuellement" },
    ];

    // Ajouter les alertes de plafond dans l'historique
    if (plafondResult && plafondResult.alertes.length > 0) {
      for (const alerte of plafondResult.alertes) {
        historiqueEntries.push({
          date: new Date().toISOString(),
          statut: "RECU",
          commentaire: `[PLAFOND] ${alerte.message}`,
        });
      }
    }

    // ─── Calcul du montant validé ──────────────────────────────────────────
    // Si le plafond a été vérifié et le montant est partiellement couvert,
    // recalculer montantValide selon le reliquat
    let finalMontantValide = montantValide || null;
    let finalTicketModerateur = ticketModerateur || null;

    if (plafondResult && plafondResult.details.montantCouvert != null) {
      // Utiliser le montant couvert par le plafond (qui tient compte du reliquat)
      // et le taux de couverture du barème — calcul en Decimal exact (plan P3)
      const taux = plafondResult.details.tauxCouverture || 0;
      const montantCouvert = plafondResult.details.montantCouvert;
      const montantValideDecimal = appliquerTaux(montantCouvert, taux);
      finalMontantValide = enNombre(montantValideDecimal) ?? 0;
      finalTicketModerateur = enNombre(moins(montantCouvert, finalMontantValide)) ?? 0;
    }

    // Transaction : numéro de dossier généré côté serveur, verrou FOR UPDATE
    // sur le barème (sérialise les créations concurrentes d'un même plafond)
    // et re-vérification du plafond — le tout ATOMIQUE. En cas de collision
    // résiduelle de numéro (course inter-transactions, trou de suppression),
    // avecRetryNumeroDossier rejoue avec un décalage (contrainte UNIQUE = juge).
    const annee =
      dateReception instanceof Date
        ? dateReception.getFullYear()
        : new Date().getFullYear();

    const dossier = await avecRetryNumeroDossier((decalage) =>
      db.$transaction(async (tx) => {
        // Re-vérifier le plafond dans la transaction
        if (assureId && societeId && typeDossier && montantReclame) {
          const baremeTx = await tx.bareme.findFirst({ where: { societeId, prestation: typeDossier, active: true } });
          if (baremeTx) {
            // FOR UPDATE : la 2e transaction concurrente attend le commit de
            // la 1re, puis relit un total consommé à jour (READ COMMITTED)
            // — avant : deux créations simultanées passaient toutes deux
            // le contrôle et dépassaient le plafond.
            await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${baremeTx.id} FOR UPDATE`;
          }
          const plafondTx = await tx.dossier.findMany({
            where: {
              assureId,
              societeId,
              typeDossier,
              dateReception: { gte: new Date(new Date().getFullYear(), 0, 1), lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59) },
              statut: { in: ['EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] },
            },
            select: { montantValide: true, montantPaye: true, montantReclame: true },
          });
          const consomme = sommer(plafondTx.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame));
          if (baremeTx && superieurOuEgal(consomme, baremeTx.plafond)) {
            throw new Error(`PLAFOND_ATTEINT_TRANSACTION: Plafond ${typeDossier} atteint lors de la création`);
          }
        }

        // ─── Numéro de dossier : GÉNÉRÉ CÔTÉ SERVEUR, dans la transaction ──
        const numeroDossier = await genererNumeroDossier(tx, annee, decalage);

        return tx.dossier.create({
      data: {
        numeroDossier,
        dateReception,
        societeId,
        beneficiaire,
        typeDossier,
        categorieDossier: categorieDossier ?? null,
        gestionnaireAccueilId: gestionnaireAccueilId ?? null,
        createurId: userId,
        montantReclame,
        assureId: assureId ?? null,
        nSS: nSS ?? null,
        prestataireId: prestataireId ?? null,
        dateSoins: dateSoins ?? null,
        moyenPaiement: moyenPaiement ?? null,
        observations: observations ?? null,
        statut: "RECU",
        source,
        montantValide: finalMontantValide,
        ticketModerateur: finalTicketModerateur,
        historique: JSON.stringify(historiqueEntries),
      },
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
    });
    })); // fin avecRetryNumeroDossier($transaction)

    // Attraper l'erreur de plafond de la transaction
    const response: Record<string, unknown> = { ...dossier } as Record<string, unknown>;
    if (plafondResult) {
      response.plafondCheck = plafondResult;
    }

    // ─── Audit : création de dossier (operationId) ─────────────────────────
    const { nom: auditNom, id: auditId } = await getUserInfoFromRequest(request);
    await logAuditOperation({
      entite: 'Dossier',
      entiteId: dossier.id,
      action: 'CREATION',
      modifiePar: auditNom,
      modifieParId: auditId,
      objet: `Dossier ${dossier.numeroDossier} — ${dossier.beneficiaire}`,
      societeId: dossier.societeId,
      resume: `Montant réclamé : ${dossier.montantReclame} Ar`,
      request,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Perte de course sur le plafond (re-vérification transactionnelle) :
    // réponse 422 explicite au lieu d'une 500 générique.
    if (error instanceof Error && error.message.startsWith('PLAFOND_ATTEINT_TRANSACTION')) {
      return NextResponse.json(
        { erreur: error.message.replace('PLAFOND_ATTEINT_TRANSACTION: ', ''), plafondAtteint: true },
        { status: 422 }
      );
    }
    console.error("Error creating dossier:", error);
    return NextResponse.json({ erreur: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}