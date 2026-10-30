'use client';

/**
 * Vue Gestion Utilisateurs (refactoring P2 : le monolithe de 798 lignes est
 * découpé dans le dossier `utilisateurs/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook useUtilisateursData centralise l'état et les
 *    traitements (listing filtré, CRUD, activation, liaison en direct) ;
 *  - affichage transverse : barre de filtres avec bouton de création ;
 *  - délégation : statistiques (stats-cards), tableau (utilisateurs-table)
 *    et formulaire (utilisateur-form-dialog).
 */
import { Search, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useUtilisateursData } from './utilisateurs/use-utilisateurs-data';
import StatsCards from './utilisateurs/stats-cards';
import FilterSelect from './utilisateurs/filter-select';
import UtilisateursTable from './utilisateurs/utilisateurs-table';
import UtilisateurFormDialog from './utilisateurs/utilisateur-form-dialog';
import { ROLES } from './utilisateurs/types';

export default function UtilisateursView() {
  const d = useUtilisateursData();

  return (
    <div className="space-y-4">
      {/* Stats rapides */}
      <StatsCards
        totalUsers={d.totalUsers}
        actifs={d.actifs}
        inactifs={d.inactifs}
        lockedUsers={d.lockedUsers}
      />

      {/* Barre de filtres + bouton creation */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou e-mail..."
                value={d.search}
                onChange={e => d.setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {d.search && (
                <button onClick={() => d.setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <FilterSelect
              value={d.filtreRole}
              onChange={v => d.setFiltreRole(v)}
              placeholder="Tous les roles"
              options={ROLES.map(r => ({ value: r.value, label: r.label }))}
              className="w-full md:w-44"
            />
            <FilterSelect
              value={d.filtreActif}
              onChange={v => d.setFiltreActif(v)}
              placeholder="Statut"
              options={[{ value: 'true', label: 'Actif' }, { value: 'false', label: 'Inactif' }]}
              className="w-full md:w-32"
            />
            <Button onClick={d.openCreateDialog} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm shrink-0">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nouvel utilisateur
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <UtilisateursTable
        utilisateurs={d.utilisateurs}
        loading={d.loading}
        onToggleActif={d.toggleActif}
        onEdit={d.openEditDialog}
        onDelete={d.supprimer}
        deleteConfirm={d.deleteConfirm}
        setDeleteConfirm={d.setDeleteConfirm}
        deleting={d.deleting}
      />

      {/* Dialog Creation / Modification */}
      <UtilisateurFormDialog
        open={d.dialogOpen}
        onOpenChange={d.setDialogOpen}
        editing={d.editingUser}
        formData={d.formData}
        setFormData={d.setFormData}
        submitting={d.submitting}
        showPassword={d.showPassword}
        setShowPassword={d.setShowPassword}
        societes={d.societes}
        liaison={d.liaison}
        onSubmit={d.enregistrer}
      />
    </div>
  );
}
