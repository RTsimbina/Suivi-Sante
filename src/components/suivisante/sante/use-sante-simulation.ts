'use client';

/**
 * Hook Contrôle Santé — simulateur multi-actes : lignes de saisie dynamiques
 * et simulation en parallèle via /api/sante/simuler-acte. Extraits tels quels
 * de l'ancien monolithe sante-view.tsx. En cas d'échec réseau, `simuler()`
 * retourne `false` : la vue mère affiche le bandeau d'erreur global
 * (comportement du monolithe, qui écrivait dans le même état `erreur`).
 */
import { useState } from 'react';
import type { SimLigne, MultiSimResult, SimulationResult } from './types';

function ligneVide(): SimLigne {
  return { id: crypto.randomUUID(), typeActe: '', montant: '' };
}

export function useSanteSimulation() {
  const [simLignes, setSimLignes] = useState<SimLigne[]>([ligneVide()]);
  const [simLoading, setSimLoading] = useState(false);
  const [simResults, setSimResults] = useState<MultiSimResult[]>([]);

  function addSimLigne() {
    setSimLignes(prev => [...prev, ligneVide()]);
  }

  function removeSimLigne(id: string) {
    setSimLignes(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  function updateSimLigne(id: string, field: 'typeActe' | 'montant', value: string) {
    setSimLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  // Remise à zéro à chaque nouvelle vérification d'assuré (orchestré par la vue mère)
  function resetSim() {
    setSimResults([]);
    setSimLignes([ligneVide()]);
  }

  // Simulation multi-actes en parallèle — retourne false si une erreur réseau survient
  async function simuler(assureId: string): Promise<boolean> {
    if (!assureId) return true;
    const validLignes = simLignes.filter(l => l.typeActe && parseFloat(l.montant) > 0);
    if (validLignes.length === 0) return true;
    setSimLoading(true);
    setSimResults([]);

    try {
      const promises = validLignes.map(async (ligne) => {
        const res = await fetch('/api/sante/simuler-acte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assureId,
            typeActe: ligne.typeActe,
            montantDemande: parseFloat(ligne.montant),
          }),
        });
        const data = await res.json();
        return {
          ligne,
          result: { ...data, alertes: data.alertes || [], actesIdentiques: data.details?.actesIdentiques || [] } as unknown as SimulationResult,
        };
      });
      const results = await Promise.all(promises);
      setSimResults(results);
      return true;
    } catch {
      return false;
    } finally {
      setSimLoading(false);
    }
  }

  return {
    simLignes, simLoading, simResults,
    addSimLigne, removeSimLigne, updateSimLigne, simuler, resetSim,
    effacerResultats: () => setSimResults([]),
  };
}
