'use client';

/**
 * Présentateur du formulaire de configuration SMTP (refactoring P2 — extrait
 * du monolithe configuration-view.tsx) : 6 champs, aide contextuelle
 * Microsoft 365 / Gmail, résultat du test de connexion, boutons tester /
 * sauvegarder et suppression de la configuration en base.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Loader2, Plug, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import type { SmtpConfigDB, SmtpConfigForm } from './types';

interface SmtpFormProps {
  smtpForm: SmtpConfigForm;
  onChampChange: (champ: keyof SmtpConfigForm, valeur: string) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  dbConfig: SmtpConfigDB | null;
  configSource: 'db' | 'env' | 'aucune';
  savingConfig: boolean;
  testingConnection: boolean;
  testConnResult: { ok: boolean; message: string } | null;
  onTestConnection: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function SmtpForm({
  smtpForm,
  onChampChange,
  showPassword,
  onTogglePassword,
  dbConfig,
  configSource,
  savingConfig,
  testingConnection,
  testConnResult,
  onTestConnection,
  onSave,
  onDelete,
}: SmtpFormProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Plug className="h-3.5 w-3.5 text-emerald-600" />
          Configuration du serveur SMTP
        </h4>
        {dbConfig && (
          <Button variant="ghost" size="sm" className="text-[11px] h-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" /> Supprimer
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Hôte SMTP <span className="text-red-500">*</span></Label>
          <Input
            type="text"
            placeholder="smtp.exemple.com"
            value={smtpForm.smtpHost}
            onChange={e => onChampChange('smtpHost', e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Port</Label>
          <Input
            type="number"
            placeholder="587"
            value={smtpForm.smtpPort}
            onChange={e => onChampChange('smtpPort', e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Utilisateur <span className="text-red-500">*</span></Label>
          <Input
            type="text"
            placeholder="votre@email.com"
            value={smtpForm.smtpUser}
            onChange={e => onChampChange('smtpUser', e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mot de passe <span className="text-red-500">*</span></Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={dbConfig ? '•••••••• (inchangé si vide)' : 'Votre mot de passe'}
              value={smtpForm.smtpPass}
              onChange={e => onChampChange('smtpPass', e.target.value)}
              className="h-9 text-sm pr-9"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={onTogglePassword}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Adresse expéditeur <span className="text-red-500">*</span></Label>
          <Input
            type="email"
            placeholder="noreply@votre-domaine.com"
            value={smtpForm.smtpFrom}
            onChange={e => onChampChange('smtpFrom', e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Destinataire rapports (copie admin)</Label>
          <Input
            type="email"
            placeholder="rapport@votre-domaine.com"
            value={smtpForm.emailRapportDestinataire}
            onChange={e => onChampChange('emailRapportDestinataire', e.target.value)}
            className="h-9 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">Reçoit une copie de chaque rapport mensuel en plus des contacts de la société</p>
        </div>
      </div>

      {/* Aide contextuelle Microsoft 365 / Gmail */}
      {smtpForm.smtpHost && (
        <div className="text-[10px] text-blue-600 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-2 space-y-0.5">
          {smtpForm.smtpHost.toLowerCase().includes('office365') || smtpForm.smtpHost.toLowerCase().includes('outlook') ? (
            <>
              <p className="font-semibold">Microsoft 365 / Outlook détecté</p>
              <p>Hôte : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">smtp.office365.com</code> — Port : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">587</code></p>
              <p>Si MFA est activé, utilisez un <strong>Mot de passe d&apos;application</strong> (<a href="https://myaccount.microsoft.com/security-info" target="_blank" rel="noopener" className="underline">myaccount.microsoft.com/security-info</a>), pas le mot de passe du compte.</p>
            </>
          ) : smtpForm.smtpHost.toLowerCase().includes('gmail') || smtpForm.smtpHost.toLowerCase().includes('google') ? (
            <>
              <p className="font-semibold">Gmail détecté</p>
              <p>Hôte : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">smtp.gmail.com</code> — Port : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">587</code></p>
              <p>Utilisez un <strong>Mot de passe d&apos;application</strong> (<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="underline">myaccount.google.com/apppasswords</a>), pas le mot de passe du compte.</p>
            </>
          ) : null}
        </div>
      )}

      {/* Résultat du test de connexion */}
      {testConnResult && (
        <div className={`p-3 rounded ${testConnResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-start gap-2">
            {testConnResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{testConnResult.message}</pre>
          </div>
        </div>
      )}

      {/* Boutons d'action */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onTestConnection}
          disabled={testingConnection || !smtpForm.smtpHost || !smtpForm.smtpUser || (!smtpForm.smtpPass && !dbConfig)}
          className="text-xs h-8"
        >
          {testingConnection ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plug className="h-3.5 w-3.5 mr-1" />}
          Tester la connexion
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={savingConfig || !smtpForm.smtpHost || !smtpForm.smtpUser || (!smtpForm.smtpPass && !dbConfig) || !smtpForm.smtpFrom}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
        >
          {savingConfig ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Sauvegarder
        </Button>
      </div>

      {configSource === 'env' && !dbConfig && (
        <p className="text-[10px] text-blue-600 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded p-2">
          La configuration actuelle provient des variables d&apos;environnement (.env). Vous pouvez la remplacer en remplissant le formulaire ci-dessus.
        </p>
      )}
    </div>
  );
}
