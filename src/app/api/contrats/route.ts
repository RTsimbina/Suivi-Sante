import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const contrats = await db.contrat.findMany({
      include: {
        societe: { select: { id: true, nom: true } },
        _count: { select: { appelsDeFonds: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = contrats.map((c) => ({
      ...c,
      soldeDisponible: c.budgetAnnuel - c.budgetUtilise,
      tauxUtilisation: c.budgetAnnuel > 0 ? Math.round((c.budgetUtilise / c.budgetAnnuel) * 100) : 0,
    }));

    return NextResponse.json(contrats);
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}