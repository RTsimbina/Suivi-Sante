import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const societes = await db.societe.findMany({ orderBy: { nom: "asc" } });
    return NextResponse.json(societes);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}