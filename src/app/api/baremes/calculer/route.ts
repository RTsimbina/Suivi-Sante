import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { baremeCalculerSchema } from "@/lib/validation";

/**
 * Calcule le ticket modérateur selon le barème d'une société.
 *
 * POST body: { societeId, prestation, montantReclame }
 *
 * Logique :
 * 1. Trouver le barème actif pour cette société + prestation
 * 2. Si le montant réclamé <= plafond :
 *    - montantCouvert = montantReclame × (tauxCouverture / 100)
 *    - ticketModerateur = montantReclame - montantCouvert
 * 3. Si le montant réclamé > plafond :
 *    - montantCouvertMax = plafond × (tauxCouverture / 100)
 *    - partAssurance = montantCouvertMax
 *    - ticketModerateur = montantReclame - partAssurance
 *    - (le patient paie la différence entre le montant et ce qui est couvert)
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (montant > 0, enum prestation) ──────────
    const parsed = await parseJsonBody(request, baremeCalculerSchema);
    if (!parsed.success) return parsed.response;
    const { societeId, prestation, montantReclame } = parsed.data;

    // Récupérer le barème avec le nom de la société
    const bareme = await db.bareme.findUnique({
      where: { societeId_prestation: { societeId, prestation } },
      include: { societe: { select: { nom: true } } },
    });

    if (!bareme || !bareme.active) {
      return NextResponse.json({
        found: false,
        societeId,
        prestation,
        montantReclame,
        message: `Aucun barème actif trouvé pour cette prestation dans cette société.`,
      });
    }

    const taux = bareme.tauxCouverture / 100; // ex: 0.90
    const plafond = bareme.plafond;

    let montantCouvert: number;
    let ticketModerateur: number;
    let depassementPlafond = 0;
    let details: string;

    if (montantReclame <= plafond) {
      // Dans la limite du plafond
      montantCouvert = Math.round(montantReclame * taux * 100) / 100;
      ticketModerateur = Math.round((montantReclame - montantCouvert) * 100) / 100;
      details = `Montant ${montantReclame.toLocaleString("fr-FR")} Ar ≤ plafond ${plafond.toLocaleString("fr-FR")} Ar. Couverture à ${bareme.tauxCouverture}%.`;
    } else {
      // Dépassement du plafond
      const montantCouvertMax = Math.round(plafond * taux * 100) / 100;
      montantCouvert = montantCouvertMax;
      ticketModerateur = Math.round((montantReclame - montantCouvert) * 100) / 100;
      depassementPlafond = Math.round((montantReclame - plafond) * 100) / 100;
      details = `Montant ${montantReclame.toLocaleString("fr-FR")} Ar > plafond ${plafond.toLocaleString("fr-FR")} Ar. Base de calcul: plafond × ${bareme.tauxCouverture}% = ${montantCouvertMax.toLocaleString("fr-FR")} Ar. Le patient paie la différence.`;
    }

    return NextResponse.json({
      found: true,
      societeId,
      societeNom: bareme.societe?.nom,
      prestation,
      bareme: {
        tauxCouverture: bareme.tauxCouverture,
        plafond: bareme.plafond,
        description: bareme.description,
      },
      montantReclame,
      montantCouvert,
      ticketModerateur,
      depassementPlafond,
      details,
    });
  } catch (error) {
    console.error("Erreur calcul barème:", error);
    return NextResponse.json({ erreur: "Erreur lors du calcul" }, { status: 500 });
  }
}