import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";

const NOW = new Date();

function diffDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
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
        justificatifs: {
          select: { id: true },
        },
      },
    });

    // ─── RETARDS ───────────────────────────────────────────────
    const retards: {
      numeroDossier: string;
      beneficiaire: string;
      statut: string;
      joursRetard: number;
      serviceEnCause: string;
    }[] = [];

    // RECU for > 5 days from dateReception
    for (const d of allDossiers) {
      if (d.statut === "RECU") {
        const jours = diffDays(NOW, d.dateReception);
        if (jours > 5) {
          retards.push({
            numeroDossier: d.numeroDossier,
            beneficiaire: d.beneficiaire,
            statut: d.statut,
            joursRetard: jours - 5,
            serviceEnCause: "RECEPTION",
          });
        }
      }

      // EN_ANALYSE for > 10 days since dateTraitementTechnique
      if (d.statut === "EN_ANALYSE" && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 10) {
          retards.push({
            numeroDossier: d.numeroDossier,
            beneficiaire: d.beneficiaire,
            statut: d.statut,
            joursRetard: jours - 10,
            serviceEnCause: "TECHNIQUE",
          });
        }
      }

      // VALIDE for > 5 days since dateTraitementTechnique (should have moved to EN_PAIEMENT)
      if (d.statut === "VALIDE" && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 5) {
          retards.push({
            numeroDossier: d.numeroDossier,
            beneficiaire: d.beneficiaire,
            statut: d.statut,
            joursRetard: jours - 5,
            serviceEnCause: "TECHNIQUE",
          });
        }
      }

      // EN_PAIEMENT for > 5 days since dateReceptionDecompte
      if (d.statut === "EN_PAIEMENT" && d.dateReceptionDecompte) {
        const jours = diffDays(NOW, d.dateReceptionDecompte);
        if (jours > 5) {
          retards.push({
            numeroDossier: d.numeroDossier,
            beneficiaire: d.beneficiaire,
            statut: d.statut,
            joursRetard: jours - 5,
            serviceEnCause: "COMPTABILITE",
          });
        }
      }
    }

    // Sort by joursRetard descending
    retards.sort((a, b) => b.joursRetard - a.joursRetard);

    // ─── ANOMALIES ─────────────────────────────────────────────
    const anomalies: {
      numeroDossier: string;
      typeAnomalie: string;
      details: string;
    }[] = [];

    for (const d of allDossiers) {
      // montantPaye differs from montantValide by more than 10%
      if (
        d.montantPaye !== null &&
        d.montantPaye !== undefined &&
        d.montantValide !== null &&
        d.montantValide !== undefined &&
        d.montantValide > 0
      ) {
        const ecart = Math.abs(d.montantPaye - d.montantValide) / d.montantValide;
        if (ecart > 0.1) {
          anomalies.push({
            numeroDossier: d.numeroDossier,
            typeAnomalie: "ECART_MONTANT",
            details: `Montant validé: ${d.montantValide} DA, montant payé: ${d.montantPaye} DA (écart de ${Math.round(ecart * 100)}%)`,
          });
        }
      }

      // statut VALIDE but no dateReceptionDecompte for > 15 days
      if (d.statut === "VALIDE" && !d.dateReceptionDecompte) {
        // Check how long since dateTraitementTechnique
        if (d.dateTraitementTechnique) {
          const jours = diffDays(NOW, d.dateTraitementTechnique);
          if (jours > 15) {
            anomalies.push({
              numeroDossier: d.numeroDossier,
              typeAnomalie: "DECOMPTE_MANQUANT",
              details: `Dossier validé depuis ${jours} jours sans réception de décompte. Service comptabilité en attente.`,
            });
          }
        }
      }
    }

    // ─── PIÈCES JUSTIFICATIVES MANQUANTES ──────────────────────
    const piecesManquantes: {
      numeroDossier: string;
      beneficiaire: string;
      societeNom: string;
      joursEnAnalyse: number;
    }[] = [];

    for (const d of allDossiers) {
      // Dossiers en analyse depuis >3 jours sans aucun justificatif
      if (d.statut === "EN_ANALYSE" && d.dateTraitementTechnique) {
        const jours = diffDays(NOW, d.dateTraitementTechnique);
        if (jours > 3 && (!d.justificatifs || d.justificatifs.length === 0)) {
          piecesManquantes.push({
            numeroDossier: d.numeroDossier,
            beneficiaire: d.beneficiaire,
            societeNom: d.societe.nom,
            joursEnAnalyse: jours,
          });
        }
      }
    }

    // Sort by joursEnAnalyse descending
    piecesManquantes.sort((a, b) => b.joursEnAnalyse - a.joursEnAnalyse);

    // ─── INCOHÉRENCES DE TRAITEMENT ────────────────────────────
    const incoherences: {
      numeroDossier: string;
      typeIncoherence: string;
      description: string;
    }[] = [];

    for (const d of allDossiers) {
      // Dossier PAYE mais montantPaye = 0 or null
      if (d.statut === "PAYE" && (!d.montantPaye || d.montantPaye === 0)) {
        incoherences.push({
          numeroDossier: d.numeroDossier,
          typeIncoherence: "PAYE_SANS_MONTANT",
          description: `Dossier marqué comme payé mais sans montant de paiement renseigné.`,
        });
      }

      // Dossier EN_PAIEMENT but no dateReceptionDecompte
      if (d.statut === "EN_PAIEMENT" && !d.dateReceptionDecompte) {
        incoherences.push({
          numeroDossier: d.numeroDossier,
          typeIncoherence: "PAIEMENT_SANS_DECOMPTE",
          description: `Dossier en paiement mais aucune date de réception de décompte n'est renseignée.`,
        });
      }

      // Dossier VALIDE but no montantValide
      if (d.statut === "VALIDE" && (!d.montantValide || d.montantValide === 0)) {
        incoherences.push({
          numeroDossier: d.numeroDossier,
          typeIncoherence: "VALIDE_SANS_MONTANT",
          description: `Dossier marqué comme validé mais sans montant validé renseigné.`,
        });
      }

      // Dossier REJETE but no motifRejet
      if (d.statut === "REJETE" && (!d.motifRejet || d.motifRejet.trim() === "")) {
        incoherences.push({
          numeroDossier: d.numeroDossier,
          typeIncoherence: "REJET_SANS_MOTIF",
          description: `Dossier rejeté sans motif de rejet renseigné.`,
        });
      }

      // datePaiement < dateReception (impossible)
      if (d.datePaiement && d.dateReception) {
        if (d.datePaiement < d.dateReception) {
          incoherences.push({
            numeroDossier: d.numeroDossier,
            typeIncoherence: "DATE_INCOHERENTE",
            description: `La date de paiement (${d.datePaiement.toISOString().split("T")[0]}) est antérieure à la date de réception (${d.dateReception.toISOString().split("T")[0]}).`,
          });
        }
      }
    }

    // Sort by type then numeroDossier
    incoherences.sort((a, b) => a.typeIncoherence.localeCompare(b.typeIncoherence) || a.numeroDossier.localeCompare(b.numeroDossier));

    // ─── PREVISIONS ────────────────────────────────────────────
    // Volume attendu: projected monthly volume based on average so far (months 1-6 of 2026)
    const months2026 = new Map<string, number>();
    for (let m = 1; m <= 12; m++) {
      months2026.set(`2026-${String(m).padStart(2, "0")}`, 0);
    }

    for (const d of allDossiers) {
      const year = d.dateReception.getFullYear();
      const month = d.dateReception.getMonth() + 1;
      if (year === 2026) {
        const key = `2026-${String(month).padStart(2, "0")}`;
        months2026.set(key, (months2026.get(key) || 0) + 1);
      }
    }

    // Average volume for months 1-6
    let totalSoFar = 0;
    let monthsWithData = 0;
    for (let m = 1; m <= 6; m++) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      const count = months2026.get(key) || 0;
      if (count > 0) monthsWithData++;
      totalSoFar += count;
    }

    const volumeMoyenMensuel =
      monthsWithData > 0 ? Math.round(totalSoFar / monthsWithData) : 0;
    const volumeAttendu = volumeMoyenMensuel;

    // Charge par gestionnaire
    const gestionnaireMap = new Map<
      string,
      { nom: string; service: string; dossiersActifs: number }
    >();

    for (const d of allDossiers) {
      // Only count active (non-terminal) dossiers
      if (d.statut === "PAYE" || d.statut === "REJETE") continue;

      if (d.gestionnaireAccueilId && d.gestionnaireAccueil) {
        const key = `ACCUEIL_${d.gestionnaireAccueilId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireAccueil.nom,
            service: "RECEPTION",
            dossiersActifs: 0,
          });
        }
        gestionnaireMap.get(key)!.dossiersActifs++;
      }
      if (d.gestionnaireTechniqueId && d.gestionnaireTechnique) {
        const key = `TECHNIQUE_${d.gestionnaireTechniqueId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireTechnique.nom,
            service: "TECHNIQUE",
            dossiersActifs: 0,
          });
        }
        gestionnaireMap.get(key)!.dossiersActifs++;
      }
      if (d.gestionnaireComptaId && d.gestionnaireCompta) {
        const key = `COMPTA_${d.gestionnaireComptaId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireCompta.nom,
            service: "COMPTABILITE",
            dossiersActifs: 0,
          });
        }
        gestionnaireMap.get(key)!.dossiersActifs++;
      }
    }

    const chargeParGestionnaire = Array.from(gestionnaireMap.values()).map(
      (g) => ({
        nom: g.nom,
        service: g.service,
        dossiersActifs: g.dossiersActifs,
        chargeEstimee: g.dossiersActifs + volumeMoyenMensuel,
      })
    );

    // Risque retard: percentage of dossiers currently in delay
    const totalNonTerminal = allDossiers.filter(
      (d) => d.statut !== "PAYE" && d.statut !== "REJETE"
    ).length;
    const risqueRetard =
      totalNonTerminal > 0
        ? Math.round((retards.length / totalNonTerminal) * 100)
        : 0;

    return NextResponse.json({
      retards,
      anomalies,
      piecesManquantes,
      incoherences,
      previsions: {
        volumeAttendu,
        chargeParGestionnaire,
        risqueRetard,
      },
    });
  } catch (error) {
    console.error("Error fetching IA analysis:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'analyse IA" },
      { status: 500 }
    );
  }
}