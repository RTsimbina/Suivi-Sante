import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service") || undefined;
    const where = service ? { service } : {};
    const gestionnaires = await db.gestionnaire.findMany({ where, orderBy: { nom: "asc" } });
    return NextResponse.json(gestionnaires);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}