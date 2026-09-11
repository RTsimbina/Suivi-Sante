import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { simulerActeSchema } from '@/lib/validation';
import { Decimal, enNombre, sommer, superieurA, superieurOuEgal, inferieurOuEgal, inferieurA, minDecimal, appliquerTaux, moins, reliquat as calculerReliquat, formaterAr, formaterNombre, formaterPourcent } from '@/lib/money';

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
      });
    }

    // Vérifier que le prestataire est actif pour cette société (si prestataireId fourni)
    if (prestataireId) {
      const lienPS = await db.prestataireSociete.findUnique({
        where: { prestataireId_societeId: { prestataireId, societeId: assure.societeId } },
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

    // Consommations EXACTES en Decimal (plan P3) — réplique plafond-check.ts
    const consommeActe = sommer(
      dossiersActe.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame)
    );
    const reliquatActe = calculerReliquat(bareme.plafond, consommeActe) ?? new Decimal(0);

    // Calculer la consommation globale
    const baremes = await db.bareme.findMany({ where: { societeId: assure.societeId, active: true } });
    const plafondGlobal = sommer(baremes.map(b => b.plafond));

    const dossiersGlobal = await db.dossier.findMany({
      where: {
        assureId: assure.id,
        dateReception: { gte: debutAnnee, lte: finAnnee },
        statut: { not: 'REJETE' },
      },
    });

    const consommeGlobal = sommer(
      dossiersGlobal.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame)
    );
    const reliquatGlobal = calculerReliquat(plafondGlobal, consommeGlobal) ?? new Decimal(0);

    // Vérifications
    const alertes: { type: 'info' | 'warning' | 'danger'; message: string }[] = [];

    // 1. Plafond spécifique atteint (comparaison exacte)
    if (superieurOuEgal(consommeActe, bareme.plafond)) {
      return Response.json({
        autorise: false,
        raison: "PLAFOND_ACTE_ATTEINT",
        message: `Plafond ${typeActe} déjà atteint (${formaterAr(consommeActe)} / ${formaterAr(bareme.plafond)}). Aucun reliquat disponible.`,
        details: {
          plafondActe: enNombre(bareme.plafond),
          consommeActe: enNombre(consommeActe),
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
    if (superieurA(montantDemande, reliquatActe)) {
      alertes.push({
        type: 'danger',
        message: `Le montant demandé (${formaterAr(montantDemande)}) dépasse le reliquat disponible pour ${typeActe} (${formaterAr(reliquatActe)}).`,
      });
    }

    // 3. Plafond global atteint (comparaison exacte)
    if (superieurOuEgal(consommeGlobal, plafondGlobal)) {
      return Response.json({
        autorise: false,
        raison: "PLAFOND_GLOBAL_ATTEINT",
        message: `Plafond annuel global atteint. Aucun nouvel acte ne peut être pris en charge.`,
        details: {
          plafondGlobal: enNombre(plafondGlobal),
          consommeGlobal: enNombre(consommeGlobal),
          reliquatGlobal: 0,
        },
        alertes: [{
          type: 'danger',
          message: `SUSPENSION GLOBALE — Tous les plafonds de l'assuré sont épuisés pour l'année ${new Date().getFullYear()}.`,
        }],
      });
    }

    // 4. Plafond global > 70% (comparaison exacte)
    if (!plafondGlobal.isZero() && superieurOuEgal(consommeGlobal.mul(100), plafondGlobal.mul(70))) {
      alertes.push({
        type: 'warning',
        message: `Plafond global à ${formaterPourcent(consommeGlobal, plafondGlobal)}. Approbation spéciale recommandée.`,
      });
    }

    // 5. Plafond acte > 70%
    if (!bareme.plafond.isZero() && superieurOuEgal(consommeActe.mul(100), bareme.plafond.mul(70))) {
      alertes.push({
        type: 'warning',
        message: `Plafond ${typeActe} à ${formaterPourcent(consommeActe, bareme.plafond)}.`,
      });
    }

    // Calcul du montant couvert (Decimal exact, arrondi comptable)
    const montantCouvert = minDecimal(montantDemande, reliquatActe) ?? new Decimal(0);
    const partAssureur = appliquerTaux(montantCouvert, bareme.tauxCouverture) ?? new Decimal(0);
    const partPatient = moins(montantCouvert, partAssureur) ?? new Decimal(0);

    // Actes identiques récents (montants convertis pour l'affichage)
    const actesIdentiques = dossiersActe.map(d => ({
      numeroDossier: d.numeroDossier,
      dateReception: d.dateReception,
      montantReclame: enNombre(d.montantReclame),
      montantPaye: enNombre(d.montantPaye),
      statut: d.statut,
    }));

    const autorise = inferieurOuEgal(montantDemande, reliquatActe) && inferieurA(consommeGlobal, plafondGlobal);

    return Response.json({
      autorise,
      raison: autorise ? 'OK' : 'MONTANT_DEPASSE_RELIQUAT',
      message: autorise
        ? `Acte autorisé. Montant couvert : ${formaterAr(montantCouvert)}.`
        : `Le montant demandé dépasse le reliquat disponible.`,
      details: {
        typeActe,
        plafondActe: enNombre(bareme.plafond),
        consommeActe: enNombre(consommeActe),
        reliquatActe: enNombre(reliquatActe),
        tauxCouverture: bareme.tauxCouverture,
        montantDemande,
        montantCouvert: enNombre(montantCouvert),
        partAssureur: Math.round(enNombre(partAssureur) ?? 0),
        partPatient: Math.round(enNombre(partPatient) ?? 0),
        plafondGlobal: enNombre(plafondGlobal),
        consommeGlobal: enNombre(consommeGlobal),
        reliquatGlobal: enNombre(reliquatGlobal),
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