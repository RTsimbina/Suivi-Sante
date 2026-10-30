'use client';

/**
 * Vue Réception Courriels (refactoring P2 : le monolithe de 950 lignes est
 * découpé dans le dossier `reception/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook useReceptionData centralise l'état et les
 *    traitements (listing, filtres, création, édition, suppression) ;
 *  - affichage transverse : squelette de chargement et carte « Informations
 *    capturées à la réception » ;
 *  - délégation : indicateurs (kpi-cards), pipeline (pipeline-card), liste
 *    des courriels (courriels-card) et dialogues (create/detail/delete).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePeriode } from '@/lib/periode-context';
import { useReceptionData } from './reception/use-reception-data';
import KpiCards, { type ReceptionKpis } from './reception/kpi-cards';
import PipelineCard from './reception/pipeline-card';
import CourrielsCard from './reception/courriels-card';
import CourrielCreateDialog from './reception/courriel-create-dialog';
import CourrielDetailDialog from './reception/courriel-detail-dialog';
import CourrielDeleteAlert from './reception/courriel-delete-alert';

interface ReceptionViewProps {
  kpis: Record<string, unknown> | null;
  loading: boolean;
}

export default function ReceptionView({ kpis, loading }: ReceptionViewProps) {
  const { queryString: qsPeriode } = usePeriode();
  const d = useReceptionData(qsPeriode);

  // Extract reception KPIs safely
  const receptionKpis = kpis?.reception as ReceptionKpis | undefined;

  // ─── Render: loading state ───────────────────────────────────────────────
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── KPI Cards ───────────────────────────────────────────────────── */}
      <KpiCards kpis={receptionKpis} />

      {/* ─── Pipeline ────────────────────────────────────────────────────── */}
      <PipelineCard />

      {/* ─── Courriels Section ───────────────────────────────────────────── */}
      <CourrielsCard
        courriels={d.courriels}
        pagination={d.pagination}
        loading={d.loadingCourriels}
        filterType={d.filterType}
        onFilterTypeChange={d.setFilterType}
        filterStatut={d.filterStatut}
        onFilterStatutChange={d.setFilterStatut}
        searchQuery={d.searchQuery}
        onSearchQueryChange={d.setSearchQuery}
        onOpenDetail={d.ouvrirDetail}
        onNouveau={d.ouvrirCreation}
        onPageChange={d.changerPage}
      />

      {/* ─── Informations capturées à la réception ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Informations capturées à la réception</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Numéro dossier', value: 'Généré par le serveur', auto: true },
              { label: 'Nom bénéficiaire', value: 'Saisie manuelle' },
              { label: 'Société', value: 'Sélection client' },
              { label: 'Date réception', value: 'Date du jour' },
              { label: 'Type de dossier', value: 'Hosp., Consult., Pharm., etc.' },
              { label: 'Source', value: 'Excel (Power Automate)' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                  {item.auto && <Badge variant="outline" className="mt-1 text-emerald-600 border-emerald-200 dark:border-emerald-800 text-[10px]">Auto-généré par IA</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialogues : création, détail/édition, suppression ───────────── */}
      <CourrielCreateDialog
        open={d.createOpen}
        onOpenChange={d.setCreateOpen}
        societes={d.societes}
        formType={d.formType}
        onFormTypeChange={d.setFormType}
        formExpediteur={d.formExpediteur}
        onFormExpediteurChange={d.setFormExpediteur}
        formObjet={d.formObjet}
        onFormObjetChange={d.setFormObjet}
        formSocieteId={d.formSocieteId}
        onFormSocieteIdChange={d.setFormSocieteId}
        formBeneficiaire={d.formBeneficiaire}
        onFormBeneficiaireChange={d.setFormBeneficiaire}
        formMontant={d.formMontant}
        onFormMontantChange={d.setFormMontant}
        formDateCourriel={d.formDateCourriel}
        onFormDateCourrielChange={d.setFormDateCourriel}
        formDateSoins={d.formDateSoins}
        onFormDateSoinsChange={d.setFormDateSoins}
        formPrestataire={d.formPrestataire}
        onFormPrestataireChange={d.setFormPrestataire}
        submitting={d.formSubmitting}
        onCreer={d.creer}
      />

      <CourrielDetailDialog
        open={d.detailOpen}
        onOpenChange={d.changerDetailOuverture}
        courriel={d.selectedCourriel}
        editMode={d.editMode}
        onEditModeChange={d.setEditMode}
        editStatut={d.editStatut}
        onEditStatutChange={d.setEditStatut}
        editObservations={d.editObservations}
        onEditObservationsChange={d.setEditObservations}
        editDossierId={d.editDossierId}
        onEditDossierIdChange={d.setEditDossierId}
        editSubmitting={d.editSubmitting}
        onMettreAJour={d.mettreAJour}
        onSupprimer={() => d.setDeleteOpen(true)}
      />

      <CourrielDeleteAlert
        open={d.deleteOpen}
        onOpenChange={d.setDeleteOpen}
        expediteur={d.selectedCourriel?.expediteur}
        onSupprimer={d.supprimer}
      />
    </div>
  );
}
