import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { genererRapportMensuel, type ReportData } from "@/lib/generate-report";
import { envoyerCourriel } from "@/lib/mail";
import { parseJsonBody } from "@/lib/validation/parse";
import { rapportMensuelSchema } from "@/lib/validation";
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

    // ─── Validation Zod centralisée (mois 1-12, année, emails destinataires) ─
    const parsed = await parseJsonBody(request, rapportMensuelSchema);
    if (!parsed.success) return parsed.response;
    const { mois, annee, destinataires } = parsed.data;

    const data = await buildReportData(mois, annee);
    const pdfBuffer = await genererRapportMensuel(data);

    if (destinataires && destinataires.length > 0) {
      // Emails validés et limités à 20 par le schéma Zod
      const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
      // Envoi via le service de messagerie centralisé (file d'attente + retry + suivi)
      const resultatEnvoi = await envoyerCourriel({
        destinataires,
        sujet: `Suivi Santé — Rapport Mensuel ${data.periode}`,
        texte: `Veuillez trouver ci-joint le rapport mensuel Suivi Santé pour la période ${data.periode}.`,
        piecesJointes: [{
          nom: filename,
          contenuBase64: Buffer.from(pdfBuffer).toString("base64"),
          contentType: "application/pdf",
        }],
        categorie: "RAPPORT_PDF",
        priorite: 4,
        source: "reporting/rapport",
        traiter: true,
      });
      if (!resultatEnvoi.accepte) {
        console.error("[REPORT] Envoi refusé par le service de messagerie:", resultatEnvoi.motif);
      } else if (resultatEnvoi.envoi?.livraison && !resultatEnvoi.envoi.livraison.ok) {
        console.warn("[REPORT] Livraison différée (restée en file):", resultatEnvoi.envoi.livraison.erreur);
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