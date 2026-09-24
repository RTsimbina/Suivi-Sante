'use client';

/**
 * Vue Prestataires — conteneur principal (onglets, stats, barre d'actions,
 * bannières, layout maître-détail, dialogs).
 *
 * Deux onglets :
 *  - « Conventions par société » : organisation historique par société cliente
 *    (liste maître des sociétés, liens prestataires, conventions actives/suspendues) ;
 *  - « Tous les prestataires » : liste centralisée de tous les prestataires
 *    (recherche, filtres, fiche détaillée, modification avec traçabilité).
 *
 * Découpée en Vague 3 puis étendue (module GESTION → PRESTATAIRES) :
 * - L'état vit dans le hook usePrestatairesData appelé ICI.
 * - Les blocs de rendu sont des présentateurs purs dans ./prestataires/.
 */

import { useState } from 'react';
import { Plus, Loader2, Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { usePrestatairesData } from './prestataires/use-prestataires-data';
import StatsCards from './prestataires/stats-cards';
import { FetchErrorBanner, SyncNeededBanner, InfoBanner } from './prestataires/banners';
import SocieteList from './prestataires/societe-list';
import SocietePrestataires from './prestataires/societe-prestataires';
import LinkDialog from './prestataires/link-dialog';
import CreateDialog from './prestataires/create-dialog';
import AnnuairePrestataires from './prestataires/annuaire-prestataires';
import FichePrestataireDialog from './prestataires/fiche-prestataire-dialog';
import EditPrestataireDialog from './prestataires/edit-prestataire-dialog';

// ─── Composant principal ────────────────────────────────────────────────────

export default function PrestatairesView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';
  const d = usePrestatairesData();

  // Motif d'exception de doublon (création / édition) + dialogue groupe
  const [motifExceptionCreation, setMotifExceptionCreation] = useState('');
  const [motifExceptionEdition, setMotifExceptionEdition] = useState('');
  const [groupeDialogOpen, setGroupeDialogOpen] = useState(false);
  const [groupeNom, setGroupeNom] = useState('');
  const [groupeDescription, setGroupeDescription] = useState('');
  const [groupeErreur, setGroupeErreur] = useState('');
  const [groupeSaving, setGroupeSaving] = useState(false);

  async function creerGroupe() {
    setGroupeErreur('');
    if (groupeNom.trim().length < 2) {
      setGroupeErreur('Le nom du groupe est obligatoire (2 caractères minimum).');
      return;
    }
    setGroupeSaving(true);
    const r = await d.creerGroupe(groupeNom, groupeDescription);
    setGroupeSaving(false);
    if (!r.ok) { setGroupeErreur(r.erreur || 'Erreur'); return; }
    setGroupeNom('');
    setGroupeDescription('');
    setGroupeDialogOpen(false);
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ─── Barre d'actions globale ─── */}
      <div className="flex items-center justify-between">
        <div />
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 text-xs"
              onClick={() => { setGroupeErreur(''); setGroupeDialogOpen(true); }}
            >
              <Users className="h-4 w-4 mr-1.5" /> Nouveau groupe
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs"
              onClick={d.openCreateDialog}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Nouveau prestataire
            </Button>
          </div>
        )}
      </div>

      {/* ─── Onglets : liste centralisée / conventions par société ─── */}
      <Tabs defaultValue="conventions" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="conventions" className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" /> Conventions par société
          </TabsTrigger>
          <TabsTrigger value="annuaire" className="text-xs">
            Tous les prestataires
          </TabsTrigger>
        </TabsList>

        {/* ─── Onglet : Conventions par société (organisation historique) ─── */}
        <TabsContent value="conventions" className="mt-4 space-y-4">
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
        </TabsContent>

        {/* ─── Onglet : Tous les prestataires (liste centralisée) ─── */}
        <TabsContent value="annuaire" className="mt-4">
          {d.fetchError && <FetchErrorBanner message={d.fetchError} />}
          {d.loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <AnnuairePrestataires
              prestataires={d.allPrestatairesList}
              societesParPrestataire={d.societesParPrestataire}
              groupes={d.groupes}
              canEdit={canEdit}
              onOuvrirFiche={d.ouvrirFiche}
              onOuvrirEdition={d.ouvrirEdition}
            />
          )}
        </TabsContent>
      </Tabs>

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
        userRole={userRole}
        groupes={d.groupes}
        createDoublons={d.createDoublons}
        motifException={motifExceptionCreation}
        onMotifExceptionChange={setMotifExceptionCreation}
        onConfirmerException={() => d.confirmerExceptionCreation(motifExceptionCreation)}
        onModifierSaisie={() => d.setCreateDoublons([])}
      />

      {/* ─── Dialog : Fiche détaillée du prestataire ─── */}
      <FichePrestataireDialog
        open={d.ficheOuvert}
        onOpenChange={(open) => { if (!open) d.fermerFiche(); }}
        prestataire={d.fichePrestataire}
        loading={d.ficheLoading}
        canEdit={canEdit}
        onModifier={d.modifierDepuisFiche}
      />

      {/* ─── Dialog : Modifier le prestataire (Admin + Service Technique) ─── */}
      <EditPrestataireDialog
        open={d.editDialogOpen}
        onOpenChange={(open) => {
          d.setEditDialogOpen(open);
          if (!open) {
            d.setEditPrestataire(null);
            d.setEditErrors({});
          }
        }}
        prestataire={d.editPrestataire}
        form={d.editForm}
        onFormChange={d.setEditForm}
        errors={d.editErrors}
        onErrorsChange={d.setEditErrors}
        saving={d.savingEdit}
        onSave={d.handleSaveEdit}
        userRole={userRole}
        groupes={d.groupes}
        doublons={d.editDoublons}
        motifException={motifExceptionEdition}
        onMotifExceptionChange={setMotifExceptionEdition}
        onConfirmerException={() => d.confirmerExceptionEdition(motifExceptionEdition)}
        onModifierSaisie={() => d.setEditDoublons([])}
      />

      {/* ─── Dialogue : nouveau groupe de prestataires ─── */}
      <Dialog open={groupeDialogOpen} onOpenChange={o => { if (!o) setGroupeDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-emerald-600" /> Nouveau groupe de prestataires
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Un groupe regroupe les établissements / agences d&apos;un même opérateur.
              Il justifie les exceptions de doublon lorsque des données communes sont légitimes.
            </p>
            {groupeErreur && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40">
                <p className="text-xs text-red-700 dark:text-red-300">{groupeErreur}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nom du groupe <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex : Groupe Médical ABC"
                value={groupeNom}
                onChange={e => setGroupeNom(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Description (optionnel)</Label>
              <Input
                placeholder="Ex : Réseau de cliniques à Antananarivo et Toamasina"
                value={groupeDescription}
                onChange={e => setGroupeDescription(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setGroupeDialogOpen(false)} disabled={groupeSaving}>
                Annuler
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={creerGroupe} disabled={groupeSaving}>
                {groupeSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Créer le groupe
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
