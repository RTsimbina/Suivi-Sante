import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { db } from "@/lib/db";
import { genererRapportMensuel, type ReportData } from "@/lib/generate-report";
import { round2 } from "@/lib/kpi-queries";

const MOIS_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mois = parseInt(searchParams.get("mois") || String(new Date().getMonth() + 1));
    const annee = parseInt(searchParams.get("annee") || String(new Date().getFullYear()));

    const societe = await db.societe.findUnique({
      where: { id },
      include: { contrats: { include: { appelsDeFonds: { select: { montant: true } } } } },
    });
    if (!societe) return NextResponse.json({ error: "Société non trouvée" }, { status: 404 });

    const start = new Date(annee, mois - 1, 1);
    const end = new Date(annee, mois, 1);
    const where = { societeId: id, dateReception: { gte: start, lt: end } };

    // 3 parallel queries instead of 1 unbounded findMany + dead query
    const [sums, statutRows, benefRows] = await Promise.all([
      db.dossier.aggregate({
        _sum: { montantReclame: true, montantPaye: true, montantValide: true },
        _count: true,
        where,
      }),
      db.dossier.groupBy({
        by: ["statut"],
        _count: { statut: true },
        where,
      }),
      // Per-beneficiaire breakdown via raw SQL
      db.$queryRaw<
        { nom: string; nb_dossiers: bigint; montant: number }[]
      >`
        SELECT COALESCE(CONCAT(a.prenom, ' ', a.nom), d."beneficiaire") AS nom,
               COUNT(*)::bigint                                                    AS nb_dossiers,
               ROUND(SUM(COALESCE(d."montantValide", d."montantReclame")), 2)      AS montant
        FROM "Dossier" d
        LEFT JOIN "Assure" a ON d."assureId" = a.id
        WHERE d."societeId" = ${id}
          AND d."dateReception" >= ${start}
          AND d."dateReception" <  ${end}
        GROUP BY COALESCE(CONCAT(a.prenom, ' ', a.nom), d."beneficiaire")
        ORDER BY montant DESC
      `,
    ]);

    const statutMap = Object.fromEntries(statutRows.map((r) => [r.statut, r._count.statut]));
    const totalRejetes = statutMap["REJETE"] || 0;

    const depensesParBeneficiaire = benefRows.map((r) => ({
      nom: r.nom,
      nbDossiers: Number(r.nb_dossiers),
      montant: r.montant,
    }));

    const contratsData = societe.contrats.map((c) => {
      const utilise = c.appelsDeFonds.reduce((s: number, a) => s + (Number(a.montant) || 0), 0);
      return {
        reference: c.reference,
        budgetAnnuel: c.budgetAnnuel,
        budgetUtilise: utilise,
        solde: c.budgetAnnuel - utilise,
        statut: c.statut,
      };
    });

    const data: ReportData = {
      periode: `${MOIS_NOMS[mois - 1]} ${annee} — ${societe.nom}`,
      direction: {
        totalRecus: sums._count,
        totalTraites: (statutMap["VALIDE"] || 0) + totalRejetes + (statutMap["PAYE"] || 0),
        totalPayes: statutMap["PAYE"] || 0,
        totalRejetes,
        delaiMoyenGlobal: 0,
        montantTotalReclame: Math.round(sums._sum.montantReclame || 0),
        montantTotalPaye: Math.round(sums._sum.montantPaye || 0),
        tauxRejet: sums._count > 0 ? Math.round((totalRejetes / sums._count) * 100) : 0,
      },
      parSociete: [{
        societeNom: societe.nom,
        nbDossiers: sums._count,
        montantReclame: Math.round(sums._sum.montantReclame || 0),
        montantPaye: Math.round(sums._sum.montantPaye || 0),
      }],
      volumeMensuel: [],
      dateGeneration: new Date().toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" }),
    };

    const pdfBuffer = await genererRapportMensuel(data);
    const filename = `rapport-${societe.nom.replace(/\s+/g, "_")}-${annee}-${String(mois).padStart(2, "0")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (error) {
    console.error("[RAPPORT ENTREPRISE] Erreur:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}