'use client';

/**
 * Hook : calcul du ticket modérateur (100% frontend, pas d'appel API).
 * Extrait de technique-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState } from 'react';
import { toast } from 'sonner';

import { CalculResult, PRESTATION_LABELS, Societe } from './types';

export function useCalculTM(societes: Societe[]) {
  const [calcSocieteId, setCalcSocieteId] = useState<string | undefined>(undefined);
  const [calcPrestation, setCalcPrestation] = useState<string | undefined>(undefined);
  const [calcMontant, setCalcMontant] = useState('');
  const [calcResult, setCalcResult] = useState<CalculResult | null>(null);

  const handleCalculer = () => {
    if (!calcSocieteId || !calcPrestation || !calcMontant || calcMontant === '0') {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    const montant = parseFloat(calcMontant);
    if (isNaN(montant) || montant <= 0) {
      toast.error('Le montant doit être un nombre positif');
      return;
    }

    // Trouver la société et son barème directement dans le state
    const societe = societes.find((s) => s.id === calcSocieteId);
    if (!societe) {
      toast.error('Société introuvable');
      return;
    }

    const bareme = societe.baremes?.find((b) => b.prestation === calcPrestation);
    if (!bareme || (!bareme.tauxCouverture && !bareme.plafond)) {
      toast.error(`Aucun barème configuré pour "${PRESTATION_LABELS[calcPrestation] || calcPrestation}" dans "${societe.nom}". Modifiez d'abord les barèmes de cette société.`);
      return;
    }

    // Calcul
    const montantCouvert = Math.min(montant, bareme.plafond);
    const montantRembourse = Math.round(montantCouvert * (bareme.tauxCouverture / 100) * 100) / 100;
    const ticketModerateur = Math.round((montant - montantRembourse) * 100) / 100;
    const plafondAtteint = montant > bareme.plafond;

    const explication = plafondAtteint
      ? `Le montant réclamé (${montant.toLocaleString('fr-FR')} Ar) dépasse le plafond de ${bareme.plafond.toLocaleString('fr-FR')} Ar. Le montant couvert est plafonné à ${montantCouvert.toLocaleString('fr-FR')} Ar. Avec un taux de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} Ar. Le ticket modérateur est de ${ticketModerateur.toLocaleString('fr-FR')} Ar.`
      : `Le montant réclamé (${montant.toLocaleString('fr-FR')} Ar) est dans la limite du plafond (${bareme.plafond.toLocaleString('fr-FR')} Ar). Avec un taux de ${bareme.tauxCouverture}%, le montant remboursé est de ${montantRembourse.toLocaleString('fr-FR')} Ar. Le ticket modérateur est de ${ticketModerateur.toLocaleString('fr-FR')} Ar.`;

    setCalcResult({
      bareme: { tauxCouverture: bareme.tauxCouverture, plafond: bareme.plafond },
      montantCouvert,
      montantRembourse,
      ticketModerateur,
      explication,
    });
  };

  return {
    calcSocieteId,
    setCalcSocieteId,
    calcPrestation,
    setCalcPrestation,
    calcMontant,
    setCalcMontant,
    calcResult,
    handleCalculer,
  };
}

export type CalculTMState = ReturnType<typeof useCalculTM>;
