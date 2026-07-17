import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { checkAuth } from '@/lib/authorize';

const db = new PrismaClient();

export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { assureId, typeActe, montantDemande } = body as {
      assureId?: string;
      typeActe?: string;
      montantDemande?: number;
    };

    if (!assureId || !typeActe || !montantDemande || montantDemande <= 0) {
      return Response.json(
        { erreur: "Paramètres manquants : assureId, typeActe, montantDemande requis." },
        { status: 400 }
      );
    }

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
      });
    }

    // Récupérer le barème pour ce type d'acte
    const bareme = await db.bareme.findFirst({
      where: { societeId: assure.societeId, prestation: typeActe, active: true },
    });

    if (!bareme) {
      return Response.json({
        autorise: false,
        raison: "ACTE_NON_COVERT",
        message: `L'acte "${typeActe}" n'est pas couvert par le contrat de la société ${assure.societe.nom}.`,
        details: { prestation: typeActe, societe: assure.societe.nom },
      });
    }

    // Calculer la consommation existante pour ce type d'acte
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const finAnnee = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const dossiersActe = await db.dossier.findMany({
      where: {
        assureId: assure.id,
        typeDossier: typeActe,
        dateReception: { gte: debutAnnee, lte: finAnnee },
        statut: { not: 'REJETE' },
      },
    });

    const consommeActe = dossiersActe.reduce((s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame), 0);
    const reliquatActe = Math.max(0, bareme.plafond - consommeActe);

    // Calculer la consommation globale
    const baremes = await db.bareme.findMany({ where: { societeId: assure.societeId, active: true } });
    const plafondGlobal = baremes.reduce((s, b) => s + b.plafond, 0);

    const dossiersGlobal = await db.dossier.findMany({
      where: {
        assureId: assure.id,
        dateReception: { gte: debutAnnee, lte: finAnnee },
        statut: { not: 'REJETE' },
      },
    });

    const consommeGlobal = dossiersGlobal.reduce((s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame), 0);
    const reliquatGlobal = Math.max(0, plafondGlobal - consommeGlobal);

    // Vérifications
    const alertes: { type: 'info' | 'warning' | 'danger'; message: string }[] = [];

    // 1. Plafond spécifique atteint
    if (consommeActe >= bareme.plafond) {
      return Response.json({
        autorise: false,
        raison: "PLAFOND_ACTE_ATTEINT",
        message: `Plafond ${typeActe} déjà atteint (${consommeActe.toLocaleString('fr-FR')} Ar / ${bareme.plafond.toLocaleString('fr-FR')} Ar). Aucun reliquat disponible.`,
        details: {
          plafondActe: bareme.plafond,
          consommeActe,
          reliquatActe: 0,
          nbActesIdentiques: dossiersActe.length,
          tauxCouverture: bareme.tauxCouverture,
        },
        alertes: [{
          type: 'danger',
          message: `SUSPENSION — L'assuré a épuisé son plafond ${typeActe} pour l'année ${new Date().getFullYear()}.`,
        }],
      });
    }

    // 2. Montant demandé dépasse le reliquat de l'acte
    if (montantDemande > reliquatActe) {
      alertes.push({
        type: 'danger',
        message: `Le montant demandé (${montantDemande.toLocaleString('fr-FR')} Ar) dépasse le reliquat disponible pour ${typeActe} (${reliquatActe.toLocaleString('fr-FR')} Ar).`,
      });
    }

    // 3. Plafond global atteint
    if (consommeGlobal >= plafondGlobal) {
      return Response.json({
        autorise: false,
        raison: "PLAFOND_GLOBAL_ATTEINT",
        message: `Plafond annuel global atteint. Aucun nouvel acte ne peut être pris en charge.`,
        details: {
          plafondGlobal,
          consommeGlobal,
          reliquatGlobal: 0,
        },
        alertes: [{
          type: 'danger',
          message: `SUSPENSION GLOBALE — Tous les plafonds de l'assuré sont épuisés pour l'année ${new Date().getFullYear()}.`,
        }],
      });
    }

    // 4. Plafond global > 70%
    if ((consommeGlobal / plafondGlobal) * 100 >= 70) {
      alertes.push({
        type: 'warning',
        message: `Plafond global à ${((consommeGlobal / plafondGlobal) * 100).toFixed(1)}%. Approbation spéciale recommandée.`,
      });
    }

    // 5. Plafond acte > 70%
    if ((consommeActe / bareme.plafond) * 100 >= 70) {
      alertes.push({
        type: 'warning',
        message: `Plafond ${typeActe} à ${((consommeActe / bareme.plafond) * 100).toFixed(1)}%.`,
      });
    }

    // Calcul du montant couvert
    const montantCouvert = Math.min(montantDemande, reliquatActe);
    const partAssureur = montantCouvert * (bareme.tauxCouverture / 100);
    const partPatient = montantCouvert - partAssureur;

    // Actes identiques récents
    const actesIdentiques = dossiersActe.map(d => ({
      numeroDossier: d.numeroDossier,
      dateReception: d.dateReception,
      montantReclame: d.montantReclame,
      montantPaye: d.montantPaye,
      statut: d.statut,
    }));

    const autorise = montantDemande <= reliquatActe && consommeGlobal < plafondGlobal;

    return Response.json({
      autorise,
      raison: autorise ? 'OK' : 'MONTANT_DEPASSE_RELIQUAT',
      message: autorise
        ? `Acte autorisé. Montant couvert : ${montantCouvert.toLocaleString('fr-FR')} Ar.`
        : `Le montant demandé dépasse le reliquat disponible.`,
      details: {
        typeActe,
        plafondActe: bareme.plafond,
        consommeActe,
        reliquatActe,
        tauxCouverture: bareme.tauxCouverture,
        montantDemande,
        montantCouvert,
        partAssureur: Math.round(partAssureur),
        partPatient: Math.round(partPatient),
        plafondGlobal,
        consommeGlobal,
        reliquatGlobal,
        nbActesIdentiques: dossiersActe.length,
      },
      actesIdentiques,
      alertes,
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