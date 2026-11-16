'use client';

/**
 * Formulaire de création de dossier — page d'assemblage (refactoring P2 : le
 * monolithe de 541 lignes est découpé dans le dossier `dossier-form/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-dossier-form (référentiels, champs, calcul
 *    debouncé du ticket modérateur, soumission POST + PATCH + uploads) ;
 *  - affichage transverse : titre adapté à la catégorie, observations,
 *    bouton d'enregistrement ;
 *  - délégation : FormBeneficiaire, FormDetails, FormCalcul et
 *    FormJustificatifs.
 */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, Loader2 } from 'lucide-react';
import FormBeneficiaire from './dossier-form/form-beneficiaire';
import FormDetails from './dossier-form/form-details';
import FormCalcul from './dossier-form/form-calcul';
import FormJustificatifs from './dossier-form/form-justificatifs';
import { useDossierForm } from './dossier-form/use-dossier-form';

interface DossierFormProps {
  onSuccess?: () => void;
  defaultCategorie?: 'REMBOURSEMENT_ASSURE' | 'REGLEMENT_PRESTATAIRE';
}

export default function DossierForm({ onSuccess, defaultCategorie }: DossierFormProps) {
  const form = useDossierForm({ onSuccess, defaultCategorie });

  return (
    <Card className="p-6">
      <form onSubmit={form.handleSubmit} className="space-y-6">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Plus className="size-5 text-emerald-600" />
          {form.categorieDossier === 'REGLEMENT_PRESTATAIRE'
            ? 'Nouveau dossier — Règlement Prestataire'
            : form.categorieDossier === 'REMBOURSEMENT_ASSURE'
              ? 'Nouveau dossier — Remboursement Assuré'
              : 'Nouveau dossier'}
        </h3>

        {/* Section 1: Bénéficiaire */}
        <FormBeneficiaire
          beneficiaire={form.beneficiaire}
          onBeneficiaireChange={form.setBeneficiaire}
          assure={form.assure}
          onAssureChange={form.choisirAssure}
          assuresList={form.assuresList}
          societeId={form.societeId}
          nSS={form.nSS}
          onNSSChange={form.setNSS}
          onSocieteChange={form.setSocieteId}
          dateSoins={form.dateSoins}
          onDateSoinsChange={form.setDateSoins}
          prestataire={form.prestataire}
          onPrestataireChange={form.setPrestataire}
          prestatairesList={form.prestatairesList}
          societes={form.societes}
        />

        <Separator />

        {/* Section 2: Dossier */}
        <FormDetails
          typeDossier={form.typeDossier}
          onTypeDossierChange={form.setTypeDossier}
          categorieDossier={form.categorieDossier}
          onCategorieChange={form.setCategorieDossier}
          montantReclame={form.montantReclame}
          onMontantChange={form.setMontantReclame}
          moyenPaiement={form.moyenPaiement}
          onMoyenPaiementChange={form.setMoyenPaiement}
        />

        {/* Auto-calculation: Ticket modérateur */}
        <FormCalcul calculResult={form.calculResult} calculLoading={form.calculLoading} />

        <Separator />

        {/* Section 3: Observations */}
        <div className="space-y-1.5">
          <Label>Observations</Label>
          <Textarea value={form.observations} onChange={e => form.setObservations(e.target.value)} placeholder="Observations éventuelles..." rows={3} />
        </div>

        <Separator />

        {/* Section 4: Justificatifs */}
        <FormJustificatifs
          files={form.files}
          uploadingFiles={form.uploadingFiles}
          fileRef={form.fileRef}
          onAddFiles={form.addFiles}
          onRemoveFile={form.removeFile}
          onFileTypeChange={form.updateFileType}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={form.loading} className="bg-emerald-600 hover:bg-emerald-700">
            {form.loading ? <><Loader2 className="size-4 animate-spin mr-2" /> Enregistrement...</> : <><Plus className="size-4 mr-2" /> Enregistrer le dossier</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
