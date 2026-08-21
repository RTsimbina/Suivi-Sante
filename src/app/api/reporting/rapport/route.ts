import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { genererRapportMensuel, type ReportData } from "@/lib/generate-report";
import { envoyerEmail } from "@/lib/email";
import {
  getStatutCounts, getTotalSums, getSocieteBreakdown, getMonthlyVolume,
  getAvgDelaiPaiement, round2,
} from "@/lib/kpi-queries";

const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

async function buildReportData(mois: number, annee: number): Promise<ReportData> {
  // Filtrer les donnees par la periode demandee (mois/annee)
  const startDate = new Date(annee, mois - 1, 1);
  const endDate = new Date(annee, mois, 1); // premier jour du mois suivant
  const periodeFilter = { dateReception: { gte: startDate, lt: endDate } };

  const [statuts, sums, parSociete, volumeMensuel, delaiMoyenGlobal] = await Promise.all([
    getStatutCounts(periodeFilter),
    getTotalSums(periodeFilter),
    getSocieteBreakdown(periodeFilter),
    getMonthlyVolume(annee),
    getAvgDelaiPaiement(),
  ]);

  const c = (s: string) => statuts[s] || 0;
  const totalRejetes = c("REJETE");
  const tauxRejet = sums.total > 0 ? round2((totalRejetes / sums.total) * 100) : 0;

  return {
    periode: `${MOIS_NOMS[mois - 1]} ${annee}`,
    direction: {
      totalRecus: c("RECU"),
      totalTraites: c("VALIDE") + c("PAYE"),
      totalPayes: c("PAYE"),
      totalRejetes,
      delaiMoyenGlobal,
      montantTotalReclame: sums.montantReclame,
      montantTotalPaye: sums.montantPaye,
      tauxRejet,
    },
    parSociete,
    volumeMensuel,
    dateGeneration: new Date().toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { mois, annee, destinataires } = body as {
      mois: number;
      annee: number;
      destinataires?: string[];
    };

    if (!mois || !annee || mois < 1 || mois > 12) {
      return NextResponse.json(
        { erreur: "Paramètres mois et annee requis (mois: 1-12)" },
        { status: 400 }
      );
    }

    const data = await buildReportData(mois, annee);
    const pdfBuffer = await genererRapportMensuel(data);

    if (destinataires && destinataires.length > 0) {
      // Valider les adresses email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = destinataires.filter((e: string) => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        return NextResponse.json(
          { erreur: `Adresses email invalides : ${invalidEmails.join(', ')}` },
          { status: 400 }
        );
      }
      if (destinataires.length > 20) {
        return NextResponse.json(
          { erreur: 'Maximum 20 destinataires autorises.' },
          { status: 400 }
        );
      }
      const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
      try {
        await envoyerEmail({
          destinataires,
          sujet: `Suivi Santé — Rapport Mensuel ${data.periode}`,
          texte: `Veuillez trouver ci-joint le rapport mensuel Suivi Santé pour la période ${data.periode}.`,
          attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
        });
      } catch (emailError) {
        console.error("[REPORT] Erreur envoi email:", emailError);
      }
    }

    const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[REPORT] Erreur:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la génération du rapport" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const now = new Date();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();

    const data = await buildReportData(mois, annee);
    const pdfBuffer = await genererRapportMensuel(data);

    const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[REPORT] Erreur:", error);
    return NextResponse.json(
      { erreur: "Erreur lors de la génération du rapport" },
      { status: 500 }
    );
  }
}