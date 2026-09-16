'use client';

/**
 * Vue Prestataires — conteneur principal (stats, barre d'actions, bannières,
 * layout maître-détail, dialogs).
 *
 * Découpée en Vague 3 (comportement inchangé) :
 * - L'état vit dans le hook usePrestatairesData appelé ICI.
 * - Les blocs de rendu sont des présentateurs purs dans ./prestataires/.
 */

import { Plus, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { usePrestatairesData } from './prestataires/use-prestataires-data';
import StatsCards from './prestataires/stats-cards';
import { FetchErrorBanner, SyncNeededBanner, InfoBanner } from './prestataires/banners';
import SocieteList from './prestataires/societe-list';
import SocietePrestataires from './prestataires/societe-prestataires';
import LinkDialog from './prestataires/link-dialog';
import CreateDialog from './prestataires/create-dialog';

// ─── Composant principal ────────────────────────────────────────────────────

export default function PrestatairesView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';
  const d = usePrestatairesData();

  // ─── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ─── Barre d'actions globale ─── */}
      <div className="flex items-center justify-between">
        <div />
        {canEdit && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs"
            onClick={d.openCreateDialog}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nouveau prestataire
          </Button>
        )}
      </div>

      {/* ─── Stats ─── */}
      <StatsCards
        totalSocietesAvecPresta={d.totalSocietesAvecPresta}
        totalPrestatairesUniques={d.totalPrestatairesUniques}
        totalLiens={d.totalLiens}
        totalActifs={d.totalActifs}
        totalInactifs={d.totalInactifs}
      />

      {/* ─── Erreur fetch ─── */}
      {d.fetchError && <FetchErrorBanner message={d.fetchError} />}

      {/* ─── Synchronisation nécessaire ─── */}
      <SyncNeededBanner
        show={!d.fetchError && d.liens.length === 0 && !d.loading && d.societes.length > 0 && d.allPrestatairesList.length > 0}
        message={d.syncMessage}
        result={d.syncResult}
        syncing={d.syncing}
        onSync={d.handleSyncFromDossiers}
      />

      {/* ─── Info banner ─── */}
      <InfoBanner />

      {/* ─── Layout maître-détail ─── */}
      {d.loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : d.societes.length === 0 ? (
        <Card><CardContent className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune société enregistrée</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── Colonne gauche : liste des sociétés ─── */}
          <SocieteList
            filteredSocietes={d.filteredSocietes}
            searchSociete={d.searchSociete}
            onSearchSocieteChange={d.setSearchSociete}
            selectedSocieteId={d.selectedSocieteId}
            societeStats={d.societeStats}
            onSelectSociete={d.setSelectedSocieteId}
          />

          {/* ─── Colonne droite : détail société ─── */}
          <SocietePrestataires
            selectedSociete={d.selectedSociete}
            selectedLiens={d.selectedLiens}
            filteredLiens={d.filteredLiens}
            canEdit={canEdit}
            searchPrestataire={d.searchPrestataire}
            onSearchPrestataireChange={d.setSearchPrestataire}
            filterType={d.filterType}
            onFilterTypeChange={d.setFilterType}
            filterStatut={d.filterStatut}
            onFilterStatutChange={d.setFilterStatut}
            deleteConfirm={d.deleteConfirm}
            onDeleteConfirm={d.setDeleteConfirm}
            onCancelDelete={() => d.setDeleteConfirm(null)}
            onToggleActif={d.handleToggleActif}
            onUnlink={d.handleUnlink}
            onOpenLinkDialog={() => d.setLinkDialogOpen(true)}
          />
        </div>
      )}

      {/* ─── Dialog : Ajouter un prestataire à la société ─── */}
      <LinkDialog
        open={d.linkDialogOpen}
        onOpenChange={d.setLinkDialogOpen}
        societeNom={d.selectedSociete?.nom}
        availablePrestataires={d.availablePrestataires}
        linkPrestataireId={d.linkPrestataireId}
        onLinkPrestataireChange={d.setLinkPrestataireId}
        onLink={d.handleLinkPrestataire}
        saving={d.saving}
      />

      {/* ─── Dialog : Créer un nouveau prestataire ─── */}
      <CreateDialog
        open={d.createDialogOpen}
        onOpenChange={d.changeCreateDialogOpen}
        societes={d.societes}
        filteredCreateSocietes={d.filteredCreateSocietes}
        createSocieteSearch={d.createSocieteSearch}
        onSocieteSearchChange={d.setCreateSocieteSearch}
        createSelectedSocietes={d.createSelectedSocietes}
        onToggleSociete={d.toggleSocieteSelection}
        onClearSelectedSocietes={d.clearSocieteSelection}
        createForm={d.createForm}
        onCreateFormChange={d.setCreateForm}
        createError={d.createError}
        createSuccess={d.createSuccess}
        creating={d.creating}
        onCreate={d.handleCreatePrestataire}
      />
    </div>
  );
}
