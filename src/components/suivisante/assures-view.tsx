'use client';

/**
 * Vue Assurés (refactoring P2 : le monolithe de 847 lignes est découpé dans
 * le dossier `assures/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook useAssuresData centralise l'état et les
 *    traitements (listing, filtres, CRUD, import) ;
 *  - délégation : statistiques (stats-cards), barre d'actions (toolbar),
 *    registre des familles (familles-table) et formulaire (assure-form-dialog).
 * Les rôles éditeurs (ADMINISTRATEUR / TECHNIQUE) conservent l'accès aux
 * actions ; le comportement observable est verrouillé par le test de
 * caractérisation assures-view.test.tsx.
 */
import { useAssuresData } from './assures/use-assures-data';
import StatsCards from './assures/stats-cards';
import Toolbar from './assures/toolbar';
import FamillesTable from './assures/familles-table';
import AssureFormDialog from './assures/assure-form-dialog';

export default function AssuresView({ userRole }: { userRole: string }) {
  const canEdit = userRole === 'ADMINISTRATEUR' || userRole === 'TECHNIQUE';
  const d = useAssuresData();

  return (
    <div className="space-y-6">
      {/* ─── Stats ─── */}
      <StatsCards
        nbPrincipaux={d.nbPrincipaux}
        nbConjoints={d.nbConjoints}
        nbEnfants={d.nbEnfants}
        societesCouvertes={d.societesCouvertes}
      />

      {/* ─── Actions ─── */}
      <Toolbar
        search={d.search}
        onSearchChange={d.changerRecherche}
        filterSociete={d.filterSociete}
        onFilterSocieteChange={d.changerFiltreSociete}
        filterType={d.filterType}
        onFilterTypeChange={d.changerFiltreType}
        societes={d.societes}
        canEdit={canEdit}
        onNouveau={d.openCreate}
        importerFichier={d.importerFichier}
      />

      {/* ─── Table des familles ─── */}
      <FamillesTable
        familles={d.filteredFamilies}
        loading={d.loading}
        expandedFamilies={d.expandedFamilies}
        toggleFamily={d.toggleFamily}
        canEdit={canEdit}
        deleteConfirm={d.deleteConfirm}
        setDeleteConfirm={d.setDeleteConfirm}
        saving={d.saving}
        supprimer={d.supprimer}
        openEdit={d.openEdit}
        pagination={d.pagination}
        changerPage={d.changerPage}
        totalBeneficiaires={d.nbPrincipaux + d.nbConjoints + d.nbEnfants}
      />

      {/* ─── Dialog : Formulaire ─── */}
      <AssureFormDialog
        open={d.dialogOpen}
        onOpenChange={d.setDialogOpen}
        editing={d.editingAssure}
        societes={d.societes}
        principaux={d.principaux}
        saving={d.saving}
        onEnregistrer={d.enregistrer}
        formSocieteId={d.formSocieteId} onFormSocieteIdChange={d.setFormSocieteId}
        formNom={d.formNom} onFormNomChange={d.setFormNom}
        formPrenom={d.formPrenom} onFormPrenomChange={d.setFormPrenom}
        formNSS={d.formNSS} onFormNSSChange={d.setFormNSS}
        formMatricule={d.formMatricule} onFormMatriculeChange={d.setFormMatricule}
        formTypeBenef={d.formTypeBenef} onFormTypeBenefChange={d.setFormTypeBenef}
        formAssurePrincipalId={d.formAssurePrincipalId} onFormAssurePrincipalIdChange={d.setFormAssurePrincipalId}
        formCodeFamille={d.formCodeFamille} onFormCodeFamilleChange={d.setFormCodeFamille}
        formDateNaissance={d.formDateNaissance} onFormDateNaissanceChange={d.setFormDateNaissance}
        formSexe={d.formSexe} onFormSexeChange={d.setFormSexe}
        formDateEffet={d.formDateEffet} onFormDateEffetChange={d.setFormDateEffet}
        formBareme={d.formBareme} onFormBaremeChange={d.setFormBareme}
        formTelephone={d.formTelephone} onFormTelephoneChange={d.setFormTelephone}
        formEmail={d.formEmail} onFormEmailChange={d.setFormEmail}
        formAdresse={d.formAdresse} onFormAdresseChange={d.setFormAdresse}
        formActif={d.formActif} onFormActifChange={d.setFormActif}
      />
    </div>
  );
}
