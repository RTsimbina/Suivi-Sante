import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { db } from "@/lib/db";
import { genererRapportMensuel, ReportData } from "@/lib/generate-report";
import { envoyerEmail } from "@/lib/email";

const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function diffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

async function buildReportData(mois: number, annee: number): Promise<ReportData> {
  const allDossiers = await db.dossier.findMany({
    include: {
      societe: true,
      gestionnaireAccueil: true,
      gestionnaireTechnique: true,
      gestionnaireCompta: true,
    },
  });

  // ─── Direction KPIs ────────────────────────────────────────
  const totalRecus = allDossiers.filter((d) => d.statut === "RECU").length;
  const totalTraites = allDossiers.filter(
    (d) => d.statut === "VALIDE" || d.statut === "REJETE" || d.statut === "PAYE"
  ).length;
  const totalPayes = allDossiers.filter((d) => d.statut === "PAYE").length;
  const totalRejetes = allDossiers.filter((d) => d.statut === "REJETE").length;

  const payeDossiers = allDossiers.filter(
    (d) => d.statut === "PAYE" && d.datePaiement && d.dateReception
  );
  const delaiMoyenGlobal =
    payeDossiers.length > 0
      ? round2(
          payeDossiers.reduce(
            (sum, d) => sum + diffDays(d.datePaiement!, d.dateReception),
            0
          ) / payeDossiers.length
        )
      : 0;

  const montantTotalReclame = round2(
    allDossiers.reduce((s, d) => s + d.montantReclame, 0)
  );
  const montantTotalPaye = round2(
    allDossiers.reduce((s, d) => s + (d.montantPaye || 0), 0)
  );
  const tauxRejet =
    allDossiers.length > 0
      ? round2((totalRejetes / allDossiers.length) * 100)
      : 0;

  // ─── Par Société ──────────────────────────────────────────
  const societeMap = new Map<string, { nom: string; dossiers: typeof allDossiers }>();
  for (const d of allDossiers) {
    if (!societeMap.has(d.societeId)) {
      societeMap.set(d.societeId, { nom: d.societe.nom, dossiers: [] });
    }
    societeMap.get(d.societeId)!.dossiers.push(d);
  }

  const parSociete = Array.from(societeMap.values()).map((s) => ({
    societeNom: s.nom,
    nbDossiers: s.dossiers.length,
    montantReclame: round2(s.dossiers.reduce((sum, d) => sum + d.montantReclame, 0)),
    montantPaye: round2(s.dossiers.reduce((sum, d) => sum + (d.montantPaye || 0), 0)),
  }));

  // ─── Volume Mensuel ───────────────────────────────────────
  const monthlyMap = new Map<string, number>();
  for (let m = 1; m <= 12; m++) {
    const key = `${annee}-${String(m).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const d of allDossiers) {
    const dYear = d.dateReception.getFullYear();
    const dMonth = d.dateReception.getMonth() + 1;
    if (dYear === annee) {
      const key = `${annee}-${String(dMonth).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
    }
  }
  const volumeMensuel = Array.from(monthlyMap.entries()).map(([mois, nbDossiers]) => ({
    mois,
    nbDossiers,
  }));

  const periode = `${MOIS_NOMS[mois - 1]} ${annee}`;

  return {
    periode,
    direction: {
      totalRecus,
      totalTraites,
      totalPayes,
      totalRejetes,
      delaiMoyenGlobal,
      montantTotalReclame,
      montantTotalPaye,
      tauxRejet,
    },
    parSociete,
    volumeMensuel,
    dateGeneration: new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' }),
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

    // Envoyer par email si destinataires fournis
    if (destinataires && destinataires.length > 0) {
      const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
      try {
        await envoyerEmail({
          destinataires,
          sujet: `Suivi Santé — Rapport Mensuel ${data.periode}`,
          texte: `Veuillez trouver ci-joint le rapport mensuel Suivi Santé pour la période ${data.periode}.`,
          attachments: [
            {
              filename,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (emailError) {
        console.error("[REPORT] Erreur envoi email:", emailError);
        // On continue quand même à renvoyer le PDF
      }
    }

    const filename = `rapport-suivi-sante-${annee}-${String(mois).padStart(2, "0")}.pdf`;
    return new NextResponse(pdfBuffer, {
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
    return new NextResponse(pdfBuffer, {
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