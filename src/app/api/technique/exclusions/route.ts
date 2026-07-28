import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

/**
 * GET /api/technique/exclusions
 *
 * Analyse tous les dossiers traités (VALIDE et suivants) pour identifier :
 * - Dépassements de plafond : montantReclame > plafond du barème de la société/prestation
 * - Exclusions : pas de barème actif pour la prestation dans la société
 * - Rejetés : dossiers avec statut REJETE
 */
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // 1. Récupérer tous les dossiers techniquement traités
    const dossiers = await db.dossier.findMany({
      where: {
        statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'] },
      },
      select: {
        id: true,
        numeroDossier: true,
        beneficiaire: true,
        typeDossier: true,
        montantReclame: true,
        montantValide: true,
        ticketModerateur: true,
        statut: true,
        motifRejet: true,
        societeId: true,
        societe: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dossiers.length === 0) {
      return NextResponse.json({ exclusions: [], summary: { depassements: 0, exclusions: 0, rejetes: 0, montantNonCouvert: 0 } });
    }

    // 2. Récupérer tous les barèmes actifs, groupés par societeId
    const allBaremes = await db.bareme.findMany({
      where: { active: true },
      select: {
        societeId: true,
        prestation: true,
        tauxCouverture: true,
        plafond: true,
      },
    });

    // Index : baremesBySociete[societeId][prestation] = { tauxCouverture, plafond }
    const baremesBySociete: Record<string, Record<string, { tauxCouverture: number; plafond: number }>> = {};
    for (const b of allBaremes) {
      if (!baremesBySociete[b.societeId]) baremesBySociete[b.societeId] = {};
      baremesBySociete[b.societeId][b.prestation] = {
        tauxCouverture: b.tauxCouverture,
        plafond: b.plafond,
      };
    }

    // 3. Analyser chaque dossier
    const exclusions: Array<{
      id: string;
      numeroDossier: string;
      beneficiaire: string;
      societeNom: string;
      typeDossier: string;
      montantReclame: number;
      montantValide: number | null;
      montantTheorique: number;
      plafondApplique: number | null;
      tauxCouverture: number | null;
      ticketModerateur: number | null;
      statut: string;
      motifRejet: string | null;
      typeEcart: 'depassement' | 'exclusion' | 'rejete';
      ecart: number;
      pourcentageCouvert: number;
    }> = [];

    let totalMontantNonCouvert = 0;

    for (const d of dossiers) {
      // Les dossiers rejetés sont toujours inclus
      if (d.statut === 'REJETE') {
        exclusions.push({
          id: d.id,
          numeroDossier: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          societeNom: d.societe?.nom || '—',
          typeDossier: d.typeDossier,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantTheorique: 0,
          plafondApplique: null,
          tauxCouverture: null,
          ticketModerateur: d.ticketModerateur,
          statut: d.statut,
          motifRejet: d.motifRejet,
          typeEcart: 'rejete',
          ecart: d.montantReclame,
          pourcentageCouvert: 0,
        });
        totalMontantNonCouvert += d.montantReclame;
        continue;
      }

      // Chercher le barème pour cette société + prestation
      const societeBaremes = baremesBySociete[d.societeId];
      const bareme = societeBaremes?.[d.typeDossier] ?? null;

      if (!bareme) {
        // Pas de barème → exclusion totale
        exclusions.push({
          id: d.id,
          numeroDossier: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          societeNom: d.societe?.nom || '—',
          typeDossier: d.typeDossier,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantTheorique: 0,
          plafondApplique: null,
          tauxCouverture: 0,
          ticketModerateur: d.ticketModerateur,
          statut: d.statut,
          motifRejet: 'Aucun barème défini pour cette prestation',
          typeEcart: 'exclusion',
          ecart: d.montantReclame,
          pourcentageCouvert: 0,
        });
        totalMontantNonCouvert += d.montantReclame;
        continue;
      }

      // Calculer le montant théorique couvert par le barème
      const montantCouvert = Math.min(d.montantReclame, bareme.plafond);
      const montantTheorique = Math.round(montantCouvert * (bareme.tauxCouverture / 100) * 100) / 100;
      const ecart = Math.round((d.montantReclame - montantTheorique) * 100) / 100;
      const pourcentageCouvert = d.montantReclame > 0
        ? Math.round((montantTheorique / d.montantReclame) * 1000) / 10
        : 0;

      // Dépassement de plafond : le montant réclamé dépasse le plafond
      // OU le montant théorique est significativement inférieur au réclamé (> 5% d'écart)
      const isDepassement = d.montantReclame > bareme.plafond || pourcentageCouvert < 95;

      if (isDepassement) {
        exclusions.push({
          id: d.id,
          numeroDossier: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          societeNom: d.societe?.nom || '—',
          typeDossier: d.typeDossier,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantTheorique,
          plafondApplique: bareme.plafond,
          tauxCouverture: bareme.tauxCouverture,
          ticketModerateur: d.ticketModerateur,
          statut: d.statut,
          motifRejet: null,
          typeEcart: 'depassement',
          ecart,
          pourcentageCouvert,
        });
        totalMontantNonCouvert += ecart;
      }
    }

    // 4. Résumé
    const summary = {
      depassements: exclusions.filter(e => e.typeEcart === 'depassement').length,
      exclusions: exclusions.filter(e => e.typeEcart === 'exclusion').length,
      rejetes: exclusions.filter(e => e.typeEcart === 'rejete').length,
      montantNonCouvert: Math.round(totalMontantNonCouvert * 100) / 100,
    };

    return NextResponse.json({ exclusions, summary });
  } catch (error) {
    console.error('Erreur exclusions/dépassements:', error);
    return NextResponse.json(
      { erreur: 'Erreur lors du calcul des exclusions et dépassements.' },
      { status: 500 }
    );
  }
}
