import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const societes = await db.societe.findMany({ orderBy: { nom: "asc" } });
    return NextResponse.json(societes);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}