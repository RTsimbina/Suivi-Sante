'use client';

/**
 * Dialogue de création / modification d'un utilisateur : identité, rôle
 * (Radix Select), champ Société pour la liaison CONTACT_ENTREPRISE (avec
 * préremplissage depuis le contact principal), mot de passe masqué avec
 * bascule de visibilité. Présentateur pur — extraits tels quels de l'ancien
 * monolithe utilisateurs-view.tsx.
 */
import { Pencil, UserCog, Loader2, Eye, EyeOff, Info, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ROLES, type FormData, type Utilisateur, type SocieteRef, type LiaisonInfo } from './types';

interface UtilisateurFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Utilisateur | null;
  formData: FormData;
  setFormData: (updater: (f: FormData) => FormData) => void;
  submitting: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  societes: SocieteRef[];
  liaison: LiaisonInfo | null;
  onSubmit: (e: React.FormEvent) => void;
}

export default function UtilisateurFormDialog({
  open, onOpenChange, editing, formData, setFormData,
  submitting, showPassword, setShowPassword,
  societes, liaison, onSubmit,
}: UtilisateurFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <><Pencil className="h-4 w-4 text-emerald-600" /> Modifier l'utilisateur</>
            ) : (
              <><UserCog className="h-4 w-4 text-emerald-600" /> Nouvel utilisateur</>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Nom */}
          <div className="space-y-1.5">
            <Label htmlFor="user-nom" className="text-sm font-medium">Nom complet</Label>
            <Input
              id="user-nom"
              placeholder="Ex: Jean Dupont"
              value={formData.nom}
              onChange={e => setFormData(f => ({ ...f, nom: e.target.value }))}
              required
              className="h-9"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="user-email" className="text-sm font-medium">Adresse e-mail</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="nom@suivisante.mg"
              value={formData.email}
              onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
              required
              className="h-9"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="user-role" className="text-sm font-medium">Role</Label>
            <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir un role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-block h-2 w-2 rounded-full', r.value === 'ADMINISTRATEUR' ? 'bg-red-500' : r.value === 'ACCUEIL' ? 'bg-blue-500' : r.value === 'TECHNIQUE' ? 'bg-amber-500' : r.value === 'COMPTABILITE' ? 'bg-green-500' : r.value === 'SANTE' ? 'bg-teal-500' : r.value === 'PORTAIL_CLIENT' ? 'bg-violet-500' : 'bg-indigo-500')} />
                      {r.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.role === 'PORTAIL_CLIENT' && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                L'e-mail doit correspondre a un assure existant dans la base.
              </p>
            )}
            {formData.role === 'CONTACT_ENTREPRISE' && liaison && liaison.detail && (
              <p className={cn(
                'text-[11px] mt-1 flex items-start gap-1',
                liaison.etat === 'TROUVE' && 'text-emerald-600 dark:text-emerald-400',
                liaison.etat === 'CREABLE' && 'text-blue-600 dark:text-blue-400',
                liaison.etat === 'BLOQUE' && 'text-amber-600 dark:text-amber-400',
                liaison.etat === 'VERIFIE' && 'text-muted-foreground',
              )}>
                {liaison.etat === 'TROUVE'
                  ? <CheckCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  : liaison.etat === 'BLOQUE'
                    ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    : <Info className="h-3 w-3 mt-0.5 shrink-0" />}
                {liaison.detail}
              </p>
            )}
            {formData.role === 'CONTACT_ENTREPRISE' && !liaison && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                L'e-mail doit correspondre a un contact d'entreprise existant.
              </p>
            )}
          </div>

          {/* Société (CONTACT_ENTREPRISE uniquement) : permet la création
              en une étape du compte + du contact d'entreprise lié */}
          {formData.role === 'CONTACT_ENTREPRISE' && (
            <div className="space-y-1.5">
              <Label htmlFor="user-societe" className="text-sm font-medium">
                Societe du representant
              </Label>
              <Select
                value={formData.societeId || undefined}
                onValueChange={v => setFormData(f => {
                  const soc = societes.find(x => x.id === v);
                  // Contact Entreprise = contact principal de la société :
                  // préremplir l'e-mail (et le nom) s'ils sont encore vides.
                  const prefillEmail = !f.email.trim() && soc?.emailContactPrincipal ? soc.emailContactPrincipal : f.email;
                  const prefillNom = !f.nom.trim() && soc?.contactPrincipal ? soc.contactPrincipal : f.nom;
                  return { ...f, societeId: v, email: prefillEmail, nom: prefillNom };
                })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir la société à rattacher" />
                </SelectTrigger>
                <SelectContent>
                  {societes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Aucune societe disponible</div>
                  ) : (
                    societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {(() => {
                const soc = societes.find(x => x.id === formData.societeId);
                if (soc?.contactPrincipal || soc?.emailContactPrincipal) {
                  return (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Contact principal : {soc.contactPrincipal || '—'}{soc.emailContactPrincipal ? ` (${soc.emailContactPrincipal})` : ''}
                    </p>
                  );
                }
                return (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Astuce : saisissez d'abord le contact principal et son e-mail dans Modifier la société.
                  </p>
                );
              })()}
            </div>
          )}

          {/* Mot de passe */}
          <div className="space-y-1.5">
            <Label htmlFor="user-password" className="text-sm font-medium">
              Mot de passe {editing && <span className="text-muted-foreground font-normal">(laisser vide pour ne pas modifier)</span>}
            </Label>
            <div className="relative">
              <Input
                id="user-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={editing ? 'Nouveau mot de passe (optionnel)' : 'Minimum 8 caracteres, lettres + chiffres'}
                value={formData.password}
                onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                required={!editing}
                minLength={8}
                className="h-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {!editing && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Au moins 8 caractères, avec au moins une lettre et un chiffre.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editing ? 'Enregistrer' : "Creer l'utilisateur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
