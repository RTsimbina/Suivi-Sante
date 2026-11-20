'use client';

/**
 * Hook de la vue Configuration (refactoring P2 — extrait du monolithe
 * configuration-view.tsx) : historique des messages bots (filtre par canal,
 * suppression), statut serveur des bots, configuration SMTP (chargement DB
 * avec repli .env, sauvegarde, test de connexion, suppression), email de
 * test et envoi manuel du rapport mensuel.
 */
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Bot } from 'lucide-react';
import type { BotStatus, MessageBot, SmtpConfigDB, SmtpConfigForm } from './types';

export function useBotsConfig() {
  const [messages, setMessages] = useState<MessageBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingRapport, setSendingRapport] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [smtpStatus, setSmtpStatus] = useState<{ ok: boolean; erreur?: string } | null>(null);
  const [filterCanal, setFilterCanal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<Record<string, { actif: boolean; details?: string }>>({});

  // Formulaire SMTP
  const [smtpForm, setSmtpForm] = useState<SmtpConfigForm>({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '',
    smtpFrom: '', emailRapportDestinataire: '',
  });
  const [dbConfig, setDbConfig] = useState<SmtpConfigDB | null>(null);
  const [envFallback, setEnvFallback] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testConnResult, setTestConnResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [configSource, setConfigSource] = useState<'db' | 'env' | 'aucune'>('aucune');

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

  // Charger la config SMTP et vérifier le statut
  const fetchEmailConfig = useCallback(async () => {
    try {
      // Charger la config depuis la DB
      const configRes = await fetch('/api/email-config');
      if (configRes.ok) {
        const data = await configRes.json();
        if (data.config) {
          setDbConfig(data.config);
          setSmtpForm({
            smtpHost: data.config.smtpHost,
            smtpPort: String(data.config.smtpPort),
            smtpUser: data.config.smtpUser,
            smtpPass: '', // On ne renvoie jamais le mot de passe
            smtpFrom: data.config.smtpFrom,
            emailRapportDestinataire: data.config.emailRapportDestinataire || '',
          });
          setConfigSource('db');
        } else if (data.envFallback) {
          setConfigSource('env');
        } else {
          setConfigSource('aucune');
        }
        setEnvFallback(data.envFallback);
      }

      // Vérifier SMTP
      const smtpRes = await fetch('/api/email-mensuel');
      if (smtpRes.ok) {
        const smtpData = await smtpRes.json();
        setSmtpStatus(smtpData);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchEmailConfig();
    // Vérifier statut bots côté serveur
    fetch('/api/bot-status')
      .then(r => r.json())
      .then(setBotStatus)
      .catch(() => {});
  }, [fetchMessages, fetchEmailConfig]);

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

  async function handleSaveConfig() {
    setSavingConfig(true);
    setTestConnResult(null);
    try {
      const res = await fetch('/api/email-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpForm.smtpHost,
          smtpPort: Number(smtpForm.smtpPort) || 587,
          smtpUser: smtpForm.smtpUser,
          smtpPass: smtpForm.smtpPass,
          smtpFrom: smtpForm.smtpFrom,
          emailRapportDestinataire: smtpForm.emailRapportDestinataire || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Configuration SMTP sauvegardée avec succès !');
        await fetchEmailConfig();
        // Re-vérifier SMTP
        const smtpRes = await fetch('/api/email-mensuel');
        if (smtpRes.ok) setSmtpStatus(await smtpRes.json());
      } else {
        alert(`Erreur : ${data.erreur}`);
      }
    } catch {
      alert('Erreur réseau lors de la sauvegarde');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestConnResult(null);
    try {
      const res = await fetch('/api/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpForm.smtpHost,
          smtpPort: Number(smtpForm.smtpPort) || 587,
          smtpUser: smtpForm.smtpUser,
          smtpPass: smtpForm.smtpPass,
          smtpFrom: smtpForm.smtpFrom,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestConnResult({ ok: true, message: data.message || 'Connexion réussie !' });
      } else {
        setTestConnResult({ ok: false, message: data.erreur || 'Échec de la connexion' });
      }
    } catch {
      setTestConnResult({ ok: false, message: 'Erreur réseau' });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleDeleteConfig() {
    if (!confirm('Supprimer la configuration SMTP ? Le système utilisera les variables d\'environnement si disponibles.')) return;
    try {
      const res = await fetch('/api/email-config', { method: 'DELETE' });
      if (res.ok) {
        setSmtpForm({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', smtpFrom: '', emailRapportDestinataire: '' });
        setDbConfig(null);
        setConfigSource(envFallback ? 'env' : 'aucune');
        await fetchEmailConfig();
      }
    } catch { /* silent */ }
  }

  const bots: BotStatus[] = [
    { nom: 'WhatsApp Bot', canal: 'WHATSAPP', actif: botStatus?.whatsapp?.actif || false, messagesTotal: messages.filter(m => m.canal === 'WHATSAPP').length, icon: MessageSquare, couleur: 'text-green-600 bg-green-50' },
    { nom: 'Telegram Bot', canal: 'TELEGRAM', actif: botStatus?.telegram?.actif || false, messagesTotal: messages.filter(m => m.canal === 'TELEGRAM').length, icon: Send, couleur: 'text-info-600 bg-info-50 dark:bg-info-950/40' },
    { nom: 'Messenger Bot', canal: 'MESSENGER', actif: botStatus?.messenger?.actif || false, messagesTotal: messages.filter(m => m.canal === 'MESSENGER').length, icon: Bot, couleur: 'text-violet-600 bg-violet-50' },
  ];

  return {
    // messages bots
    messages, loading, filterCanal, setFilterCanal,
    deleteConfirm, setDeleteConfirm, handleDelete, fetchMessages,
    // statut bots
    botStatus, bots,
    // SMTP
    smtpForm, setSmtpForm, dbConfig, configSource, smtpStatus,
    showPassword, setShowPassword,
    savingConfig, testingConnection, testConnResult,
    handleSaveConfig, handleTestConnection, handleDeleteConfig,
    // actions email
    testEmail, setTestEmail, sendingTest, sendingRapport, smtpConfigured,
    handleTestEmail, handleSendRapport,
  };
}
