import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

// GET /api/bot-messages — Liste des conversations bots (Admin only)
export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const canal = searchParams.get('canal') || '';
    const lu = searchParams.get('lu');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (canal) where.canal = canal;
    if (lu === 'true') where.lu = true;
    if (lu === 'false') where.lu = false;

    const [messages, total] = await Promise.all([
      db.messageBot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.messageBot.count({ where }),
    ]);

    // Marquer comme lus
    if (lu !== 'true') {
      await db.messageBot.updateMany({
        where: { lu: false },
        data: { lu: true },
      });
    }

    return NextResponse.json({ messages, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Erreur récupération messages bot:", error);
    return NextResponse.json({ erreur: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/bot-messages — Supprimer un message (Admin only)
export async function DELETE(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erreur: "ID requis" }, { status: 400 });

  await db.messageBot.delete({ where: { id } });
  return NextResponse.json({ message: "Message supprimé" });
}