'use client';

/**
 * Présentateur des actions email (refactoring P2 — extrait du monolithe
 * configuration-view.tsx) : envoi d'un email de test et déclenchement manuel
 * du rapport mensuel (planifié automatiquement le 1er du mois à 07h00).
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Calendar } from 'lucide-react';

interface EmailActionsProps {
  testEmail: string;
  onTestEmailChange: (valeur: string) => void;
  sendingTest: boolean;
  sendingRapport: boolean;
  smtpConfigured: boolean;
  onTestEmail: () => void;
  onSendRapport: () => void;
}

export default function EmailActions({
  testEmail,
  onTestEmailChange,
  sendingTest,
  sendingRapport,
  smtpConfigured,
  onTestEmail,
  onSendRapport,
}: EmailActionsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Test email */}
      <div className="space-y-2">
        <Label>Envoyer un email de test</Label>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="destinataire@email.com"
            value={testEmail}
            onChange={e => onTestEmailChange(e.target.value)}
            disabled={!smtpConfigured}
          />
          <Button
            variant="outline"
            onClick={onTestEmail}
            disabled={sendingTest || !testEmail || !smtpConfigured}
            className="shrink-0"
            title={!smtpConfigured ? 'Configurez SMTP d\'abord' : undefined}
          >
            {sendingTest && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Tester
          </Button>
        </div>
      </div>

      {/* Envoi manuel */}
      <div className="space-y-2">
        <Label>Déclencher l&apos;envoi mensuel manuellement</Label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center text-sm text-muted-foreground px-3 h-9 rounded-md border bg-muted/30">
            <Calendar className="h-4 w-4 mr-2" />
            Automatique le 1er de chaque mois à 07h00
          </div>
          <Button
            onClick={onSendRapport}
            disabled={sendingRapport || !smtpConfigured}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            title={!smtpConfigured ? 'Configurez SMTP d\'abord' : undefined}
          >
            {sendingRapport && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Envoyer maintenant
          </Button>
        </div>
      </div>
    </div>
  );
}
