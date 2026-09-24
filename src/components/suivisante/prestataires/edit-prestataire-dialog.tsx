'use client';

/**
 * Dialog « Modifier le prestataire » — mise à jour des informations de la
 * fiche (rubrique GESTION → Prestataires).
 *
 * Profils autorisés : Administrateur et Utilisateur du Service Technique
 * uniquement (le bouton d'ouverture n'existe que pour ces profils, et
 * l'autorisation PUT est tranchée côté serveur via API_PERMISSIONS — un
 * profil non autorisé reçoit un 403, il ne peut pas contourner la règle
 * depuis le navigateur).
 *
 * Validation AVANT enregistrement, avec les MÊMES schémas Zod que l'API
 * (validations.ts) : format de l'e-mail, du téléphone, du NIF, du Num STAT,
 * du RIB, champs obligatoires. Les doublons (nom, e-mail, NIF, Num STAT)
 * sont détectés côté serveur (409) et affichés à l'utilisateur.
 *
 * Chaque champ enregistré est journalisé dans le Journal d'Audit des
 * Paramétrages (ancienne valeur / nouvelle valeur) côté serveur.
 */

import { AlertTriangle, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import {
  CreateFormState, EditFormState, PrestataireItem, DoublonInfo, GroupeItem,
  STATUTS_CONVENTIONNELS, STATUT_CONVENTIONNEL_LABELS,
  STATUTS_JURIDIQUES_PRESTATAIRE, STATUT_JURIDIQUE_LABELS, TYPE_LABELS,
} from './types';
import { validerFormulairePrestataire } from './validations';
import DoublonExceptionPanel from './doublon-exception';

function ErreurChamp({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
      <AlertTriangle className="h-3 w-3 shrink-0" /> {message}
    </p>
  );
}

export default function EditPrestataireDialog({
  open,
  onOpenChange,
  prestataire,
  form,
  onFormChange,
  errors,
  onErrorsChange,
  saving,
  onSave,
  userRole,
  groupes,
  doublons,
  motifException,
  onMotifExceptionChange,
  onConfirmerException,
  onModifierSaisie,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestataire: PrestataireItem | null;
  form: EditFormState;
  onFormChange: (updater: (f: CreateFormState) => CreateFormState) => void;
  errors: Record<string, string>;
  onErrorsChange: (errors: Record<string, string>) => void;
  saving: boolean;
  onSave: (form: CreateFormState) => void;
  userRole: string;
  groupes: GroupeItem[];
  doublons: DoublonInfo[];
  motifException: string;
  onMotifExceptionChange: (motif: string) => void;
  onConfirmerException: () => void;
  onModifierSaisie: () => void;
}) {
  function handleEnregistrer() {
    const erreurs = validerFormulairePrestataire(form);
    onErrorsChange(erreurs);
    if (Object.keys(erreurs).length > 0) return;
    onSave(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-emerald-600" /> Modifier le prestataire
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {prestataire?.nom} — chaque modification est enregistrée dans le Journal d&apos;Audit
            des Paramétrages (champ, ancienne valeur, nouvelle valeur, utilisateur).
          </p>

          {/* Doublons détectés (409) + validation d'exception Administrateur */}
          <DoublonExceptionPanel
            doublons={doublons}
            isAdmin={userRole === 'ADMINISTRATEUR'}
            saving={saving}
            groupes={groupes}
            motif={motifException}
            onMotifChange={onMotifExceptionChange}
            onConfirmer={onConfirmerException}
            onModifierSaisie={onModifierSaisie}
          />

          {/* Nom * */}
          <div className="space-y-1">
            <Label htmlFor="edit-nom" className="text-xs font-medium">Nom / Raison sociale <span className="text-red-500">*</span></Label>
            <Input
              id="edit-nom"
              value={form.nom}
              onChange={e => onFormChange(f => ({ ...f, nom: e.target.value }))}
              className="h-9 text-sm"
              aria-invalid={Boolean(errors.nom)}
              autoFocus
            />
            <ErreurChamp message={errors.nom} />
          </div>

          {/* Type * + Statut juridique */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-type" className="text-xs font-medium">Type / Catégorie <span className="text-red-500">*</span></Label>
              <select
                id="edit-type"
                value={form.type}
                onChange={e => onFormChange(f => ({ ...f, type: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sélectionner...</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <ErreurChamp message={errors.type} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-statutJuridique" className="text-xs font-medium">Statut juridique</Label>
              <select
                id="edit-statutJuridique"
                value={form.statutJuridique}
                onChange={e => onFormChange(f => ({ ...f, statutJuridique: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Non défini —</option>
                {STATUTS_JURIDIQUES_PRESTATAIRE.map(s => (
                  <option key={s} value={s}>{STATUT_JURIDIQUE_LABELS[s] ?? s}</option>
                ))}
              </select>
              <ErreurChamp message={errors.statutJuridique} />
            </div>
          </div>

          {/* Téléphone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-telephone" className="text-xs font-medium">Téléphone</Label>
              <Input
                id="edit-telephone"
                placeholder="+261 34 12 345 67"
                value={form.telephone}
                onChange={e => onFormChange(f => ({ ...f, telephone: e.target.value }))}
                className="h-9 text-sm"
                aria-invalid={Boolean(errors.telephone)}
              />
              <ErreurChamp message={errors.telephone} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email" className="text-xs font-medium">Adresse e-mail</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="contact@prestataire.mg"
                value={form.email}
                onChange={e => onFormChange(f => ({ ...f, email: e.target.value }))}
                className="h-9 text-sm"
                aria-invalid={Boolean(errors.email)}
              />
              <ErreurChamp message={errors.email} />
            </div>
          </div>

          {/* Adresse */}
          <div className="space-y-1">
            <Label htmlFor="edit-adresse" className="text-xs font-medium">Adresse</Label>
            <Input
              id="edit-adresse"
              placeholder="Ex : Lot XYZ, Antananarivo"
              value={form.adresse}
              onChange={e => onFormChange(f => ({ ...f, adresse: e.target.value }))}
              className="h-9 text-sm"
            />
            <ErreurChamp message={errors.adresse} />
          </div>

          {/* Code prestataire + Groupe */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-code" className="text-xs font-medium">Code prestataire</Label>
              <Input
                id="edit-code"
                placeholder="Ex : PRE-001"
                value={form.code}
                onChange={e => onFormChange(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="h-9 text-sm"
              />
              <ErreurChamp message={errors.code} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-groupe" className="text-xs font-medium">Groupe de prestataires</Label>
              <select
                id="edit-groupe"
                value={form.groupePrestataireId}
                onChange={e => onFormChange(f => ({ ...f, groupePrestataireId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Aucun groupe</option>
                {groupes.map(g => (
                  <option key={g.id} value={g.id}>{g.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NIF + Num STAT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-nif" className="text-xs font-medium">NIF</Label>
              <Input
                id="edit-nif"
                placeholder="3000 123 456"
                value={form.nif}
                onChange={e => onFormChange(f => ({ ...f, nif: e.target.value }))}
                className="h-9 text-sm"
                aria-invalid={Boolean(errors.nif)}
              />
              <ErreurChamp message={errors.nif} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-stat" className="text-xs font-medium">Num STAT</Label>
              <Input
                id="edit-stat"
                placeholder="6512 311 2001 01234"
                value={form.stat}
                onChange={e => onFormChange(f => ({ ...f, stat: e.target.value }))}
                className="h-9 text-sm"
                aria-invalid={Boolean(errors.stat)}
              />
              <ErreurChamp message={errors.stat} />
            </div>
          </div>

          {/* Statut conventionnel + RIB */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-statut" className="text-xs font-medium">Statut conventionnel</Label>
              <select
                id="edit-statut"
                value={form.statut}
                onChange={e => onFormChange(f => ({ ...f, statut: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Non défini —</option>
                {STATUTS_CONVENTIONNELS.map(s => (
                  <option key={s} value={s}>{STATUT_CONVENTIONNEL_LABELS[s]}</option>
                ))}
                {/* Valeurs historiques hors liste : conservées à l'affichage */}
                {!form.statut || STATUTS_CONVENTIONNELS.includes(form.statut as typeof STATUTS_CONVENTIONNELS[number]) ? null : (
                  <option value={form.statut}>{form.statut}</option>
                )}
              </select>
              <ErreurChamp message={errors.statut} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-rib" className="text-xs font-medium">RIB / Coordonnées bancaires</Label>
              <Input
                id="edit-rib"
                placeholder="000 12345 67890 12 3"
                value={form.rib}
                onChange={e => onFormChange(f => ({ ...f, rib: e.target.value }))}
                className="h-9 text-sm"
                aria-invalid={Boolean(errors.rib)}
              />
              <ErreurChamp message={errors.rib} />
            </div>
          </div>

          {/* IBAN */}
          <div className="space-y-1">
            <Label htmlFor="edit-iban" className="text-xs font-medium">IBAN (si applicable)</Label>
            <Input
              id="edit-iban"
              placeholder="Ex : MG48..."
              value={form.iban}
              onChange={e => onFormChange(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
              className="h-9 text-sm"
            />
            <ErreurChamp message={errors.iban} />
          </div>

          {/* Boutons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleEnregistrer}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
