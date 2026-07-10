import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import SDK from "z-ai-web-dev-sdk";
import fs from "fs";

let _sdk: InstanceType<typeof SDK> | null = null;
function getLLM(): InstanceType<typeof SDK> | null {
  if (!_sdk) {
    try {
      const configPath = '/etc/.z-ai-config';
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        _sdk = new SDK(config);
      } else if (process.env.ZAI_API_KEY) {
        _sdk = new SDK({ apiKey: process.env.ZAI_API_KEY });
      }
    } catch (e) {
      console.error('[CHAT] Erreur chargement SDK:', e);
    }
  }
  return _sdk;
}

function diffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

async function buildKpiContext(): Promise<string> {
  const allDossiers = await db.dossier.findMany({
    include: {
      societe: true,
      gestionnaireAccueil: true,
      gestionnaireTechnique: true,
      gestionnaireCompta: true,
    },
  });

  const total = allDossiers.length;
  const totalRecus = allDossiers.filter((d) => d.statut === "RECU").length;
  const totalPayes = allDossiers.filter((d) => d.statut === "PAYE").length;
  const totalRejetes = allDossiers.filter((d) => d.statut === "REJETE").length;
  const enAnalyse = allDossiers.filter((d) => d.statut === "EN_ANALYSE").length;
  const valides = allDossiers.filter((d) => d.statut === "VALIDE").length;
  const enPaiement = allDossiers.filter((d) => d.statut === "EN_PAIEMENT").length;

  const payeDossiers = allDossiers.filter(
    (d) => d.statut === "PAYE" && d.datePaiement && d.dateReception
  );
  const delaiMoyen =
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
    total > 0 ? round2((totalRejetes / total) * 100) : 0;

  // Per-societe breakdown
  const societeMap = new Map<string, { nom: string; count: number; montantReclame: number; montantPaye: number }>();
  for (const d of allDossiers) {
    if (!societeMap.has(d.societeId)) {
      societeMap.set(d.societeId, { nom: d.societe.nom, count: 0, montantReclame: 0, montantPaye: 0 });
    }
    const s = societeMap.get(d.societeId)!;
    s.count++;
    s.montantReclame += d.montantReclame;
    s.montantPaye += d.montantPaye || 0;
  }
  const societeLines = Array.from(societeMap.values())
    .sort((a, b) => b.count - a.count)
    .map(
      (s) =>
        `  - ${s.nom}: ${s.count} dossiers, ${round2(s.montantReclame)} DA réclamés, ${round2(s.montantPaye)} DA payés`
    )
    .join("\n");

  // Retard info
  const NOW = new Date();
  const retardsReception = allDossiers.filter(
    (d) => d.statut === "RECU" && diffDays(NOW, d.dateReception) > 5
  ).length;
  const retardsTechnique = allDossiers.filter(
    (d) =>
      (d.statut === "EN_ANALYSE" || d.statut === "VALIDE") &&
      d.dateTraitementTechnique &&
      diffDays(NOW, d.dateTraitementTechnique) > 5
  ).length;
  const retardsCompta = allDossiers.filter(
    (d) =>
      d.statut === "EN_PAIEMENT" &&
      d.dateReceptionDecompte &&
      diffDays(NOW, d.dateReceptionDecompte) > 5
  ).length;

  const aujourd = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Données Suivi Santé — Tableau de bord (au ${aujourd}):

RÉSUMÉ GLOBAL:
- Total dossiers: ${total}
- En attente (RECU): ${totalRecus}
- En analyse: ${enAnalyse}
- Validés: ${valides}
- En paiement: ${enPaiement}
- Payés: ${totalPayes}
- Rejetés: ${totalRejetes}
- Taux de rejet: ${tauxRejet}%
- Délai moyen global (réception → paiement): ${delaiMoyen} jours
- Montant total réclamé: ${montantTotalReclame} DA
- Montant total payé: ${montantTotalPaye} DA

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
        { error: "Le champ 'question' est requis" },
        { status: 400 }
      );
    }

    // 1. Fetch KPI data and build context
    const context = await buildKpiContext();

    // 2. Build system prompt with context
    const systemPrompt = `Tu es un assistant IA spécialisé dans l'analyse des dossiers de gestion pour Suivi Santé, une plateforme de traitement des dossiers de soins de santé en Algérie.

Tu aides les gestionnaires et directeurs à comprendre les performances de leur service de traitement des dossiers médicaux. Tu as accès aux données en temps réel du système.

${context}`;

    // 3. Call LLM
    const llm = getLLM();
    if (!llm) {
      return NextResponse.json(
        { error: "Service IA temporairement indisponible" },
        { status: 503 }
      );
    }
    const result = await llm.createChatCompletion({
      model: "glm-4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });

    // 4. Return response
    const content = result?.choices?.[0]?.message?.content || result?.output?.text || "Désolé, je n'ai pas pu générer de réponse.";
    return NextResponse.json({
      reponse: content,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la question" },
      { status: 500 }
    );
  }
}