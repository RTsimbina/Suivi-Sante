import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { APPEL_FONDS_STATUT_VALEURS, transitionAppelFondsAutorisee } from '@/lib/statuts';
import { logAuditOperation, getUserInfoFromRequest } from '@/lib/audit-log';
import { appelFondsUpdateSchema } from "@/lib/validation";
import { egaux, moins } from "@/lib/money";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Erreur sentinelle : appel introuvable (dans la transaction)
  class AppelIntrouvable extends Error {}
  class TransitionInterdite extends Error {}

  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Validation Zod centralisée (statut enum, montant ≥ 0, dates) ──────
    const parsed = await parseJsonBody(request, appelFondsUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { statut, datePaiement, reference, montant } = parsed.data;

    // FIX audit P2 : lecture verrouillée + écritures dans UNE SEULE
    // transaction. Avant : (1) montant lu hors transaction → deux PATCH
    // simultanés calculaient le même diff et l'appliquaient deux fois
    // (double incrément du budgetUtilise) ; (2) contrat.update puis
    // appel.update séparés → un échec intermédiaire désynchronisait le
    // budget du contrat.
    // État avant modification + données appliquées, capturés pour l'audit
    let existingAvant: Record<string, unknown> = {};
    let updateDataApplique: Record<string, unknown> = {};

    const appel = await db.$transaction(async (tx) => {
      // Verrou de ligne : sérialise les PATCH concurrents sur LE MÊME appel
      await tx.$queryRaw`SELECT "id" FROM "AppelDeFonds" WHERE "id" = ${id} FOR UPDATE`;

      // Re-lecture APRÈS acquisition du verrou (snapshot frais, READ COMMITTED)
      const existing = await tx.appelDeFonds.findUnique({
        where: { id },
        include: { contrat: true },
      });
      if (!existing) throw new AppelIntrouvable();
      existingAvant = existing as unknown as Record<string, unknown>;

      const updateData: Record<string, unknown> = {};

      // Le schéma Zod garantit statut ∈ [EN_ATTENTE, REGLE, ANNULE]
      // + règles de changement de statut centralisées (statuts.ts).
      // La matrice n'est appliquée que si le statut actuel est connu (les
      // lignes historiques avec un statut absent/atypique restent modifiables).
      if (statut !== undefined && statut !== existing.statut) {
        const statutActuelConnu = APPEL_FONDS_STATUT_VALEURS.includes(existing.statut);
        if (statutActuelConnu && !transitionAppelFondsAutorisee(existing.statut, statut)) {
          throw new TransitionInterdite(`Transition non autorisée de "${existing.statut}" vers "${statut}"`);
        }
        updateData.statut = statut;
      }

      if (datePaiement !== undefined && datePaiement !== null) updateData.datePaiement = datePaiement;
      if (reference) updateData.reference = reference;

      // Si le montant est modifié, recalculer le budgetUtilise du contrat
      // (type number et non-négativité garantis par le schéma Zod)
      // Comparaison EXACTE (plan P3) : l'ancien `existing.montant !== montant`
      // comparait un objet Decimal à un number → toujours vrai, le diff de
      // budget était appliqué même sans changement de montant.
      if (montant !== undefined && !egaux(existing.montant, montant)) {
        updateData.montant = montant;

        // Ajuster le budgetUtilise : soustraire l'ancien, ajouter le nouveau
        // (diff en Decimal exact — Prisma accepte un Decimal en increment)
        const diff = moins(montant, existing.montant) ?? 0;
        await tx.contrat.update({
          where: { id: existing.contratId },
          data: { budgetUtilise: { increment: diff } },
        });
      }

      updateDataApplique = updateData;

      return tx.appelDeFonds.update({
        where: { id },
        data: updateData,
        include: { contrat: { include: { societe: true } } },
      });
    });

    // ─── Audit champ par champ (1 operationId pour l'opération) ────────────
    const { nom: auditNom, id: auditId } = await getUserInfoFromRequest(request);
    await logAuditOperation({
      entite: 'AppelDeFonds', entiteId: id, action: 'MODIFICATION',
      modifiePar: auditNom, modifieParId: auditId,
      objet: `Appel de fonds — ${appel.contrat?.reference ?? ''}`,
      societeId: appel.contrat?.societeId ?? undefined,
      ancien: existingAvant,
      nouveau: updateDataApplique,
      request,
    });

    return NextResponse.json(appel);
  } catch (error) {
    if (error instanceof TransitionInterdite) {
      return NextResponse.json({ erreur: error.message }, { status: 400 });
    }
    if (error instanceof AppelIntrouvable) {
      return NextResponse.json({ erreur: "Appel de fonds introuvable" }, { status: 404 });
    }
    console.error("Error updating appel de fonds:", error);
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
