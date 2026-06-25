import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

function diffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export async function GET() {
  try {
    // Fetch all dossiers with relations for in-memory computation
    const allDossiers = await db.dossier.findMany({
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
    });

    // ─── DIRECTION ─────────────────────────────────────────────
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

    // ─── RECEPTION ─────────────────────────────────────────────
    const totalEnregistres = allDossiers.length;
    const transferts = allDossiers.filter(
      (d) => d.dateTraitementTechnique && d.dateReception
    );
    const tempsMoyenAvantTransfert =
      transferts.length > 0
        ? round2(
            transferts.reduce(
              (sum, d) =>
                sum + diffDays(d.dateTraitementTechnique!, d.dateReception),
              0
            ) / transferts.length
          )
        : 0;
    const enAttente = totalRecus;

    // ─── TECHNIQUE ─────────────────────────────────────────────
    const techStatuts = ["EN_ANALYSE", "VALIDE", "REJETE"];
    const totalAnalyses = allDossiers.filter((d) =>
      techStatuts.includes(d.statut)
    ).length;
    const totalValides = allDossiers.filter((d) => d.statut === "VALIDE")
      .length;
    const totalRejetesTech = allDossiers.filter(
      (d) => d.statut === "REJETE"
    ).length;
    const enCours = allDossiers.filter((d) => d.statut === "EN_ANALYSE")
      .length;

    const analysedDossiers = allDossiers.filter(
      (d) =>
        techStatuts.includes(d.statut) &&
        d.dateTraitementTechnique &&
        d.dateReception
    );
    const delaiMoyenAnalyse =
      analysedDossiers.length > 0
        ? round2(
            analysedDossiers.reduce(
              (sum, d) =>
                sum + diffDays(d.dateTraitementTechnique!, d.dateReception),
              0
            ) / analysedDossiers.length
          )
        : 0;

    const montantTotalValide = round2(
      allDossiers.reduce(
        (s, d) => s + (d.montantValide && d.statut === "VALIDE" ? d.montantValide : 0),
        0
      )
    );

    // ─── COMPTABILITE ──────────────────────────────────────────
    const decomptesRecus = allDossiers.filter(
      (d) => d.statut === "EN_PAIEMENT" || d.statut === "PAYE"
    ).length;
    const paiementsEffectues = totalPayes;
    const comptabiliteMontantTotalPaye = round2(
      allDossiers.filter((d) => d.statut === "PAYE").reduce((s, d) => s + (d.montantPaye || 0), 0)
    );
    const enCoursPaiement = allDossiers.filter(
      (d) => d.statut === "EN_PAIEMENT"
    ).length;

    // ─── PRODUCTIVITE ──────────────────────────────────────────
    // Group by each gestionnaire across all their relations
    const gestionnaireMap = new Map<
      string,
      {
        nom: string;
        service: string;
        dossiers: typeof allDossiers;
      }
    >();

    for (const d of allDossiers) {
      // Accueil
      if (d.gestionnaireAccueilId && d.gestionnaireAccueil) {
        const key = `ACCUEIL_${d.gestionnaireAccueilId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireAccueil.nom,
            service: "RECEPTION",
            dossiers: [],
          });
        }
        gestionnaireMap.get(key)!.dossiers.push(d);
      }
      // Technique
      if (d.gestionnaireTechniqueId && d.gestionnaireTechnique) {
        const key = `TECHNIQUE_${d.gestionnaireTechniqueId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireTechnique.nom,
            service: "TECHNIQUE",
            dossiers: [],
          });
        }
        gestionnaireMap.get(key)!.dossiers.push(d);
      }
      // Compta
      if (d.gestionnaireComptaId && d.gestionnaireCompta) {
        const key = `COMPTA_${d.gestionnaireComptaId}`;
        if (!gestionnaireMap.has(key)) {
          gestionnaireMap.set(key, {
            nom: d.gestionnaireCompta.nom,
            service: "COMPTABILITE",
            dossiers: [],
          });
        }
        gestionnaireMap.get(key)!.dossiers.push(d);
      }
    }

    const productivite = Array.from(gestionnaireMap.values()).map((g) => {
      const nbDossiers = g.dossiers.length;
      const montantTraite = round2(
        g.dossiers.reduce((s, d) => s + (d.montantValide || d.montantReclame), 0)
      );

      // Temps moyen de traitement: from reception to dateTraitementTechnique or datePaiement
      const withDates = g.dossiers.filter((d) => {
        if (g.service === "RECEPTION" && d.dateTraitementTechnique)
          return true;
        if (g.service === "TECHNIQUE" && d.dateTraitementTechnique && d.dateReception)
          return true;
        if (g.service === "COMPTABILITE" && d.datePaiement && d.dateReception)
          return true;
        return false;
      });

      let tempsMoyenTraitement = 0;
      if (withDates.length > 0) {
        const totalDays = withDates.reduce((sum, d) => {
          if (g.service === "RECEPTION" && d.dateTraitementTechnique) {
            return sum + diffDays(d.dateTraitementTechnique, d.dateReception);
          }
          if (g.service === "TECHNIQUE" && d.dateTraitementTechnique) {
            return sum + diffDays(d.dateTraitementTechnique, d.dateReception);
          }
          if (g.service === "COMPTABILITE" && d.datePaiement) {
            return sum + diffDays(d.datePaiement, d.dateReception);
          }
          return sum;
        }, 0);
        tempsMoyenTraitement = round2(totalDays / withDates.length);
      }

      return {
        gestionnaireNom: g.nom,
        service: g.service,
        nbDossiers,
        montantTraite,
        tempsMoyenTraitement,
      };
    });

    // ─── PAR SOCIETE ───────────────────────────────────────────
    const societeMap = new Map<
      string,
      { nom: string; dossiers: typeof allDossiers }
    >();

    for (const d of allDossiers) {
      if (!societeMap.has(d.societeId)) {
        societeMap.set(d.societeId, { nom: d.societe.nom, dossiers: [] });
      }
      societeMap.get(d.societeId)!.dossiers.push(d);
    }

    const parSociete = Array.from(societeMap.values()).map((s) => {
      const nbDossiers = s.dossiers.length;
      const montantReclame = round2(
        s.dossiers.reduce((sum, d) => sum + d.montantReclame, 0)
      );
      const montantPaye = round2(
        s.dossiers.reduce((sum, d) => sum + (d.montantPaye || 0), 0)
      );
      const coutMoyen =
        nbDossiers > 0 ? round2(montantPaye / nbDossiers) : 0;

      return {
        societeNom: s.nom,
        nbDossiers,
        montantReclame,
        montantPaye,
        coutMoyen,
      };
    });

    // ─── VOLUME MENSUEL (2026) ─────────────────────────────────
    const monthlyMap = new Map<string, number>();
    // Initialize all months of 2026
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }

    for (const d of allDossiers) {
      const year = d.dateReception.getFullYear();
      const month = d.dateReception.getMonth() + 1;
      if (year === 2026) {
        const key = `2026-${String(month).padStart(2, "0")}`;
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
      }
    }

    const volumeMensuel = Array.from(monthlyMap.entries()).map(
      ([mois, nbDossiers]) => ({ mois, nbDossiers })
    );

    return NextResponse.json({
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
      reception: {
        totalEnregistres,
        tempsMoyenAvantTransfert,
        enAttente,
      },
      technique: {
        totalAnalyses,
        totalValides,
        totalRejetes: totalRejetesTech,
        delaiMoyenAnalyse,
        montantTotalValide,
        enCours,
      },
      comptabilite: {
        decomptesRecus,
        paiementsEffectues,
        montantTotalPaye: comptabiliteMontantTotalPaye,
        enCoursPaiement,
      },
      productivite,
      parSociete,
      volumeMensuel,
    });
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des KPIs" },
      { status: 500 }
    );
  }
}