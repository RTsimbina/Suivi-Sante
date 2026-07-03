import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { Prisma } from "@prisma/client";

const VALID_TYPES = ["FACTURE_PRESTATAIRE", "DOSSIER_REMBOURSEMENT"];
const VALID_STATUTS = ["RECU", "TRAITE", "REJETE"];

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;
    const statut = searchParams.get("statut") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );

    const where: Prisma.CourrielWhereInput = {};

    if (type && VALID_TYPES.includes(type)) {
      where.type = type;
    }

    if (statut && VALID_STATUTS.includes(statut)) {
      where.statut = statut;
    }

    if (search) {
      where.OR = [
        { expediteur: { contains: search, mode: "insensitive" } },
        { objet: { contains: search, mode: "insensitive" } },
        { beneficiaire: { contains: search, mode: "insensitive" } },
        { prestataire: { contains: search, mode: "insensitive" } },
        { societe: { nom: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [courriels, total] = await Promise.all([
      db.courriel.findMany({
        where,
        include: {
          societe: { select: { id: true, nom: true } },
          dossier: { select: { id: true, numeroDossier: true } },
        },
        orderBy: { dateCourriel: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.courriel.count({ where }),
    ]);

    return NextResponse.json({
      courriels,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erreur GET /api/reception/courriels:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la récupération des courriels." },
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
      type,
      expediteur,
      objet,
      societeId,
      beneficiaire,
      montant,
      dateCourriel,
      dateSoins,
      prestataire,
    } = body;

    // Validations
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { erreur: `Type invalide. Valeurs autorisées : ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!expediteur || !expediteur.trim()) {
      return NextResponse.json(
        { erreur: "L'expéditeur est obligatoire." },
        { status: 400 }
      );
    }

    if (!objet || !objet.trim()) {
      return NextResponse.json(
        { erreur: "L'objet du courriel est obligatoire." },
        { status: 400 }
      );
    }

    if (montant !== undefined && montant !== null && (typeof montant !== "number" || montant < 0)) {
      return NextResponse.json(
        { erreur: "Le montant doit être un nombre positif." },
        { status: 400 }
      );
    }

    // Vérifier que la société existe si societeId est fourni
    if (societeId) {
      const societe = await db.societe.findUnique({ where: { id: societeId } });
      if (!societe) {
        return NextResponse.json(
          { erreur: "Société introuvable." },
          { status: 404 }
        );
      }
    }

    const courriel = await db.courriel.create({
      data: {
        type,
        expediteur: expediteur.trim(),
        objet: objet.trim(),
        societeId: societeId || null,
        beneficiaire: beneficiaire?.trim() || null,
        montant: montant ?? null,
        dateCourriel: dateCourriel ? new Date(dateCourriel) : new Date(),
        dateSoins: dateSoins ? new Date(dateSoins) : null,
        prestataire: prestataire?.trim() || null,
      },
      include: {
        societe: { select: { id: true, nom: true } },
      },
    });

    return NextResponse.json(
      { message: "Courriel enregistré avec succès.", courriel },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/reception/courriels:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de l'enregistrement du courriel." },
      { status: 500 }
    );
  }
}