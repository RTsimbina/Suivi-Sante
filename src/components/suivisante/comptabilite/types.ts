/**
 * Types partagés de la vue Comptabilité (refactoring P2 — extraits du
 * monolithe comptabilite-view.tsx). Source unique partagée par la page
 * d'assemblage et les présentateurs (KPI, imports, graphique, tableau).
 */

export interface ComptabiliteViewProps {
  kpis: {
    comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
    parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  } | null;
  loading: boolean;
}

export interface Anomalie { ligne: number; type: 'erreur' | 'avertissement'; champ: string; message: string; }

export interface ImportResult {
  importId: string; source: string; nomFichier: string; nbLignes: number;
  nbSucces: number; nbErreurs: number; nbIgnorees?: number; tauxSucces: number;
  anomalies: Anomalie[]; totalMontantImporte?: number;
}
