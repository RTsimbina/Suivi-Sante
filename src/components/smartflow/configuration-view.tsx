'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot, MessageSquare, Send, Loader2, CheckCircle2, XCircle, RefreshCw,
  Mail, Calendar, Search, Trash2, Zap, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface BotStatus {
  nom: string;
  canal: string;
  actif: boolean;
  messagesTotal: number;
  icon: typeof Bot;
  couleur: string;
}

interface MessageBot {
  id: string;
  canal: string;
  expeditieurId: string;
  expeditieurNom: string;
  message: string;
  reponse: string;
  lu: boolean;
  createdAt: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ConfigurationView() {
  const [messages, setMessages] = useState<MessageBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingRapport, setSendingRapport] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [smtpStatus, setSmtpStatus] = useState<{ ok: boolean; erreur?: string } | null>(null);
  const [filterCanal, setFilterCanal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<Record<string, { actif: boolean; details?: string }>>({});
  const smtpConfigured = smtpStatus !== null && smtpStatus.ok;

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCanal) params.set('canal', filterCanal);
      const res = await fetch(`/api/bot-messages?${params}`);
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [filterCanal]);

  useEffect(() => {
    fetchMessages();
    // Vérifier SMTP
    fetch('/api/email-mensuel')
      .then(r => r.json())
      .then(setSmtpStatus)
      .catch(() => {});
    // Vérifier statut bots côté serveur
    fetch('/api/bot-status')
      .then(r => r.json())
      .then(setBotStatus)
      .catch(() => {});
  }, [fetchMessages]);

  async function handleTestEmail() {
    if (!testEmail) return;
    setSendingTest(true);
    try {
      const res = await fetch(`/api/email-mensuel?action=test&email=${encodeURIComponent(testEmail)}`);
      const data = await res.json();
      if (data.message) {
        alert('Email de test envoyé avec succès !');
      } else {
        alert(`Échec : ${data.erreur}`);
      }
    } catch {
      alert('Erreur réseau');
    } finally {
      setSendingTest(false);
    }
  }

  async function handleSendRapport() {
    setSendingRapport(true);
    try {
      const res = await fetch('/api/email-mensuel', { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.erreur || 'Terminé');
      if (res.ok) fetchMessages();
    } catch {
      alert('Erreur réseau');
    } finally {
      setSendingRapport(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/bot-messages?id=${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchMessages();
  }

  const canalColors: Record<string, string> = {
    WHATSAPP: 'bg-green-100 text-green-700 border-green-200',
    TELEGRAM: 'bg-blue-100 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    MESSENGER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };

  const bots: BotStatus[] = [
    { nom: 'WhatsApp Bot', canal: 'WHATSAPP', actif: botStatus?.whatsapp?.actif || false, messagesTotal: messages.filter(m => m.canal === 'WHATSAPP').length, icon: MessageSquare, couleur: 'text-green-600 bg-green-50' },
    { nom: 'Telegram Bot', canal: 'TELEGRAM', actif: botStatus?.telegram?.actif || false, messagesTotal: messages.filter(m => m.canal === 'TELEGRAM').length, icon: Send, couleur: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
    { nom: 'Messenger Bot', canal: 'MESSENGER', actif: botStatus?.messenger?.actif || false, messagesTotal: messages.filter(m => m.canal === 'MESSENGER').length, icon: Bot, couleur: 'text-indigo-600 bg-indigo-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Statut des bots */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-600" />
          Bots de communication
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bots.map(bot => {
            const Icon = bot.icon;
            return (
              <Card key={bot.canal}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${bot.couleur}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{bot.nom}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {bot.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground" title={botStatus?.[bot.canal.toLowerCase()]?.details}>
                            <XCircle className="h-3 w-3 mr-1" /> {botStatus?.[bot.canal.toLowerCase()]?.details || 'Non configuré'}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{bot.messagesTotal} msg</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Configuration Email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-600" />
            Email mensuel aux sociétés client
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Statut SMTP */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${smtpStatus !== null && !smtpStatus.ok ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800' : 'bg-muted/30'}`}>
            {smtpStatus === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : smtpStatus.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600" />
            )}
            <span className="text-sm">
              {smtpStatus === null ? 'Vérification SMTP...' :
                smtpStatus.ok ? 'Connexion SMTP établie' : 'Service email non configuré'}
            </span>
          </div>

          {smtpStatus !== null && !smtpStatus.ok && (
            <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="font-medium mb-1">Configuration requise</p>
              <p className="text-amber-600">Ajoutez les variables suivantes dans votre fichier <code className="bg-amber-100 px-1 rounded text-xs">.env</code> :</p>
              <code className="block mt-2 text-xs bg-amber-100/60 px-3 py-2 rounded font-mono">
                SMTP_HOST=smtp.votre-serveur.com<br />
                SMTP_PORT=587<br />
                SMTP_USER=votre@email.com<br />
                SMTP_PASS=votre-mot-de-passe<br />
                SMTP_FROM=noreply@votre-domaine.com<br />
                EMAIL_RAPPORT_DESTINATAIRE=rapport@votre-domaine.com
              </code>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Test email */}
            <div className="space-y-2">
              <Label>Envoyer un email de test</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="destinataire@email.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  disabled={!smtpConfigured}
                />
                <Button
                  variant="outline"
                  onClick={handleTestEmail}
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
                  onClick={handleSendRapport}
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
        </CardContent>
      </Card>

      <Separator />

      {/* Historique des messages bots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-emerald-600" />
            Historique des conversations bots
          </h3>
          <div className="flex gap-2">
            {['', 'WHATSAPP', 'TELEGRAM', 'MESSENGER'].map(c => (
              <Button
                key={c}
                variant={filterCanal === c ? 'default' : 'outline'}
                size="sm"
                className={`text-[11px] h-7 ${filterCanal === c ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={() => setFilterCanal(c)}
              >
                {c || 'Tous'}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={fetchMessages}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucun message bot reçu</p>
                <p className="text-xs mt-1">Les messages des assurés et prestataires apparaîtront ici</p>
              </div>
            ) : (
              <div className="divide-y">
                {messages.map(msg => (
                  <div key={msg.id} className="p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{msg.expeditieurNom}</span>
                          <Badge variant="outline" className={`text-[10px] ${canalColors[msg.canal] || ''}`}>
                            {msg.canal}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-2.5 mb-2 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-0.5">Question</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{msg.message}</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-2.5 border border-blue-100">
                          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">Réponse Suivi Santé</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{msg.reponse}</p>
                        </div>
                      </div>
                      {deleteConfirm === msg.id ? (
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleDelete(msg.id)}>Oui</Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1" onClick={() => setDeleteConfirm(null)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0" onClick={() => setDeleteConfirm(msg.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}