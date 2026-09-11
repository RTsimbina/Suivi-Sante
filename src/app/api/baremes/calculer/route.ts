import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { baremeCalculerSchema } from "@/lib/validation";
import { enNombre, appliquerTaux, moins, inferieurOuEgal, formaterAr, formaterNombre } from "@/lib/money";

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

    // Calculs en Decimal exact (plan P3) — l'ancien Math.round(x*100)/100
    // restait soumis aux erreurs IEEE 754 du flottant.
    const plafond = bareme.plafond;

    let montantCouvert: number;
    let ticketModerateur: number;
    let depassementPlafond = 0;
    let details: string;

    if (inferieurOuEgal(montantReclame, plafond)) {
      // Dans la limite du plafond
      montantCouvert = enNombre(appliquerTaux(montantReclame, bareme.tauxCouverture)) ?? 0;
      ticketModerateur = enNombre(moins(montantReclame, montantCouvert)) ?? 0;
      details = `Montant ${formaterNombre(montantReclame)} Ar ≤ plafond ${formaterNombre(plafond)} Ar. Couverture à ${bareme.tauxCouverture}%.`;
    } else {
      // Dépassement du plafond
      const montantCouvertMax = enNombre(appliquerTaux(plafond, bareme.tauxCouverture)) ?? 0;
      montantCouvert = montantCouvertMax;
      ticketModerateur = enNombre(moins(montantReclame, montantCouvert)) ?? 0;
      depassementPlafond = enNombre(moins(montantReclame, plafond)) ?? 0;
      details = `Montant ${formaterNombre(montantReclame)} Ar > plafond ${formaterNombre(plafond)} Ar. Base de calcul: plafond × ${bareme.tauxCouverture}% = ${formaterNombre(montantCouvertMax)} Ar. Le patient paie la différence.`;
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