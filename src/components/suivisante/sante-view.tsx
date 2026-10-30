'use client';

/**
 * Vue Contrôle Santé — Vérification Assuré (refactoring P2 : le monolithe
 * de 1070 lignes est découpé dans le dossier `sante/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : une nouvelle vérification remet à zéro le simulateur et
 *    l'historique des actes (comportement du monolithe d'origine) ;
 *  - affichage transverse : en-tête, bandeau d'erreur global et alertes ;
 *  - délégation : recherche (verifier-search), fiche assuré/société
 *    (assure-fiche), historique (actes-history), plafonds (plafonds-actes)
 *    et simulateur (simulateur-actes) ;
 *  - intégration de la période partagée (barre en haut de page).
 */
import {
  HeartPulse, ShieldCheck, ShieldX, AlertTriangle, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePeriode } from '@/lib/periode-context';
import { versDateISO } from '@/lib/periodes';
import type { SearchResult } from './sante/types';
import { useSanteVerification } from './sante/use-sante-verification';
import { useSanteActes } from './sante/use-sante-actes';
import { useSanteSimulation } from './sante/use-sante-simulation';
import VerifierSearch from './sante/verifier-search';
import AssureFiche from './sante/assure-fiche';
import ActesHistory from './sante/actes-history';
import PlafondsActes from './sante/plafonds-actes';
import SimulateurActes from './sante/simulateur-actes';

export default function SanteView() {
  // Filtre de période partagé (date de référence : date de réception des dossiers)
  const { plage: plagePeriode } = usePeriode();
  const dateDebutPeriode = plagePeriode ? versDateISO(plagePeriode.debut) : '';
  const dateFinPeriode = plagePeriode ? versDateISO(new Date(plagePeriode.fin.getTime() - 1)) : '';

  const verification = useSanteVerification();
  const simulation = useSanteSimulation();
  const actes = useSanteActes({
    assureId: verification.result?.assure.id ?? '',
    dateDebutPeriode,
    dateFinPeriode,
  });

  const assureId = verification.result?.assure.id ?? '';

  // Une nouvelle vérification remet à zéro simulateur et historique (comme le monolithe)
  async function verifier(identifiant: string) {
    simulation.resetSim();
    actes.resetActes();
    await verification.verifier(identifiant);
  }

  function choisirResultat(r: SearchResult) {
    verification.choisirResultat(r);
    verifier(r.id);
  }

  async function simuler() {
    if (!verification.result) return;
    const ok = await simulation.simuler(assureId);
    if (!ok) verification.setErreur('Erreur lors de la simulation.');
  }

  // Compteur de filtres actifs (la période est gérée par la barre partagée, ne compte pas ici)
  const nbFiltresActifs = [
    actes.filtreType,
    actes.filtreStatut,
    actes.filtreSearch,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-emerald-600" />
          Contrôle Santé — Vérification Assuré
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Recherchez un assuré par son N° SS, nom, prénom ou email pour vérifier ses plafonds, ses droits et consulter l'historique de ses actes.
        </p>
      </div>

      {/* Barre de recherche + autocomplétion */}
      <VerifierSearch
        query={verification.query}
        loading={verification.loading}
        searchResults={verification.searchResults}
        showResults={verification.showResults}
        onSearch={verification.handleSearch}
        onVerifier={verifier}
        onResultClick={choisirResultat}
      />

      {/* Erreur */}
      {verification.erreur && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{verification.erreur}</p>
        </div>
      )}

      {/* Résultats */}
      {verification.result && (
        <>
          {/* Alertes */}
          {verification.result.alertes.length > 0 && (
            <div className="space-y-2">
              {verification.result.alertes.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3 flex items-start gap-3 text-sm',
                    a.type === 'danger' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
                    a.type === 'warning' && 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
                    a.type === 'info' && 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
                  )}
                >
                  {a.type === 'danger' ? <ShieldX className="h-5 w-5 mt-0.5 shrink-0" /> :
                   a.type === 'warning' ? <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" /> :
                   <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" />}
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Fiche Assuré + Société */}
          <AssureFiche result={verification.result} />

          {/* Historique des actes réalisés */}
          <ActesHistory
            assureId={assureId}
            actes={actes.actes}
            pagination={actes.actesPagination}
            filtres={actes.actesFiltres}
            loading={actes.actesLoading}
            showFiltres={actes.showFiltres}
            onToggleFiltres={() => actes.setShowFiltres(!actes.showFiltres)}
            nbFiltresActifs={nbFiltresActifs}
            filtreType={actes.filtreType}
            onFiltreTypeChange={actes.setFiltreType}
            filtreStatut={actes.filtreStatut}
            onFiltreStatutChange={actes.setFiltreStatut}
            filtreSearch={actes.filtreSearch}
            onFiltreSearchChange={actes.setFiltreSearch}
            dateDebutPeriode={dateDebutPeriode}
            dateFinPeriode={dateFinPeriode}
            page={actes.actesPage}
            onPageChange={actes.setActesPage}
            onAppliquer={actes.appliquerFiltres}
            onReset={actes.resetFiltres}
          />

          {/* Plafonds par type d'acte */}
          <PlafondsActes result={verification.result} />

          {/* Simulateur multi-actes */}
          <SimulateurActes
            typesActe={Object.keys(verification.result.consommationParActe)}
            simLignes={simulation.simLignes}
            simLoading={simulation.simLoading}
            simResults={simulation.simResults}
            onAddLigne={simulation.addSimLigne}
            onRemoveLigne={simulation.removeSimLigne}
            onUpdateLigne={simulation.updateSimLigne}
            onSimuler={simuler}
            onEffacerResultats={simulation.effacerResultats}
          />
        </>
      )}
    </div>
  );
}
