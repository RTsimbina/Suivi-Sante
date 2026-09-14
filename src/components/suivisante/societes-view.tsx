'use client';

/**
 * Vue Sociétés — conteneur principal (stats, barre d'actions, layout
 * maître-détail, dialogs).
 *
 * Découpée en Vague 3 (comportement inchangé) :
 * - L'état vit dans les hooks useSocietesList / useContacts appelés ICI.
 * - La liste et le détail sont des présentateurs purs dans ./societes/.
 */

import { Building2, Search, Plus, Users, FileText, DollarSign, Loader2, Stethoscope, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { useSocietesList } from './societes/use-societes-list';
import { useContacts } from './societes/use-contacts';
import SocietesList from './societes/societes-list';
import SocieteDetail from './societes/societe-detail';
import type { Societe } from './societes/types';

// ─── Composant principal ────────────────────────────────────────────────────

interface Props {
  userRole?: string;
}

export default function SocietesView({ userRole }: Props) {
  const canWrite = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';
  const canManageContacts = ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'].includes(userRole || '');

  const list = useSocietesList();
  const contacts = useContacts(list.selectedId);

  // ─── Rendu ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{list.societes.length}</p>
              <p className="text-[11px] text-muted-foreground">Sociétés ({list.societesActives} actives)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{list.totalAssures}</p>
              <p className="text-[11px] text-muted-foreground">Assurés totaux</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{list.totalBaremes}</p>
              <p className="text-[11px] text-muted-foreground">Barèmes configurés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{list.totalDossiers}</p>
              <p className="text-[11px] text-muted-foreground">Dossiers totaux</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{list.totalContrats}</p>
              <p className="text-[11px] text-muted-foreground">Contrats actifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barre d'actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une société..."
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {canWrite && (
          <Button onClick={list.openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle société
          </Button>
        )}
      </div>

      {/* ─── Layout maître-détail ─── */}
      {list.loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : list.societes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune société trouvée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── Colonne gauche : liste des sociétés ─── */}
          <SocietesList
            societes={list.societes}
            selectedId={list.selectedId}
            detailsMap={list.detailsMap}
            canWrite={canWrite}
            onSelect={(id) => { list.setSelectedId(id); list.setActiveTab('baremes'); }}
            onEdit={(s: Societe) => list.openEdit(s)}
            onDelete={(id: string) => list.setDeleteConfirm(id)}
          />

          {/* ─── Colonne droite : détail de la société sélectionnée ─── */}
          <div className="lg:col-span-8 xl:col-span-9">
            {!list.selectedSociete ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Sélectionnez une société</p>
                  <p className="text-xs mt-1">Cliquez sur une société dans la liste pour voir ses détails</p>
                </CardContent>
              </Card>
            ) : (
              <SocieteDetail
                societe={list.selectedSociete}
                contrats={list.contratsMap[list.selectedSociete.id] || []}
                details={list.details}
                isLoading={list.isLoading}
                activeTab={list.activeTab}
                onTabChange={list.setActiveTab}
                canManageContacts={canManageContacts}
                rapportLoading={list.rapportLoading}
                onDownloadRapport={list.handleDownloadRapport}
                filteredBaremes={list.filteredBaremes}
                baremeSearch={list.baremeSearch}
                setBaremeSearch={list.setBaremeSearch}
                filteredAssures={list.filteredAssures}
                assureSearch={list.assureSearch}
                setAssureSearch={list.setAssureSearch}
                filteredPrestataires={list.filteredPrestataires}
                prestataireSearch={list.prestataireSearch}
                setPrestataireSearch={list.setPrestataireSearch}
                contacts={contacts.filteredContacts}
                contactsCount={contacts.contacts.length}
                contactSearch={contacts.contactSearch}
                setContactSearch={contacts.setContactSearch}
                contactsLoading={contacts.contactsLoading}
                onAddContact={contacts.openNewContact}
                onEditContact={contacts.openEditContact}
                onDeleteContact={(id: string) => contacts.setContactDeleteId(id)}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── Dialog : Créer / Modifier une société ─── */}
      <Dialog open={list.formOpen} onOpenChange={list.setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{list.editing ? 'Modifier la société' : 'Nouvelle société'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nom *</Label>
              <Input value={list.formNom} onChange={e => list.setFormNom(e.target.value)} className="h-8 text-sm" placeholder="Nom de la société" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Téléphone</Label>
                <Input value={list.formTelephone} onChange={e => list.setFormTelephone(e.target.value)} className="h-8 text-sm" placeholder="034 00 000 00" />
              </div>
              <div>
                <Label className="text-xs">NIF</Label>
                <Input value={list.formNif} onChange={e => list.setFormNif(e.target.value)} className="h-8 text-sm" placeholder="NIF" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={list.formEmail} onChange={e => list.setFormEmail(e.target.value)} className="h-8 text-sm" type="email" placeholder="email@exemple.com" />
            </div>
            <div>
              <Label className="text-xs">Adresse</Label>
              <Input value={list.formAdresse} onChange={e => list.setFormAdresse(e.target.value)} className="h-8 text-sm" placeholder="Adresse" />
            </div>
            <div>
              <Label className="text-xs">Contact principal</Label>
              <Input value={list.formContact} onChange={e => list.setFormContact(e.target.value)} className="h-8 text-sm" placeholder="Nom du contact" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => list.setFormOpen(false)} className="h-8 text-sm">Annuler</Button>
              <Button onClick={list.handleSave} disabled={list.saving || !list.formNom.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm">
                {list.saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {list.editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : Confirmation de suppression ─── */}
      <Dialog open={!!list.deleteConfirm} onOpenChange={() => list.setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. La société et tous ses barèmes associés seront supprimés.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => list.setDeleteConfirm(null)} className="h-8 text-sm">Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => list.deleteConfirm && list.handleDelete(list.deleteConfirm)}
              className="h-8 text-sm"
            >
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : Formulaire contact ─── */}
      <Dialog open={contacts.contactFormOpen} onOpenChange={contacts.setContactFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{contacts.editingContact ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom *</Label>
                <Input value={contacts.cFormNom} onChange={e => contacts.setCFormNom(e.target.value)} className="h-8 text-sm" placeholder="Nom" />
              </div>
              <div>
                <Label className="text-xs">Prénom</Label>
                <Input value={contacts.cFormPrenom} onChange={e => contacts.setCFormPrenom(e.target.value)} className="h-8 text-sm" placeholder="Prénom" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Fonction</Label>
              <Input value={contacts.cFormFonction} onChange={e => contacts.setCFormFonction(e.target.value)} className="h-8 text-sm" placeholder="Directeur, Responsable RH..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Téléphone</Label>
                <Input value={contacts.cFormTel} onChange={e => contacts.setCFormTel(e.target.value)} className="h-8 text-sm" placeholder="034 00 000 00" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={contacts.cFormEmail} onChange={e => contacts.setCFormEmail(e.target.value)} className="h-8 text-sm" type="email" placeholder="email@exemple.com" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => contacts.setContactFormOpen(false)} className="h-8 text-sm">Annuler</Button>
              <Button onClick={contacts.handleSaveContact} disabled={contacts.contactSaving || !contacts.cFormNom.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-sm">
                {contacts.contactSaving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {contacts.editingContact ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : Confirmation suppression contact ─── */}
      <Dialog open={!!contacts.contactDeleteId} onOpenChange={() => contacts.setContactDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Supprimer ce contact
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => contacts.setContactDeleteId(null)} className="h-8 text-sm">Annuler</Button>
            <Button variant="destructive" onClick={() => contacts.contactDeleteId && contacts.handleDeleteContact(contacts.contactDeleteId)} className="h-8 text-sm">Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
