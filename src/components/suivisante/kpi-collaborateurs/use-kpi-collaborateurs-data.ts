'use client';

/**
 * use-kpi-collaborateurs-data.ts — Chargement des données du module KPI
 * (rubrique Administration « KPI – Performance des collaborateurs »).
 * Un seul appel /api/kpi/performance (bundle complet) + /api/kpi/objectifs
 * pour l'onglet paramétrage. Filtres : période (contexte global), service,
 * societeId. Les chiffres proviennent du moteur serveur — aucun calcul côté
 * client (exigence audit §11).
 */

import { useCallback, useEffect, useState } from 'react';
import { usePeriode } from '@/lib/periode-context';

export interface KpiCollaborateurUI {
  userId: string;
  nom?: string;
  service?: string;
  attribues: number;
  traites: number;
  enCours: number;
  enRetard: number;
  delaiMoyenPriseEnChargeMin: number | null;
  tempsMoyenTraitementMin: number | null;
  delaiMedianTraitementMin: number | null;
  tauxRespectDelais: number | null;
  tauxRetourCorrection: number | null;
  evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
}

export interface KpiServiceUI extends Omit<KpiCollaborateurUI, 'userId' | 'nom'> {
  service: string;
}

export interface KpiPerfBundle {
  periode: { debut: string; fin: string };
  performance: {
    totalTraites: number;
    totalAffectes: number;
    enCours: number;
    enRetard: number;
    delaiMoyenTraitementMin: number | null;
    delaiMedianTraitementMin: number | null;
    delaiMoyenResponsabiliteMin: number | null;
    tauxRespectDelais: number | null;
    tauxRetourCorrection: number | null;
    parService: KpiServiceUI[];
    parCollaborateur: KpiCollaborateurUI[];
    evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
    evolutionAnnuelle: { annee: string; traites: number; tauxRespect: number | null }[];
  };
  alertes: {
    dossiersProches: { dossierId: string; numeroDossier: string; service: string; pourcentageObjectif: number }[];
    dossiersDepasses: { dossierId: string; numeroDossier: string; service: string; pourcentageObjectif: number }[];
    accumulations: { service: string; nbOuverts: number; seuil: number }[];
    degradations: { service: string; tauxActuel: number; tauxPrecedent: number; seuil: number }[];
    hausseRetours: { service: string; taux: number; seuil: number }[];
  };
  objectifs: { service: string; typeDossier: string | null; delaiMinutes: number }[];
}

export interface ObjectifsBundle {
  enVigueur: { id: string; service: string; typeDossier: string | null; delaiMinutes: number; valideDu: string; motif: string | null }[];
  historique: { id: string; service: string; typeDossier: string | null; delaiMinutes: number; valideDu: string; valideAu: string; motif: string | null }[];
}

export const SERVICES_KPI_UI = ['ACCUEIL', 'TECHNIQUE', 'CONTROLE_MEDICAL', 'COMPTABILITE'] as const;

export function useKpiCollaborateursData(service: string, societeId?: string) {
  const { queryString: qsPeriode } = usePeriode();
  const [bundle, setBundle] = useState<KpiPerfBundle | null>(null);
  const [objectifs, setObjectifs] = useState<ObjectifsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const params = new URLSearchParams();
      if (qsPeriode) for (const [k, v] of new URLSearchParams(qsPeriode)) params.set(k, v);
      if (service) params.set('service', service);
      if (societeId) params.set('societeId', societeId);
      const qs = params.toString();
      const res = await fetch(`/api/kpi/performance${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.erreur ?? `Erreur ${res.status}`);
      }
      setBundle(await res.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [qsPeriode, service, societeId]);

  const rechargerObjectifs = useCallback(async () => {
    const res = await fetch('/api/kpi/objectifs');
    if (res.ok) setObjectifs(await res.json());
  }, []);

  useEffect(() => { recharger(); }, [recharger]);
  useEffect(() => { rechargerObjectifs(); }, [rechargerObjectifs]);

  return { bundle, objectifs, loading, erreur, recharger, rechargerObjectifs };
}

/** Téléchargement d'un export (blob) — pattern reporting-view. */
export async function telechargerExportKpi(format: 'xlsx' | 'pdf', service: string): Promise<void> {
  const params = new URLSearchParams({ format });
  if (service) params.set('service', service);
  const res = await fetch(`/api/kpi/export?${params.toString()}`);
  if (!res.ok) throw new Error('Export impossible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kpi-collaborateurs-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
