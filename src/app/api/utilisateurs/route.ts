import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { checkAuth } from "@/lib/authorize";

const VALID_ROLES = ["ADMINISTRATEUR", "ACCUEIL", "TECHNIQUE", "COMPTABILITE", "UTILISATEUR"];

// GET /api/utilisateurs — Lister tous les utilisateurs (admin only)
export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const utilisateurs = await db.utilisateur.findMany({
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        dernierLogin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Compter les dossiers créés par chaque utilisateur
    const dossierCounts = await db.dossier.groupBy({
      by: ["createurId"],
      _count: { id: true },
    });

    const countMap = new Map(dossierCounts.map((d) => [d.createurId, d._count.id]));

    const enriched = utilisateurs.map((u) => ({
      ...u,
      nbDossiersCrees: countMap.get(u.id) || 0,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Error fetching utilisateurs:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 }
    );
  }
}

// POST /api/utilisateurs — Créer un utilisateur (admin only)
export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { email, nom, password, role, actif } = body;

    // Validations
    if (!email || !nom || !password || !role) {
      return NextResponse.json(
        { erreur: "Les champs email, nom, password et role sont obligatoires" },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { erreur: `Rôle invalide. Valeurs autorisées : ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { erreur: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    // Vérifier l'unicité de l'email
    const existing = await db.utilisateur.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json(
        { erreur: "Un utilisateur avec cet e-mail existe déjà" },
        { status: 409 }
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await hash(password, 12);

    const utilisateur = await db.utilisateur.create({
      data: {
        email: email.toLowerCase().trim(),
        nom: nom.trim(),
        password: hashedPassword,
        role,
        actif: actif !== false,
      },
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        dernierLogin: true,
        createdAt: true,
      },
    });

    return NextResponse.json(utilisateur, { status: 201 });
  } catch (error) {
    console.error("Error creating utilisateur:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la création de l'utilisateur" },
      { status: 500 }
    );
  }
}

// PUT /api/utilisateurs — Modifier un utilisateur (admin only)
export async function PUT(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, email, nom, password, role, actif } = body;

    if (!id) {
      return NextResponse.json({ erreur: "L'id est requis" }, { status: 400 });
    }

    const existing = await db.utilisateur.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { erreur: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (email) {
      updateData.email = email.toLowerCase().trim();
    }
    if (nom) {
      updateData.nom = nom.trim();
    }
    if (role && VALID_ROLES.includes(role)) {
      updateData.role = role;
    }
    if (typeof actif === "boolean") {
      updateData.actif = actif;
    }
    if (password && password.length >= 8) {
      updateData.password = await hash(password, 12);
    }

    const updated = await db.utilisateur.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        dernierLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating utilisateur:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la modification de l'utilisateur" },
      { status: 500 }
    );
  }
}

// DELETE /api/utilisateurs — Supprimer un utilisateur (admin only)
export async function DELETE(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ erreur: "L'id est requis" }, { status: 400 });
    }

    // Empêcher l'auto-suppression
    const userId = request.headers.get("x-user-id");
    if (userId === id) {
      return NextResponse.json(
        { erreur: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    const existing = await db.utilisateur.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { erreur: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    await db.utilisateur.delete({ where: { id } });

    return NextResponse.json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    console.error("Error deleting utilisateur:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la suppression de l'utilisateur" },
      { status: 500 }
    );
  }
}