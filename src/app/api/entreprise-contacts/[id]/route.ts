import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { contactEntrepriseUpdateSchema } from "@/lib/validation";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    // ─── Validation Zod centralisée ─────────────────────────────────────────
    // FIX audit : PUT sans aucune validation — un nom absent provoquait une
    // erreur 500 Prisma. Désormais : 400 « Données invalides » avec détail.
    const parsed = await parseJsonBody(request, contactEntrepriseUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, prenom, fonction, telephone, email, actif } = parsed.data;
    const contact = await db.entrepriseContact.update({
      where: { id },
      data: {
        nom,
        prenom: prenom ?? null,
        fonction: fonction ?? null,
        telephone: telephone ?? null,
        email: email ?? null,
        ...(actif !== undefined ? { actif } : {}),
      },
    });
    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    await db.entrepriseContact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}