import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { simulerActeSchema } from '@/lib/validation';
import { verifierPlafondAnnuel } from '@/lib/plafond-check';
import { enNombre } from '@/lib/money';

export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    // ─── Validation Zod centralisée (montant > 0, identifiants) ─────────────
    const parsed = await parseJsonBody(request, simulerActeSchema);
    if (!parsed.success) return parsed.response;
    const { assureId, typeActe, montantDemande, prestataireId } = parsed.data;

    // Récupérer l'assuré
    const assure = await db.assure.findUnique({
      where: { id: assureId },
      include: { societe: true },
    });

    if (!assure) {
      return Response.json({ erreur: "Assuré non trouvé." }, { status: 404 });
    }

    // Vérifier actif
    if (!assure.actif) {
      return Response.json({
        autorise: false,
        raison: "ASSURE_INACTIF",
        message: "L'assuré est inactif. Aucune prise en charge possible.",
        details: { assureActif: false },
        alertes: [],
      });
    }

    // Vérifier que le prestataire est actif pour cette société (si prestataireId fourni)
    if (prestataireId) {
      const lienPS = await db.prestataireSociete.findUnique({
        where: { prestataireId_societeId: { prestataireId, societeId: assure.societeId } },
        select: { actif: true },
      });
      // Si un lien existe et est inactif → refus
      if (lienPS && !lienPS.actif) {
        return Response.json({
          autorise: false,
          raison: "PRESTATAIRE_INACTIF_POUR_SOCIETE",
          message: `Le prestataire est inactif pour la société ${assure.societe.nom}. Les actes sont refusés automatiquement.`,
          details: { prestataireId, societeId: assure.societeId, prestataireActifPourSociete: false },
        });
      }
    }

    // ─── P2-04 : UNIFICATION DU CALCUL DU TICKET MODÉRATEUR ─────────────────
    // Toute la logique métier (barème valide à la date courante, consommation
    // annuelle et ses règles d'exclusion, plafond acte + plafond global,
    // prise en charge théorique / autorisée, dépassement, ticket modérateur,
    // alertes) vit dans verifierPlafondAnnuel → src/lib/services/
    // calcul-remboursement.ts (source unique partagée par toute l'application).
    // AVANT : cette route répliquait le moteur avec une règle DIVERGENTE (les
    // dossiers RECU comptaient dans la consommation, contrairement au circuit
    // de traitement) — plus aucun calcul parallèle.
    const verification = await verifierPlafondAnnuel({
      assureId: assure.id,
      societeId: assure.societeId,
      typeActe,
      montantDemande,
      prestataireId: prestataireId || undefined,
    });

    // Actes identiques de l'année (affichage Contrôle Santé — enrichissement
    // propre à la simulation, hors moteur de calcul)
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const finAnnee = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);
    const actes = await db.dossier.findMany({
      where: {
        assureId: assure.id,
        typeDossier: typeActe,
        dateReception: { gte: debutAnnee, lte: finAnnee },
      },
      select: {
        numeroDossier: true,
        dateReception: true,
        montantReclame: true,
        montantPaye: true,
        statut: true,
      },
      orderBy: { dateReception: 'desc' },
    });

    return Response.json({
      autorise: verification.autorise,
      raison: verification.raison,
      message: verification.message,
      // Compatibilité Contrôle Santé : la clé `typeActe` complète le champ
      // `prestation` du moteur (ancien format de cette route).
      details: { ...verification.details, typeActe },
      actesIdentiques: actes.map(a => ({
        numeroDossier: a.numeroDossier,
        dateReception: a.dateReception,
        montantReclame: enNombre(a.montantReclame),
        montantPaye: enNombre(a.montantPaye),
        statut: a.statut,
      })),
      alertes: verification.alertes,
    });
  } catch (error) {
    console.error('[SANTÉ] Erreur simulation acte:', error);
    return Response.json(
      { erreur: "Erreur lors de la simulation de l'acte." },
      { status: 500 }
    );
  } finally {
    await db.$disconnect();
  }
}
