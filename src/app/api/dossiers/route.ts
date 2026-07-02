import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { Prisma } from "@prisma/client";

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
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );

    const where: Prisma.DossierWhereInput = {};

    // Filter by statut
    if (statut) {
      where.statut = statut;
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
    return NextResponse.json(
      { error: "Erreur lors de la récupération des dossiers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const body = await request.json();

    const {
      numeroDossier,
      dateReception,
      societeId,
      beneficiaire,
      typeDossier,
      gestionnaireAccueilId,
      montantReclame,
      assure,
      nSS,
      prestataire,
      dateSoins,
      moyenPaiement,
      observations,
      source,
    } = body;

    // Validate required fields
    if (!numeroDossier || !dateReception || !societeId || !beneficiaire || !typeDossier) {
      return NextResponse.json(
        { error: "Les champs obligatoires sont manquants: numeroDossier, dateReception, societeId, beneficiaire, typeDossier" },
        { status: 400 }
      );
    }

    // Check for duplicate numeroDossier
    const existing = await db.dossier.findUnique({
      where: { numeroDossier },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Un dossier avec ce numéro existe déjà" },
        { status: 409 }
      );
    }

    const historiqueInit = JSON.stringify([
      { date: new Date().toISOString(), statut: "RECU", commentaire: "Dossier créé manuellement" },
    ]);

    const dossier = await db.dossier.create({
      data: {
        numeroDossier,
        dateReception: new Date(dateReception),
        societeId,
        beneficiaire,
        typeDossier,
        gestionnaireAccueilId: gestionnaireAccueilId || null,
        montantReclame: montantReclame || 0,
        assure: assure || null,
        nSS: nSS || null,
        prestataire: prestataire || null,
        dateSoins: dateSoins ? new Date(dateSoins) : null,
        moyenPaiement: moyenPaiement || null,
        observations: observations || null,
        statut: "RECU",
        source: source || "MANUEL",
        historique: historiqueInit,
      },
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
    });

    return NextResponse.json(dossier, { status: 201 });
  } catch (error) {
    console.error("Error creating dossier:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}