'use client';

/**
 * Hook des alertes IA d'un dossier (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : chargement de /api/alertes puis filtrage des
 * messages mentionnant le numéro de dossier ou le bénéficiaire.
 * Dépendance sur l'objet dossier complet (comme le monolithe) : un
 * rafraîchissement du dossier relance l'analyse.
 */
import { useState, useEffect } from 'react';
import type { AlerteIa, DossierDetail } from './types';

export function useDossierAlertesIa(dossier: DossierDetail | null) {
  const [alertes, setAlertes] = useState<AlerteIa[]>([]);
  const [loadingAlertes, setLoadingAlertes] = useState(true);

  useEffect(() => {
    async function charger() {
      setLoadingAlertes(true);
      try {
        const res = await fetch('/api/alertes');
        if (res.ok) {
          const data = await res.json();
          const toutes: AlerteIa[] = [
            ...(data.anomalies || []).map((a: {type: string; message: string}) => ({
              type: a.type,
              niveau: 'warning' as const,
              message: a.message,
            })),
            ...(data.incoherences || []).map((a: {type: string; message: string}) => ({
              type: a.type,
              niveau: 'error' as const,
              message: a.message,
            })),
          ];
          // Filtrer les alertes pertinentes pour ce dossier
          const filtrees = toutes.filter((alerte) =>
            dossier && alerte.message.toLowerCase().includes(dossier.numeroDossier?.toLowerCase()) ||
            dossier && alerte.message.toLowerCase().includes(dossier.beneficiaire?.toLowerCase())
          );
          setAlertes(filtrees);
        }
      } catch {
        // silencieux
      } finally {
        setLoadingAlertes(false);
      }
    }
    charger();
  }, [dossier]);

  return { alertes, loadingAlertes };
}
