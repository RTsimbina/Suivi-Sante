'use client';

/**
 * Vue Configuration — page d'assemblage (refactoring P2 : le monolithe de 637
 * lignes est découpé dans le dossier `configuration/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-bots-config (messages bots, statut serveur,
 *    configuration SMTP, actions email) ;
 *  - affichage transverse : bandeau de statut SMTP et carte « Email mensuel »
 *    avec badges de source de configuration ;
 *  - délégation : BotsStatut, SmtpForm, EmailActions, BotsHistorique et
 *    MailServiceCard (déjà un composant dédié).
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Zap, Mail, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import MailServiceCard from '@/components/suivisante/mail-service-card';
import BotsStatut from './configuration/bots-statut';
import SmtpForm from './configuration/smtp-form';
import EmailActions from './configuration/email-actions';
import BotsHistorique from './configuration/bots-historique';
import { useBotsConfig } from './configuration/use-bots-config';

export default function ConfigurationView() {
  const cfg = useBotsConfig();

  return (
    <div className="space-y-6">
      {/* Statut des bots */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-600" />
          Bots de communication
        </h3>
        <BotsStatut bots={cfg.bots} botStatus={cfg.botStatus} />
      </div>

      {/* Configuration Email */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-600" />
              Email mensuel aux sociétés client
            </CardTitle>
            {cfg.configSource === 'db' && (
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                Configuré en base de données
              </Badge>
            )}
            {cfg.configSource === 'env' && !cfg.dbConfig && (
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200">
                Variables d&apos;environnement
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Statut SMTP */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${cfg.smtpStatus !== null && !cfg.smtpStatus.ok ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800' : 'bg-muted/30'}`}>
            {cfg.smtpStatus === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : cfg.smtpStatus.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600" />
            )}
            <span className="text-sm">
              {cfg.smtpStatus === null ? 'Vérification SMTP...' :
                cfg.smtpStatus.ok ? 'Connexion SMTP établie' : 'Service email non configuré'}
            </span>
            {cfg.smtpStatus && cfg.smtpStatus.erreur && (
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
                <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{cfg.smtpStatus.erreur}</pre>
              </div>
            )}
          </div>

          {/* Formulaire de configuration SMTP */}
          <SmtpForm
            smtpForm={cfg.smtpForm}
            onChampChange={(champ, valeur) => cfg.setSmtpForm(f => ({ ...f, [champ]: valeur }))}
            showPassword={cfg.showPassword}
            onTogglePassword={() => cfg.setShowPassword(!cfg.showPassword)}
            dbConfig={cfg.dbConfig}
            configSource={cfg.configSource}
            savingConfig={cfg.savingConfig}
            testingConnection={cfg.testingConnection}
            testConnResult={cfg.testConnResult}
            onTestConnection={cfg.handleTestConnection}
            onSave={cfg.handleSaveConfig}
            onDelete={cfg.handleDeleteConfig}
          />

          {/* Test email + Envoi manuel */}
          <EmailActions
            testEmail={cfg.testEmail}
            onTestEmailChange={cfg.setTestEmail}
            sendingTest={cfg.sendingTest}
            sendingRapport={cfg.sendingRapport}
            smtpConfigured={cfg.smtpConfigured}
            onTestEmail={cfg.handleTestEmail}
            onSendRapport={cfg.handleSendRapport}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Service de messagerie centralisé — monitoring, SPF/DKIM/DMARC, e-mail de test */}
      <MailServiceCard />

      <Separator />

      {/* Historique des messages bots */}
      <BotsHistorique
        messages={cfg.messages}
        loading={cfg.loading}
        filterCanal={cfg.filterCanal}
        onFilterCanalChange={cfg.setFilterCanal}
        deleteConfirm={cfg.deleteConfirm}
        onDeleteConfirmChange={cfg.setDeleteConfirm}
        onRefresh={cfg.fetchMessages}
        onDelete={cfg.handleDelete}
      />
    </div>
  );
}
