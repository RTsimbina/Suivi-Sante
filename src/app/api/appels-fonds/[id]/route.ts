import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { parseJsonBody } from "@/lib/validation/parse";
import { APPEL_FONDS_STATUT_VALEURS, transitionAppelFondsAutorisee } from '@/lib/statuts';
import { logAuditOperation, getUserInfoFromRequest } from '@/lib/audit-log';
import { appelFondsUpdateSchema } from "@/lib/validation";
import { egaux, moins, versDecimal, superieurA, formaterAr, Decimal } from "@/lib/money";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Erreurs sentinelles (levées dans la transaction, converties en réponses)
  class AppelIntrouvable extends Error {}
  class TransitionInterdite extends Error {}
  class DepassementBudget extends Error {
    constructor(public details: Record<string, unknown>) { super('Dépassement du budget annuel'); }
  }

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

      // ─── BIZ-6 : cohérence budgétaire des transitions et du montant ──────
      // Ancien comportement : le passage au statut ANNULE ne décrémentait PAS
      // budgetUtilise — un appel annulé continuait de consommer le budget et
      // le solde affiché restait faux (voire négatif). Symétriquement, la
      // réactivation d'un appel annulé (ANNULE → EN_ATTENTE, matrice
      // statuts.ts) ne ré-incrémentait pas le budget.
      const statutFinal = (updateData.statut ?? existing.statut) as string;
      const etaitAnnule = existing.statut === 'ANNULE';
      const seraAnnule = statutFinal === 'ANNULE';
      const montantChange = montant !== undefined && !egaux(existing.montant, montant);
      const budgetTouche = etaitAnnule !== seraAnnule || (montantChange && !seraAnnule);

      if (budgetTouche) {
        // Verrou sur la ligne du contrat : deux PATCH concurrents relèvent
        // sinon le même budgetUtilise et appliquent deux fois le diff.
        await tx.$queryRaw`SELECT "id" FROM "Contrat" WHERE "id" = ${existing.contratId} FOR UPDATE`;
        const contrat = await tx.contrat.findUnique({ where: { id: existing.contratId } });
        const budgetUtilise = versDecimal(contrat?.budgetUtilise) ?? new Decimal(0);
        const budgetAnnuel = contrat?.budgetAnnuel;

        if (seraAnnule && !etaitAnnule) {
          // Annulation : l'appel QUITTE la consommation du budget.
          await tx.contrat.update({
            where: { id: existing.contratId },
            data: { budgetUtilise: { decrement: existing.montant } },
          });
        } else if (!seraAnnule && etaitAnnule) {
          // Réactivation : l'appel redevient consommant (montant appliqué).
          const montantApplique = montantChange ? (montant as number) : existing.montant;
          if (budgetAnnuel && superieurA(
            budgetUtilise.plus(versDecimal(montantApplique) ?? new Decimal(0)),
            budgetAnnuel,
          )) {
            throw new DepassementBudget({
              budgetAnnuel: formaterAr(budgetAnnuel),
              budgetUtilise: formaterAr(budgetUtilise),
              montantDemande: formaterAr(montantApplique),
            });
          }
          await tx.contrat.update({
            where: { id: existing.contratId },
            data: { budgetUtilise: { increment: montantApplique } },
          });
        } else if (montantChange) {
          // Ajustement du montant sur un appel actif : diff ancien → nouveau
          // avec contrôle du budget en cas d'augmentation. (Comparaison
          // EXACTE Decimal : l'ancien `existing.montant !== montant`
          // comparait un objet Decimal à un number → toujours vrai.)
          const diff = moins(montant as number, existing.montant) ?? 0;
          const augmentation = superieurA(versDecimal(diff) ?? new Decimal(0), 0);
          if (augmentation && budgetAnnuel && superieurA(
            budgetUtilise.plus(versDecimal(diff) ?? new Decimal(0)),
            budgetAnnuel,
          )) {
            throw new DepassementBudget({
              budgetAnnuel: formaterAr(budgetAnnuel),
              budgetUtilise: formaterAr(budgetUtilise),
              montantDemande: formaterAr(montant),
            });
          }
          await tx.contrat.update({
            where: { id: existing.contratId },
            data: { budgetUtilise: { increment: diff } },
          });
        }
      }

      // Champ montant : appliqué dès qu'il change (y compris sur un appel
      // annulé — le budget, lui, n'est touché que si l'appel est consommant).
      if (montantChange) {
        updateData.montant = montant;
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
    if (error instanceof DepassementBudget) {
      return NextResponse.json(
        { erreur: "Budget annuel insuffisant : l'opération dépasserait le solde disponible du contrat.", ...error.details },
        { status: 422 }
      );
    }
    if (error instanceof AppelIntrouvable) {
      return NextResponse.json({ erreur: "Appel de fonds introuvable" }, { status: 404 });
    }
    console.error("Error updating appel de fonds:", error);
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
