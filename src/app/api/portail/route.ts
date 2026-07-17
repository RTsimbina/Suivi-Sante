import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkAuth } from "@/lib/authorize";

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Le champ 'query' est requis" },
        { status: 400 }
      );
    }

    const q = query.trim();

    if (q.length < 2) {
      return NextResponse.json(
        { error: "La recherche doit contenir au moins 2 caractères" },
        { status: 400 }
      );
    }

    // Recherche par numéro de dossier exact ou partiel, ou bénéficiaire
    const where: Prisma.DossierWhereInput = {
      OR: [
        { numeroDossier: { contains: q } },
        { beneficiaire: { contains: q, mode: "insensitive" } },
      ],
    };

    const dossiers = await db.dossier.findMany({
      where,
      include: { societe: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (dossiers.length === 0) {
      return NextResponse.json({
        query: q,
        results: [],
        total: 0,
        resume: `Aucun dossier trouvé pour la recherche "${q}". Vérifiez votre numéro de dossier ou nom de bénéficiaire.`,
      });
    }

    // Mapper vers les données client-safe uniquement
    const statutLabels: Record<string, string> = {
      RECU: "Reçu",
      EN_ANALYSE: "En cours d'analyse",
      VALIDE: "Validé",
      REJETE: "Rejeté",
      EN_COMPTABILITE: "En cours de vérification comptable",
      EN_PAIEMENT: "En cours de paiement",
      PAYE: "Payé",
    };

    const typeLabels: Record<string, string> = {
      HOSPITALISATION: "Hospitalisation",
      CONSULTATION: "Consultation",
      PHARMACIE: "Pharmacie",
      MATERNITE: "Maternité",
      CHIRURGIE: "Chirurgie",
      EXAMEN: "Examen",
      "SOINS DENTAIRES": "Soins Dentaires",
      OPTIQUE: "Optique",
    };

    const formatMontant = (n: number) =>
      new Intl.NumberFormat("fr-FR").format(n) + " Ar";

    const formatDate = (d: Date) =>
      new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(d));

    const results = dossiers.map((d) => {
      const base: Record<string, unknown> = {
        numeroDossier: d.numeroDossier,
        statut: d.statut,
        statutLabel: statutLabels[d.statut] || d.statut,
        typeDossier: typeLabels[d.typeDossier] || d.typeDossier,
        dateReception: d.dateReception,
        montantReclame: d.montantReclame,
      };

      // Infos de paiement — uniquement si payé
      if (d.statut === "PAYE" || d.statut === "EN_PAIEMENT") {
        if (d.montantPaye) base.montantPaye = d.montantPaye;
        if (d.datePaiement) base.datePaiement = d.datePaiement;
        if (d.referencePaiement) base.referencePaiement = d.referencePaiement;
      }

      // Motif de rejet — si rejeté
      if (d.statut === "REJETE" && d.motifRejet) base.motifRejet = d.motifRejet;

      return base;
    });

    // Générer un résumé lisible en français
    const resumes = dossiers.map((d) => {
      const type = typeLabels[d.typeDossier] || d.typeDossier;
      const montant = formatMontant(d.montantReclame);

      if (d.statut === "PAYE" && d.montantPaye && d.datePaiement) {
        return `Dossier ${d.numeroDossier} (${type}) — Payé : votre remboursement de ${formatMontant(d.montantPaye)} a été effectué le ${formatDate(d.datePaiement)}${d.referencePaiement ? `. Référence : ${d.referencePaiement}` : "."}`;
      }

      if (d.statut === "EN_PAIEMENT") {
        return `Dossier ${d.numeroDossier} (${type}) — En cours de paiement : votre dossier est en cours de traitement par le service comptabilité. Montant réclamé : ${montant}.`;
      }

      if (d.statut === "VALIDE" || d.statut === "EN_COMPTABILITE") {
        const service =
          d.statut === "EN_COMPTABILITE"
            ? "comptabilité"
            : "vérification comptable";
        return `Dossier ${d.numeroDossier} (${type}) — En cours de traitement au service ${service}. Montant réclamé : ${montant}.`;
      }

      if (d.statut === "EN_ANALYSE") {
        return `Dossier ${d.numeroDossier} (${type}) — En cours d'analyse par le service médical. Montant réclamé : ${montant}.`;
      }

      if (d.statut === "REJETE") {
        return `Dossier ${d.numeroDossier} (${type}) — Rejeté. Motif : ${d.motifRejet || "Non spécifié"}. Pour toute réclamation, veuillez contacter votre service RH.`;
      }

      return `Dossier ${d.numeroDossier} (${type}) — Reçu et en attente de traitement. Montant réclamé : ${montant}.`;
    });

    return NextResponse.json({
      query: q,
      results,
      total: results.length,
      resume: resumes.join("\n\n"),
    });
  } catch (error) {
    console.error("Error in portail endpoint:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche" },
      { status: 500 }
    );
  }
}