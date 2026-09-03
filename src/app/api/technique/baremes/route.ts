import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { verifierPlafondAnnuel, type PlafondCheckResult } from '@/lib/plafond-check';
import { parseJsonBody } from '@/lib/validation/parse';
import { techniqueBaremeSchema } from '@/lib/validation';

// ─── POST : Calculer le ticket modérateur + vérification plafond annuel ──────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (identifiants, montant > 0) ─────────────
    const parsed = await parseJsonBody(request, techniqueBaremeSchema);
    if (!parsed.success) return parsed.response;
    const {
      societeId,
      prestation,
      montantReclame,
      assureId,
      prestataireId,
    } = parsed.data;

    // Récupérer la société avec ses barèmes
    const societe = await db.societe.findUnique({
      where: { id: societeId },
      select: { id: true, nom: true },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // Rechercher le barème actif correspondant à la prestation
    const bareme = await db.bareme.findUnique({
      where: {
        societeId_prestation: {
          societeId,
          prestation: prestation.toUpperCase(),
        },
      },
    });

    if (!bareme) {
      return NextResponse.json(
        {
          erreur: `Aucun barème trouvé pour la prestation "${prestation}" dans la société "${societe.nom}".`,
          societe: { id: societe.id, nom: societe.nom },
        },
        { status: 404 }
      );
    }

    if (!bareme.active) {
      return NextResponse.json(
        {
          erreur: `Le barème pour la prestation "${prestation}" est désactivé dans la société "${societe.nom}".`,
          bareme: {
            prestation: bareme.prestation,
            active: false,
          },
        },
        { status: 400 }
      );
    }

    // ─── Vérification du plafond annuel (si assureId fourni) ────────────────
    let plafondCheck: PlafondCheckResult | null = null;
    let montantCouvertFinal = Math.min(montantReclame, bareme.plafond);

    if (assureId) {
      try {
        plafondCheck = await verifierPlafondAnnuel({
          assureId,
          societeId,
          typeActe: prestation.toUpperCase(),
          montantDemande: montantReclame,
          prestataireId: prestataireId || undefined,
        });

        // Si le plafond annuel est vérifié, utiliser le montant couvert
        // qui tient compte du reliquat réel (et non juste le plafond du barème)
        if (plafondCheck.details.montantCouvert !== undefined) {
          montantCouvertFinal = plafondCheck.details.montantCouvert;
        }
      } catch (err) {
        console.error('[BAREMES] Erreur vérification plafond annuel :', err);
        // En cas d'erreur de vérification, on poursuit avec le calcul de base
      }
    }

    // Calcul du ticket modérateur
    const montantRembourse = montantCouvertFinal * (bareme.tauxCouverture / 100);
    const ticketModerateur = montantReclame - montantRembourse;

    // Construction de l'explication en français
    const plafondAtteint = montantReclame > bareme.plafond;
    const plafondAnnuelAtteint = plafondCheck ? !plafondCheck.autorise : false;
    let explication: string;

    if (plafondAnnuelAtteint) {
      // Plafond annuel épuisé — message prioritaire
      explication = plafondCheck!.message;
    } else if (plafondAtteint) {
      explication = [
        `Pour la prestation "${prestation}" de la société "${societe.nom}" :`,
        `Le montant réclamé (${montantReclame.toLocaleString('fr-FR')} FCFA) dépasse le plafond de ${bareme.plafond.toLocaleString('fr-FR')} FCFA.`,
        `Le montant couvert est donc plafonné à ${montantCouvertFinal.toLocaleString('fr-FR')} FCFA.`,
        `Avec un taux de couverture de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} FCFA.`,
        `Le ticket modérateur à la charge du bénéficiaire est de ${ticketModerateur.toLocaleString('fr-FR')} FCFA.`,
      ].join(' ');
    } else {
      explication = [
        `Pour la prestation "${prestation}" de la société "${societe.nom}" :`,
        `Le montant réclamé (${montantReclame.toLocaleString('fr-FR')} FCFA) est dans la limite du plafond de ${bareme.plafond.toLocaleString('fr-FR')} FCFA.`,
        `Avec un taux de couverture de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} FCFA.`,
        `Le ticket modérateur à la charge du bénéficiaire est de ${ticketModerateur.toLocaleString('fr-FR')} FCFA.`,
      ].join(' ');
    }

    // Ajouter les infos de consommation annuelle à l'explication
    if (plafondCheck && plafondCheck.autorise && plafondCheck.details.reliquatActe !== undefined) {
      const pctActe = ((plafondCheck.details.consommeActe! / plafondCheck.details.plafondActe!) * 100).toFixed(1);
      explication += ` Consommation annuelle ${prestation} : ${pctActe}% (${plafondCheck.details.consommeActe!.toLocaleString('fr-FR')} / ${plafondCheck.details.plafondActe!.toLocaleString('fr-FR')} FCFA), reliquat : ${plafondCheck.details.reliquatActe!.toLocaleString('fr-FR')} FCFA.`;
    }

    const response: Record<string, unknown> = {
      societe: { id: societe.id, nom: societe.nom },
      bareme: {
        prestation: bareme.prestation,
        tauxCouverture: bareme.tauxCouverture,
        plafond: bareme.plafond,
        description: bareme.description ?? null,
      },
      calcul: {
        montantReclame,
        plafondAtteint: plafondAtteint || plafondAnnuelAtteint,
        montantCouvert: montantCouvertFinal,
        tauxCouverture: bareme.tauxCouverture,
        montantRembourse: Math.round(montantRembourse * 100) / 100,
        ticketModerateur: Math.round(ticketModerateur * 100) / 100,
      },
      explication,
    };

    // Ajouter les détails du plafond annuel si vérifié
    if (plafondCheck) {
      response.plafondAnnuel = {
        autorise: plafondCheck.autorise,
        raison: plafondCheck.raison,
        message: plafondCheck.message,
        details: plafondCheck.details,
        alertes: plafondCheck.alertes,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erreur lors du calcul du ticket modérateur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du calcul du ticket modérateur.' },
      { status: 500 }
    );
  }
}
