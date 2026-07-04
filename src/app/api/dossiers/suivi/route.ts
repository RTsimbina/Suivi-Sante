import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkAuth } from "@/lib/authorize";

function diffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
      return NextResponse.json(
        { error: "Le paramètre de recherche 'q' est requis" },
        { status: 400 }
      );
    }

    // Recherche par numéro de dossier exact ou partiel, bénéficiaire, ou société
    const where: Prisma.DossierWhereInput = {
      OR: [
        { numeroDossier: { contains: q } },
        { beneficiaire: { contains: q } },
        { societe: { nom: { contains: q } } },
      ],
    };

    const dossiers = await db.dossier.findMany({
      where,
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const NOW = new Date();

    // Enrichir chaque dossier avec les informations de suivi de traitement et paiement
    const enriched = dossiers.map((d) => {
      // --- ÉTAPES DE TRAITEMENT ---
      const etapes = [
        {
          nom: "Réception",
          statut: "termine" as const,
          date: d.dateReception,
          gestionnaire: d.gestionnaireAccueil?.nom || null,
          details: `Enregistré le ${d.dateReception.toLocaleDateString("fr-FR")}`,
        },
        {
          nom: "Service Médical / Technique",
          statut: (() => {
            if (d.statut === "RECU") return "en_attente" as const;
            if (d.statut === "REJETE" && !d.dateTraitementTechnique) return "saute" as const;
            if (d.statut === "PAYE" || d.statut === "EN_PAIEMENT" || d.statut === "VALIDE") return "termine" as const;
            if (d.statut === "EN_ANALYSE") return "en_cours" as const;
            return "en_attente" as const;
          })(),
          date: d.dateTraitementTechnique || null,
          gestionnaire: d.gestionnaireTechnique?.nom || null,
          details: (() => {
            if (!d.dateTraitementTechnique) return "En attente de prise en charge";
            if (d.statut === "REJETE") return `Rejeté — Motif : ${d.motifRejet || "Non spécifié"}`;
            if (d.statut === "EN_ANALYSE") return `En cours d'analyse depuis le ${d.dateTraitementTechnique.toLocaleDateString("fr-FR")}`;
            return `Traité le ${d.dateTraitementTechnique.toLocaleDateString("fr-FR")}`;
          })(),
        },
        {
          nom: "Comptabilité",
          statut: (() => {
            if (d.statut === "RECU" || d.statut === "EN_ANALYSE" || (d.statut === "REJETE" && !d.dateReceptionDecompte)) return "en_attente" as const;
            if (d.statut === "REJETE") return "saute" as const;
            if (d.statut === "VALIDE") return "en_cours" as const;
            if (d.statut === "EN_PAIEMENT") return "en_cours" as const;
            if (d.statut === "PAYE") return "termine" as const;
            return "en_attente" as const;
          })(),
          date: d.dateReceptionDecompte || null,
          gestionnaire: d.gestionnaireCompta?.nom || null,
          details: (() => {
            if (!d.dateReceptionDecompte && (d.statut === "RECU" || d.statut === "EN_ANALYSE")) return "En attente de réception du décompte";
            if (!d.dateReceptionDecompte) return "Décompte non encore reçu";
            if (d.statut === "PAYE") return `Décompte reçu le ${d.dateReceptionDecompte.toLocaleDateString("fr-FR")} — Paiement effectué`;
            return `Décompte reçu le ${d.dateReceptionDecompte.toLocaleDateString("fr-FR")} — En cours de traitement`;
          })(),
        },
        {
          nom: "Paiement",
          statut: (() => {
            if (d.statut === "PAYE") return "termine" as const;
            if (d.statut === "EN_PAIEMENT") return "en_cours" as const;
            if (d.statut === "REJETE") return "saute" as const;
            return "en_attente" as const;
          })(),
          date: d.datePaiement || null,
          gestionnaire: d.gestionnaireCompta?.nom || null,
          details: (() => {
            if (d.statut === "PAYE" && d.datePaiement) return `Payé le ${d.datePaiement.toLocaleDateString("fr-FR")}${d.referencePaiement ? ` — Réf : ${d.referencePaiement}` : ""}`;
            if (d.statut === "EN_PAIEMENT") return "En cours de paiement";
            if (d.statut === "REJETE") return "Non applicable (dossier rejeté)";
            return "En attente";
          })(),
        },
      ];

      // --- DÉLAIS PAR ÉTAPE ---
      const delaiReception = diffDays(NOW, d.dateReception);
      const delaiTechnique = d.dateTraitementTechnique ? diffDays(NOW, d.dateTraitementTechnique) : null;
      const delaiCompta = d.dateReceptionDecompte ? diffDays(NOW, d.dateReceptionDecompte) : null;
      const delaiTotal = d.datePaiement && d.dateReception ? diffDays(d.datePaiement, d.dateReception) : null;

      // --- ALERTES ---
      const alertes: string[] = [];
      if (d.statut === "RECU" && delaiReception > 5) alertes.push(`Retard réception : ${delaiReception} jours sans transfert au service technique`);
      if ((d.statut === "EN_ANALYSE") && delaiTechnique && delaiTechnique > 10) alertes.push(`Retard technique : ${delaiTechnique} jours en analyse`);
      if (d.statut === "EN_PAIEMENT" && delaiCompta && delaiCompta > 5) alertes.push(`Retard comptabilité : ${delaiCompta} jours en attente de paiement`);
      if (d.statut === "REJETE") alertes.push(`Dossier rejeté — Motif : ${d.motifRejet || "Non spécifié"}`);

      // --- DÉTAILS PAIEMENT ---
      const paiement = {
        montantReclame: round2(d.montantReclame),
        montantValide: round2(d.montantValide),
        ecartMontant: d.montantValide ? round2(d.montantReclame - d.montantValide) : null,
        tauxEcart: d.montantValide && d.montantReclame > 0 ? round2(((d.montantReclame - d.montantValide) / d.montantReclame) * 100) : null,
        ticketModerateur: round2(d.ticketModerateur),
        partPatient: round2(d.partPatient),
        partEntreprise: round2(d.partEntreprise),
        montantPaye: round2(d.montantPaye),
        datePaiement: d.datePaiement,
        referencePaiement: d.referencePaiement,
        statutPaiement: (() => {
          if (d.statut === "PAYE") return "PAYE";
          if (d.statut === "EN_PAIEMENT") return "EN_COURS";
          if (d.statut === "REJETE") return "NON_APPLICABLE";
          return "EN_ATTENTE";
        })(),
      };

      return {
        id: d.id,
        numeroDossier: d.numeroDossier,
        beneficiaire: d.beneficiaire,
        typeDossier: d.typeDossier,
        societeNom: d.societe.nom,
        statut: d.statut,
        dateReception: d.dateReception,
        etapes,
        delais: {
          reception: delaiReception,
          technique: delaiTechnique,
          comptabilite: delaiCompta,
          total: delaiTotal,
        },
        alertes,
        paiement,
      };
    });

    return NextResponse.json({
      query: q,
      results: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error("Error in suivi endpoint:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche de suivi" },
      { status: 500 }
    );
  }
}