/**
 * Tests P2-04 — Service centralisé du calcul du remboursement /
 * ticket modérateur (src/lib/services/calcul-remboursement.ts).
 *
 * Grille exigée par la mission :
 *   - EXEMPLE DE RÉFÉRENCE exact : 100 000 Ar · 80 % · plafond 500 000 ·
 *     consommé 450 000 → théorique 80 000 · autorisée 50 000 · TM 50 000 ;
 *   - plafond non consommé / partiellement consommé / totalement épuisé ;
 *   - dépense inférieure / supérieure au plafond restant ;
 *   - taux de couverture 80 %, 90 %, 100 % (+ taux décimal) ;
 *   - plusieurs prestations / bénéficiaires / sociétés (consommations
 *     indépendantes → appel par triplet (assuré, acte, barème)) ;
 *   - invariance comptable : part contractuelle + dépassement = TM ;
 *   - précision monétaire (Decimal) : pas d'erreur d'arrondi flottant.
 *
 * Le plafond restant ne dépasse JAMAIS le plafond annuel, les consommations
 * concurrentes sont sérialisées au niveau des appelants (POST/PATCH dossiers :
 * transaction + FOR UPDATE — preuve : scripts/test-calcul-tm.mjs).
 */

import { describe, it, expect } from 'vitest';
import { calculerRemboursement, expliquerRemboursement } from './calcul-remboursement';

describe('calculerRemboursement — exemple de référence (mission P2-04C)', () => {
  it('100 000 Ar · 80 % · plafond 500 000 · consommé 450 000 → TM 50 000', () => {
    const r = calculerRemboursement({
      montantFrais: 100_000,
      tauxCouverture: 80,
      plafondAnnuel: 500_000,
      consommationAnterieure: 450_000,
    });
    expect(r.priseEnChargeTheorique).toBe(80_000);
    expect(r.plafondRestant).toBe(50_000);
    expect(r.plafondEpuise).toBe(false);
    expect(r.priseEnChargeAutorisee).toBe(50_000); // borne par le plafond, PAS le taux
    expect(r.partContractuelleAssure).toBe(20_000);
    expect(r.depassementPlafond).toBe(30_000);
    expect(r.ticketModerateur).toBe(50_000);
    // Invariance comptable : TM = part contractuelle + dépassement
    expect(r.partContractuelleAssure + r.depassementPlafond).toBe(r.ticketModerateur);
    // L'assureur paie l'autorisée : la dépense est intégralement répartie
    expect(r.priseEnChargeAutorisee + r.ticketModerateur).toBe(100_000);
  });
});

describe('plafond annuel — non consommé / partiel / épuisé', () => {
  it('plafond NON consommé : la prise en charge reste au taux du contrat', () => {
    const r = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 0,
    });
    expect(r.plafondRestant).toBe(500_000);
    expect(r.priseEnChargeAutorisee).toBe(80_000);
    expect(r.depassementPlafond).toBe(0);
    expect(r.ticketModerateur).toBe(20_000);
  });

  it('plafond PARTIELLEMENT consommé : borne la prise en charge à l\'exact reste', () => {
    const r = calculerRemboursement({
      montantFrais: 60_000, tauxCouverture: 80, plafondAnnuel: 100_000, consommationAnterieure: 70_000,
    });
    // théorique 48 000 ; restant 30 000 ; autorisée 30 000 ; TM 30 000
    expect(r.priseEnChargeTheorique).toBe(48_000);
    expect(r.plafondRestant).toBe(30_000);
    expect(r.priseEnChargeAutorisee).toBe(30_000);
    expect(r.depassementPlafond).toBe(18_000);
    expect(r.partContractuelleAssure).toBe(12_000);
    expect(r.ticketModerateur).toBe(30_000);
  });

  it('plafond TOTALEMENT épuisé : aucun remboursement, TM = dépense totale', () => {
    const r = calculerRemboursement({
      montantFrais: 45_000, tauxCouverture: 80, plafondAnnuel: 100_000, consommationAnterieure: 100_000,
    });
    expect(r.plafondEpuise).toBe(true);
    expect(r.plafondRestant).toBe(0);
    expect(r.priseEnChargeAutorisee).toBe(0);
    expect(r.ticketModerateur).toBe(45_000);
    expect(r.depassementPlafond).toBe(36_000); // théorique 36 000 absorbé par le plafond
    expect(r.partContractuelleAssure).toBe(9_000);
  });

  it('consommation DÉPASSANT le plafond (saisie historique) : restant jamais négatif', () => {
    const r = calculerRemboursement({
      montantFrais: 10_000, tauxCouverture: 80, plafondAnnuel: 100_000, consommationAnterieure: 120_000,
    });
    expect(r.plafondRestant).toBe(0);
    expect(r.plafondEpuise).toBe(true);
    expect(r.priseEnChargeAutorisee).toBe(0);
    expect(r.ticketModerateur).toBe(10_000);
  });
});

describe('dépense vs plafond restant', () => {
  it('dépense INFÉRIEURE au plafond restant : aucun dépassement, TM = part contractuelle', () => {
    const r = calculerRemboursement({
      montantFrais: 40_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 100_000,
    });
    expect(r.depassementPlafond).toBe(0);
    expect(r.ticketModerateur).toBe(8_000);
    expect(r.priseEnChargeAutorisee).toBe(32_000);
  });

  it('dépense SUPÉRIEURE au plafond restant : dépassement distinct de la part contractuelle', () => {
    const r = calculerRemboursement({
      montantFrais: 200_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 430_000,
    });
    // théorique 160 000 ; restant 70 000 ; autorisée 70 000
    expect(r.priseEnChargeAutorisee).toBe(70_000);
    expect(r.partContractuelleAssure).toBe(40_000);
    expect(r.depassementPlafond).toBe(90_000);
    expect(r.ticketModerateur).toBe(130_000);
    expect(r.partContractuelleAssure + r.depassementPlafond).toBe(r.ticketModerateur);
  });
});

describe('taux de couverture 80 % / 90 % / 100 % et taux décimal', () => {
  const base = { montantFrais: 100_000, plafondAnnuel: 1_000_000, consommationAnterieure: 0 };

  it('taux 90 %', () => {
    const r = calculerRemboursement({ ...base, tauxCouverture: 90 });
    expect(r.priseEnChargeAutorisee).toBe(90_000);
    expect(r.ticketModerateur).toBe(10_000);
  });

  it('taux 100 % : part contractuelle nulle — TM = 0 tant que le plafond suit', () => {
    const r = calculerRemboursement({ ...base, tauxCouverture: 100 });
    expect(r.priseEnChargeTheorique).toBe(100_000);
    expect(r.ticketModerateur).toBe(0);
    expect(r.partContractuelleAssure).toBe(0);
  });

  it('taux 100 % avec plafond dépassé : TM = dépassement uniquement', () => {
    const r = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 100, plafondAnnuel: 100_000, consommationAnterieure: 90_000,
    });
    expect(r.priseEnChargeAutorisee).toBe(10_000);
    expect(r.depassementPlafond).toBe(90_000);
    expect(r.ticketModerateur).toBe(90_000);
  });

  it('taux décimal 65,5 % : arrondi comptable exact (pas d\'erreur IEEE 754)', () => {
    const r = calculerRemboursement({ ...base, tauxCouverture: 65.5 });
    expect(r.priseEnChargeTheorique).toBe(65_500);
    expect(r.ticketModerateur).toBe(34_500);
  });

  it('montant à décimales : 123 456,78 Ar à 80 % → précision centime', () => {
    const r = calculerRemboursement({
      montantFrais: 123_456.78, tauxCouverture: 80, plafondAnnuel: 1_000_000, consommationAnterieure: 0,
    });
    expect(r.priseEnChargeTheorique).toBeCloseTo(98_765.42, 2);
    expect(r.ticketModerateur).toBeCloseTo(24_691.36, 2);
    expect(r.priseEnChargeAutorisee + r.ticketModerateur).toBeCloseTo(123_456.78, 2);
  });
});

describe('plusieurs prestations / bénéficiaires / sociétés — consommations indépendantes', () => {
  it('deux prestations d\'une même année : chaque plafond d\'acte est calculé séparément', () => {
    const consultation = calculerRemboursement({
      montantFrais: 50_000, tauxCouverture: 80, plafondAnnuel: 100_000, consommationAnterieure: 90_000,
    });
    const hospitalisation = calculerRemboursement({
      montantFrais: 300_000, tauxCouverture: 90, plafondAnnuel: 800_000, consommationAnterieure: 400_000,
    });
    expect(consultation.priseEnChargeAutorisee).toBe(10_000); // restant 10 000 < théo 40 000
    expect(hospitalisation.priseEnChargeAutorisee).toBe(270_000); // restant 400 000 > théo 270 000
  });

  it('deux BÉNÉFICIAIRES : le plafond ne se partage pas (consommations propres)', () => {
    const assureA = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 490_000,
    });
    const assureB = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 0,
    });
    expect(assureA.priseEnChargeAutorisee).toBe(10_000);
    expect(assureB.priseEnChargeAutorisee).toBe(80_000);
  });

  it('deux SOCIÉTÉS : barèmes et plafonds indépendants', () => {
    const societeX = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 90, plafondAnnuel: 200_000, consommationAnterieure: 180_000,
    });
    const societeY = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 70, plafondAnnuel: 1_000_000, consommationAnterieure: 0,
    });
    expect(societeX.priseEnChargeAutorisee).toBe(20_000);
    expect(societeX.ticketModerateur).toBe(80_000);
    expect(societeY.priseEnChargeAutorisee).toBe(70_000);
    expect(societeY.ticketModerateur).toBe(30_000);
  });
});

describe('expliquerRemboursement — message lisible sans double comptabilisation', () => {
  it('cas avec dépassement : distingue part contractuelle et dépassement du plafond', () => {
    const r = calculerRemboursement({
      montantFrais: 100_000, tauxCouverture: 80, plafondAnnuel: 500_000, consommationAnterieure: 450_000,
    });
    const texte = expliquerRemboursement(r);
    // formatAr utilise des espaces fines insécables — normalisation pour l'assertion
    const texteNormalise = texte.replace(/[\u202f\u00a0]/g, ' ');
    expect(texteNormalise).toContain('80 000');
    expect(texteNormalise).toContain('50 000');
    expect(texte).toContain('dépassement');
    expect(texte).toContain('part contractuelle');
  });

  it('plafond épuisé : message explicite', () => {
    const r = calculerRemboursement({
      montantFrais: 45_000, tauxCouverture: 80, plafondAnnuel: 100_000, consommationAnterieure: 100_000,
    });
    expect(expliquerRemboursement(r)).toContain('épuisé');
  });
});
