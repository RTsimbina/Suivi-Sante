'use client';

/**
 * Journal de Bord — page d'assemblage (refactoring P2 : le monolithe de 696
 * lignes est découpé dans le dossier `journal/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-journal-data (stats, entrées paginées,
 *    filtres, exports) et l'état de sélection de l'entrée détaillée ;
 *  - affichage transverse : chargement, erreur, état vide, overlay d'export
 *    et pagination partagée ;
 *  - délégation : JournalHeader, JournalStats, JournalFiltres,
 *    JournalTable et JournalDetail.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { SharedPagination } from '@/components/ui/shared-pagination';
import JournalHeader from './journal/journal-header';
import JournalStats from './journal/journal-stats';
import JournalFiltres from './journal/journal-filtres';
import JournalTable from './journal/journal-table';
import JournalDetail from './journal/journal-detail';
import { useJournalData } from './journal/use-journal-data';
import type { HistoriqueEntry } from './journal/types';

export default function JournalView() {
  const journal = useJournalData();
  const [selectedEntry, setSelectedEntry] = useState<HistoriqueEntry | null>(null);

  return (
    <div className="space-y-4 max-w-[1400px]">

      {/* ═══ En-tête (titre + exports) ═══ */}
      <JournalHeader exporting={journal.exporting} onExport={journal.handleExport} />

      {/* ═══ Tableau de bord KPI ═══ */}
      {journal.stats && <JournalStats stats={journal.stats} />}

      {/* ═══ Filtres ═══ */}
      <JournalFiltres
        entite={journal.entite}
        onEntiteChange={journal.setEntite}
        action={journal.action}
        onActionChange={journal.setAction}
        niveau={journal.niveau}
        onNiveauChange={journal.changerNiveau}
        criticalOnly={journal.criticalOnly}
        onToggleCriticalOnly={journal.toggleCriticalOnly}
        utilisateurId={journal.utilisateurId}
        onUtilisateurChange={journal.setUtilisateurId}
        utilisateurs={journal.utilisateurs}
        societeId={journal.societeId}
        onSocieteChange={journal.setSocieteId}
        societes={journal.societes}
        recherche={journal.recherche}
        onRechercheChange={journal.setRecherche}
        onReset={journal.resetFilters}
      />

      {/* ═══ Chargement ═══ */}
      {journal.loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">Chargement du journal...</span>
        </div>
      )}

      {/* ═══ Erreur ═══ */}
      {journal.error && !journal.loading && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{journal.error}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Vide ═══ */}
      {!journal.loading && !journal.error && journal.entries.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Aucun événement trouvé.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Les opérations de paramétrage apparaîtront ici.</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Tableau principal ═══ */}
      {!journal.loading && journal.entries.length > 0 && (
        <>
          <JournalTable
            entries={journal.entries}
            selectedEntry={selectedEntry}
            onSelectEntry={setSelectedEntry}
          />

          {/* ═══ Panneau détail ═══ */}
          {selectedEntry && (
            <JournalDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
          )}

          <SharedPagination pagination={journal.pagination!} onPageChange={(p) => journal.fetchEntries(p)} label="résultat" />
        </>
      )}

      {/* ═══ Overlay d'export ═══ */}
      {journal.exporting && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <span className="text-sm">Génération de l&apos;export en cours...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
