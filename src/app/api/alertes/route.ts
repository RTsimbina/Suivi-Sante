import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

const NOW = new Date();

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const allDossiers = await db.dossier.findMany({
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
        justificatifs: { select: { id: true } },
      },
    });

    // ─── RETARDS ───────────────────────────────────────────────
    const retards: { numeroDossier: string; beneficiaire: string; statut: string; joursRetard: number; serviceEnCause: string }[] = [];

    for (const d of allDossiers) {
      if (d.statut === "RECU") {
        const jours = diffDays(NOW, d.dateReception);
        if (jours > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "RECEPTION" });
      }
      if (d.statut === "EN_ANALYSE" && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 10) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 10, serviceEnCause: "TECHNIQUE" });
      }
      if (d.statut === "VALIDE" && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "TECHNIQUE" });
      }
      if (d.statut === "EN_PAIEMENT" && d.dateReceptionDecompte) {
        const jours = diffDays(NOW, d.dateReceptionDecompte);
        if (jours > 5) retards.push({ numeroDossier: d.numeroDossier, beneficiaire: d.beneficiaire, statut: d.statut, joursRetard: jours - 5, serviceEnCause: "COMPTABILITE" });
      }
    }
    retards.sort((a, b) => b.joursRetard - a.joursRetard);

    // ─── ANOMALIES (incluant montants négatifs) ────────────────
    const anomalies: { numeroDossier: string; typeAnomalie: string; details: string }[] = [];
    for (const d of allDossiers) {
      if (d.montantPaye !== null && d.montantPaye !== undefined && d.montantValide !== null && d.montantValide !== undefined && d.montantValide > 0) {
        const ecart = Math.abs(d.montantPaye - d.montantValide) / d.montantValide;
        if (ecart > 0.1) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "ECART_MONTANT", details: `Montant valid\u00e9: ${d.montantValide} Ar, pay\u00e9: ${d.montantPaye} Ar (\u00e9cart ${Math.round(ecart * 100)}%)` });
      }
      if (d.statut === "VALIDE" && !d.dateReceptionDecompte && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 15) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "DECOMPTE_MANQUANT", details: `Valid\u00e9 depuis ${jours} jours sans d\u00e9compte.` });
      }
      if (d.montantReclame < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant r\u00e9clam\u00e9 n\u00e9gatif: ${d.montantReclame} Ar` });
      if (d.montantValide !== null && d.montantValide !== undefined && d.montantValide < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant valid\u00e9 n\u00e9gatif: ${d.montantValide} Ar` });
      if (d.montantPaye !== null && d.montantPaye !== undefined && d.montantPaye < 0) anomalies.push({ numeroDossier: d.numeroDossier, typeAnomalie: "MONTANT_NEGATIF", details: `Montant pay\u00e9 n\u00e9gatif: ${d.montantPaye} Ar` });
    }

    // ─── DOUBLONS ──────────────────────────────────────────────
    const doublons: { numeroDossier1: string; numeroDossier2: string; beneficiaire: string; motif: string }[] = [];
    for (let i = 0; i < allDossiers.length; i++) {
      for (let j = i + 1; j < allDossiers.length; j++) {
        const a = allDossiers[i], b = allDossiers[j];
        const sameBenef = a.beneficiaire.toLowerCase().trim() === b.beneficiaire.toLowerCase().trim();
        const sameSociete = a.societeId === b.societeId;
        const sameType = a.typeDossier === b.typeDossier;
        const sameDate = a.dateSoins && b.dateSoins && a.dateSoins.toISOString().split("T")[0] === b.dateSoins.toISOString().split("T")[0];
        const sameMontant = a.montantReclame === b.montantReclame && a.montantReclame > 0;
        let motif = "";
        if (sameBenef && sameSociete && sameType && sameDate) motif = "M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et date de soins";
        else if (sameBenef && sameSociete && sameType && sameMontant) motif = "M\u00eame b\u00e9n\u00e9ficiaire, soci\u00e9t\u00e9, type et montant";
        if (motif) doublons.push({ numeroDossier1: a.numeroDossier, numeroDossier2: b.numeroDossier, beneficiaire: a.beneficiaire, motif });
      }
    }

    // ─── INCOHÉRENCES ──────────────────────────────────────────
    const incoherences: { numeroDossier: string; typeIncoherence: string; description: string }[] = [];
    for (const d of allDossiers) {
      if (d.statut === "PAYE" && (!d.montantPaye || d.montantPaye === 0)) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "PAYE_SANS_MONTANT", description: "Pay\u00e9 sans montant" });
      if (d.statut === "EN_PAIEMENT" && !d.dateReceptionDecompte) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "PAIEMENT_SANS_DECOMPTE", description: "En paiement sans d\u00e9compte" });
      if (d.statut === "VALIDE" && (!d.montantValide || d.montantValide === 0)) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "VALIDE_SANS_MONTANT", description: "Valid\u00e9 sans montant" });
      if (d.statut === "REJETE" && (!d.motifRejet || d.motifRejet.trim() === "")) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "REJET_SANS_MOTIF", description: "Rejet\u00e9 sans motif" });
      if (d.datePaiement && d.dateReception && d.datePaiement < d.dateReception) incoherences.push({ numeroDossier: d.numeroDossier, typeIncoherence: "DATE_INCOHERENTE", description: "Date paiement ant\u00e9rieure \u00e0 la r\u00e9ception" });
    }

    return NextResponse.json({
      retards,
      anomalies,
      doublons,
      incoherences,
      totalAlertes: retards.length + anomalies.length + doublons.length + incoherences.length,
    });
  } catch (error) {
    console.error("Error fetching alertes:", error);
    return NextResponse.json({ error: "Erreur lors de la r\u00e9cup\u00e9ration des alertes" }, { status: 500 });
  }
}