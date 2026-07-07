import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { db } from "@/lib/db";
import { genererRapportMensuel, type ReportData } from "@/lib/generate-report";

const MOIS_NOMS = ["Janvier", "F\u00e9vrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Ao\u00fbt", "Septembre", "Octobre", "Novembre", "D\u00e9cembre"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mois = parseInt(searchParams.get("mois") || String(new Date().getMonth() + 1));
    const annee = parseInt(searchParams.get("annee") || String(new Date().getFullYear()));

    const societe = await db.societe.findUnique({ where: { id }, include: { contrats: true } });
    if (!societe) return NextResponse.json({ error: "Soci\u00e9t\u00e9 non trouv\u00e9e" }, { status: 404 });

    const dossiers = await db.dossier.findMany({
      where: { societeId: id, dateReception: { gte: new Date(annee, mois - 1, 1), lt: new Date(annee, mois, 1) } },
      include: { assure: true },
    });

    const appels = await db.appelDeFonds.findMany({
      where: { contrat: { societeId: id } },
      include: { contrat: true },
    });

    const totalReclame = dossiers.reduce((s, d) => s + d.montantReclame, 0);
    const totalPaye = dossiers.reduce((s, d) => s + (d.montantPaye || 0), 0);
    const totalValide = dossiers.reduce((s, d) => s + (d.montantValide || 0), 0);

    // Dépenses par bénéficiaire
    const benefMap = new Map<string, { nom: string; nbDossiers: number; montant: number }>();
    for (const d of dossiers) {
      const nom = d.assure ? `${d.assure.prenom || ""} ${d.assure.nom}`.trim() : d.beneficiaire;
      if (!benefMap.has(nom)) benefMap.set(nom, { nom, nbDossiers: 0, montant: 0 });
      const entry = benefMap.get(nom)!;
      entry.nbDossiers++;
      entry.montant += d.montantValide || d.montantReclame;
    }
    const depensesParBeneficiaire = Array.from(benefMap.values()).sort((a, b) => b.montant - a.montant);

    // Solde des contrats
    const contratsData = societe.contrats.map(c => ({
      reference: c.reference,
      budgetAnnuel: c.budgetAnnuel,
      budgetUtilise: c.budgetUtilise,
      solde: c.budgetAnnuel - c.budgetUtilise,
      statut: c.statut,
    }));

    const data: ReportData = {
      periode: `${MOIS_NOMS[mois - 1]} ${annee} — ${societe.nom}`,
      direction: {
        totalRecus: dossiers.length,
        totalTraites: dossiers.filter(d => ["VALIDE", "REJETE", "PAYE"].includes(d.statut)).length,
        totalPayes: dossiers.filter(d => d.statut === "PAYE").length,
        totalRejetes: dossiers.filter(d => d.statut === "REJETE").length,
        delaiMoyenGlobal: 0,
        montantTotalReclame: Math.round(totalReclame),
        montantTotalPaye: Math.round(totalPaye),
        tauxRejet: dossiers.length > 0 ? Math.round((dossiers.filter(d => d.statut === "REJETE").length / dossiers.length) * 100) : 0,
      },
      parSociete: [{ societeNom: societe.nom, nbDossiers: dossiers.length, montantReclame: Math.round(totalReclame), montantPaye: Math.round(totalPaye) }],
      volumeMensuel: [],
      dateGeneration: new Date().toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" }),
    };

    const pdfBuffer = await genererRapportMensuel(data);
    const filename = `rapport-${societe.nom.replace(/\s+/g, "_")}-${annee}-${String(mois).padStart(2, "0")}.pdf`;
    return new NextResponse(pdfBuffer, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    console.error("[RAPPORT ENTREPRISE] Erreur:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}