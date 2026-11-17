'use client';

/**
 * Hook : simulateur du ticket modérateur (P2-04 — CALCUL CENTRALISÉ BACKEND).
 *
 * AVANT : le calcul était effectué LOCALEMENT (montantCouvert × taux) SANS
 * plafond annuel restant — divergent du moteur métier. DÉSORMAIS :
 *   - le simulateur sélectionne un ASSURÉ de la société (la prise en compte
 *     du plafond annuel restant exige sa consommation de l'année) ;
 *   - le calcul est fait par POST /api/sante/simuler-acte →
 *     src/lib/services/calcul-remboursement.ts (source unique de vérité :
 *     même moteur que la création de dossiers et le Contrôle Santé) ;
 *   - le hook n'additionne plus rien : il mappe la réponse serveur pour
 *     l'affichage.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { AssureOption, CalculResult, PRESTATION_LABELS, Societe } from './types';

export function useCalculTM(societes: Societe[]) {
  const [calcSocieteId, setCalcSocieteId] = useState<string | undefined>(undefined);
  const [calcPrestation, setCalcPrestation] = useState<string | undefined>(undefined);
  const [calcAssureId, setCalcAssureId] = useState<string | undefined>(undefined);
  const [assures, setAssures] = useState<AssureOption[]>([]);
  const [calcMontant, setCalcMontant] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<CalculResult | null>(null);

  // Chargement des assurés de la société sélectionnée (afin de passer
  // assureId au backend — la consommation annuelle est calculée côté serveur).
  useEffect(() => {
    setAssures([]);
    setCalcAssureId(undefined);
    if (!calcSocieteId) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/assures?societeId=${encodeURIComponent(calcSocieteId)}&limit=500`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          assures?: { id: string; nom: string; prenom: string | null; matricule: string | null; typeBeneficiaire: string }[];
        };
        if (!annule) {
          setAssures(
            (json.assures ?? []).map(a => ({
              id: a.id,
              nom: a.nom,
              prenom: a.prenom,
              matricule: a.matricule,
              typeBeneficiaire: a.typeBeneficiaire,
            })),
          );
        }
      } catch {
        // Chargement best effort : le bouton reste désactivé sans assuré.
      }
    })();
    return () => {
      annule = true;
    };
  }, [calcSocieteId]);

  const handleCalculer = async () => {
    if (!calcSocieteId || !calcPrestation || !calcAssureId || !calcMontant || calcMontant === '0') {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    const montant = parseFloat(calcMontant);
    if (isNaN(montant) || montant <= 0) {
      toast.error('Le montant doit être un nombre positif');
      return;
    }
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

    setCalcLoading(true);
    setCalcResult(null);
    try {
      // ─── P2-04 : le CALCUL est fait par le backend (source de vérité) ──
      const res = await fetch('/api/sante/simuler-acte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assureId: calcAssureId, typeActe: calcPrestation, montantDemande: montant }),
      });
      const json = (await res.json()) as {
        erreur?: string;
        autorise?: boolean;
        message?: string;
        details?: Record<string, number | undefined>;
        alertes?: { type: string; message: string }[];
      };
      if (!res.ok) {
        toast.error(json.erreur || 'Simulation impossible');
        return;
      }

      const d = json.details ?? {};
      if (d.partAssureur === undefined || d.ticketModerateur === undefined) {
        // Raison bloquante du moteur (plafond acte/global atteint…) :
        // pas de prise en charge — tout reste à la charge de l'assuré.
        setCalcResult({
          bareme: { tauxCouverture: Number(d.tauxCouverture ?? 0), plafond: Number(d.plafondActe ?? 0) },
          montantCouvert: 0,
          montantRembourse: 0,
          ticketModerateur: montant,
          explication: [json.message, ...(json.alertes ?? []).map(a => a.message)].filter(Boolean).join(' '),
          priseEnChargeTheorique: undefined,
          consommationAnterieure: Number(d.consommeActe ?? 0),
          plafondRestant: Number(d.reliquatActe ?? 0),
          partContractuelleAssure: undefined,
          depassementPlafond: undefined,
          autorise: json.autorise ?? false,
        });
        return;
      }

      // Réponse complète du moteur : mapping direct, AUCUN calcul local.
      setCalcResult({
        bareme: { tauxCouverture: Number(d.tauxCouverture ?? 0), plafond: Number(d.plafondActe ?? 0) },
        montantCouvert: Number(d.montantCouvert ?? 0),
        montantRembourse: Number(d.partAssureur),
        ticketModerateur: Number(d.ticketModerateur),
        explication: [json.message, ...(json.alertes ?? []).map(a => a.message)].filter(Boolean).join(' '),
        priseEnChargeTheorique: d.priseEnChargeTheorique,
        consommationAnterieure: d.consommeActe,
        plafondRestant: d.reliquatActe,
        partContractuelleAssure: d.partContractuelleAssure,
        depassementPlafond: d.depassementPlafond,
        autorise: json.autorise,
      });
    } catch {
      toast.error('Erreur réseau. Veuillez réessayer.');
    } finally {
      setCalcLoading(false);
    }
  };

  return {
    calcSocieteId,
    setCalcSocieteId,
    calcPrestation,
    setCalcPrestation,
    calcAssureId,
    setCalcAssureId,
    assures,
    calcMontant,
    setCalcMontant,
    calcLoading,
    calcResult,
    handleCalculer,
  };
}

export type CalculTMState = ReturnType<typeof useCalculTM>;
