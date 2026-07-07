import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const body = await request.json();
    const contact = await db.entrepriseContact.update({
      where: { id },
      data: {
        nom: body.nom,
        prenom: body.prenom || null,
        fonction: body.fonction || null,
        telephone: body.telephone || null,
        email: body.email || null,
        actif: body.actif !== undefined ? body.actif : undefined,
      },
    });
    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
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
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}