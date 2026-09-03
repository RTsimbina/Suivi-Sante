import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { Prisma } from "@prisma/client";
import { verifierPlafondAnnuel, type PlafondCheckResult } from "@/lib/plafond-check";
import { parseJsonBody } from "@/lib/validation/parse";
import { dossierCreateSchema } from "@/lib/validation";

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

    const userRole = request.headers.get('x-user-role') || '';
    const userId = request.headers.get('x-user-id') || '';

    const where: Prisma.DossierWhereInput = {};

    // ─── Isolation des données ───

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

    const skip = (page - 1) * limit;

    const [dossiers, total] = await Promise.all([
      db.dossier.findMany({
        where,
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
      db.dossier.count({ where }),
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
      numeroDossier,
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

    // Check for duplicate numeroDossier
    const existing = await db.dossier.findUnique({
      where: { numeroDossier },
    });

    if (existing) {
      return NextResponse.json({ erreur: "Un dossier avec ce numéro existe déjà" },
        { status: 409 }
      );
    }

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

    if (plafondResult && plafondResult.details.montantCouvert !== undefined) {
      // Utiliser le montant couvert par le plafond (qui tient compte du reliquat)
      // et le taux de couverture du barème
      const taux = plafondResult.details.tauxCouverture || 0;
      const montantCouvert = plafondResult.details.montantCouvert;
      finalMontantValide = Math.round(montantCouvert * (taux / 100) * 100) / 100;
      finalTicketModerateur = Math.round((montantCouvert - finalMontantValide) * 100) / 100;
    }

    // Transaction : vérifier le plafond ET créer le dossier de manière atomique
    // pour éviter les race conditions (deux créations simultanées)
    const dossier = await db.$transaction(async (tx) => {
      // Re-vérifier le plafond dans la transaction
      if (assureId && societeId && typeDossier && montantReclame) {
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
        const consomme = plafondTx.reduce((s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame), 0);
        const baremeTx = await tx.bareme.findFirst({ where: { societeId, prestation: typeDossier, active: true } });
        if (baremeTx && consomme >= baremeTx.plafond) {
          throw new Error(`PLAFOND_ATTEINT_TRANSACTION: Plafond ${typeDossier} atteint lors de la création`);
        }
      }

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
    }); // fin $transaction

    // Attraper l'erreur de plafond de la transaction
    const response: Record<string, unknown> = { ...dossier } as Record<string, unknown>;
    if (plafondResult) {
      response.plafondCheck = plafondResult;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating dossier:", error);
    return NextResponse.json({ erreur: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}