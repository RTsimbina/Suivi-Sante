import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { callLLM } from "@/lib/llm";
import {
  getStatutCounts, getTotalSums, getSocieteBreakdown, getAvgDelaiPaiement, round2,
} from "@/lib/kpi-queries";
import { db } from "@/lib/db";

const MS_DAY = 86_400_000;

async function buildKpiContext(): Promise<string> {
  const [statuts, sums, societeBreakdown, delaiMoyen] = await Promise.all([
    getStatutCounts(),
    getTotalSums(),
    getSocieteBreakdown(),
    getAvgDelaiPaiement(),
  ]);

  const c = (s: string) => statuts[s] || 0;
  const total = sums.total;
  const totalRecus = c("RECU");
  const totalPayes = c("PAYE");
  const totalRejetes = c("REJETE");
  const tauxRejet = total > 0 ? round2((totalRejetes / total) * 100) : 0;

  const societeLines = societeBreakdown
    .map(
      (s) =>
        `  - ${s.societeNom}: ${s.nbDossiers} dossiers, ${s.montantReclame.toLocaleString("fr-FR")} Ar réclamés, ${s.montantPaye.toLocaleString("fr-FR")} Ar payés`
    )
    .join("\n");

  // Retards — 3 targeted count queries
  const NOW = new Date();
  const [retardsReception, retardsTechnique, retardsCompta] = await Promise.all([
    db.dossier.count({ where: { statut: "RECU", dateReception: { lt: new Date(NOW.getTime() - 5 * MS_DAY) } } }),
    db.dossier.count({ where: { statut: { in: ["EN_ANALYSE", "VALIDE"] }, dateTraitementTechnique: { lt: new Date(NOW.getTime() - 5 * MS_DAY) } } }),
    db.dossier.count({ where: { statut: "EN_PAIEMENT", dateReceptionDecompte: { lt: new Date(NOW.getTime() - 5 * MS_DAY) } } }),
  ]);

  const aujourd = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `Données Suivi Santé — Tableau de bord (au ${aujourd}):

RÉSUMÉ GLOBAL:
- Total dossiers: ${total}
- En attente (RECU): ${totalRecus}
- En analyse: ${c("EN_ANALYSE")}
- Validés: ${c("VALIDE")}
- En paiement: ${c("EN_PAIEMENT")}
- Payés: ${totalPayes}
- Rejetés: ${totalRejetes}
- Taux de rejet: ${tauxRejet}%
- Délai moyen global (réception → paiement): ${delaiMoyen} jours
- Montant total réclamé: ${sums.montantReclame.toLocaleString("fr-FR")} Ar
- Montant total payé: ${sums.montantPaye.toLocaleString("fr-FR")} Ar

PAR SOCIÉTÉ:
${societeLines}

RETARDS EN COURS:
- Réception: ${retardsReception} dossiers en retard
- Technique: ${retardsTechnique} dossiers en retard
- Comptabilité: ${retardsCompta} dossiers en retard

Instructions: Réponds en français de manière concise et professionnelle. Base tes réponses uniquement sur les données fournies. Si une question demande des données non disponibles, indique-le.`;
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const body = await request.json();
    const { question } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { erreur: "Le champ 'question' est requis" },
        { status: 400 }
      );
    }

    const context = await buildKpiContext();

    const systemPrompt = `Tu es un assistant IA spécialisé dans l'analyse des dossiers de gestion pour Suivi Santé, une plateforme de traitement des dossiers de soins de santé à Madagascar.

Tu aides les gestionnaires et directeurs à comprendre les performances de leur service de traitement des dossiers médicaux. Tu as accès aux données en temps réel du système. Les montants sont en Ariary (Ar).

${context}`;

    const content = await callLLM(systemPrompt, question);

    if (!content) {
      return NextResponse.json(
        { erreur: "Service IA non configuré. Ajoutez LLM_BASE_URL et LLM_API_KEY dans les variables d'environnement." },
        { status: 503 }
      );
    }

    return NextResponse.json({ reponse: content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CHAT] Error:", msg, error);
    return NextResponse.json(
      { erreur: "Erreur lors du traitement de la question", detail: msg },
      { status: 500 }
    );
  }
}