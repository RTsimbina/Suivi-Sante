import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const societeId = searchParams.get("societeId");
    const where: Prisma.EntrepriseContactWhereInput = {};
    if (societeId) where.societeId = societeId;
    const contacts = await db.entrepriseContact.findMany({
      where,
      include: { societe: { select: { id: true, nom: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Error fetching entreprise contacts:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const body = await request.json();
    const { societeId, nom, prenom, fonction, telephone, email } = body;
    if (!societeId || !nom) return NextResponse.json({ error: "societeId et nom requis" }, { status: 400 });
    const contact = await db.entrepriseContact.create({
      data: { societeId, nom, prenom: prenom || null, fonction: fonction || null, telephone: telephone || null, email: email || null },
      include: { societe: { select: { id: true, nom: true } } },
    });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("Error creating entreprise contact:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}