import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service") || undefined;
    const where = service ? { service } : {};
    const gestionnaires = await db.gestionnaire.findMany({ where, orderBy: { nom: "asc" } });
    return NextResponse.json(gestionnaires);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}