'use client';

/**
 * Carte « Service de messagerie » de la page Configuration — plan §18, §19, §28.
 * ────────────────────────────────────────────────────────────────────────────
 *  - Monitoring : envoyés (24 h), échecs, file d'attente, derniers envois
 *  - Statut SPF / DKIM / DMARC du domaine d'expédition (§18-20)
 *  - E-mail de test envoyé via le service centralisé (§19)
 *  - Traitement manuel de la file (worker)
 *
 * Interroge : GET /api/mail (stats + derniers envois), GET /api/mail/dns-check,
 * POST /api/mail/send (template « test »), POST /api/mail/process.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Loader2, CheckCircle2, XCircle, RefreshCw, Send, ShieldCheck,
  Activity, ListChecks, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Types (miroir des réponses /api/mail/*) ───────────────────────────────

interface DetailDns {
  statut: 'PASS' | 'ABSENT' | 'ERREUR';
  enregistrement?: string;
  erreur?: string;
  avertissements?: string[];
}

interface VerificationDns {
  domaine: string;
  selecteurDkim: string;
  spf: DetailDns;
  dkim: DetailDns;
  dmarc: DetailDns;
  verifieLe: string;
  notes: string[];
  fromEmail?: string;
  erreur?: string;
}

interface StatsFile {
  enAttente: number;
  enCours: number;
  envoyes24h: number;
  echecs24h: number;
  parStatut: { statut: string; total: number }[];
}

interface EnvoiRecent {
  id: string;
  destinatairePrincipal: string;
  sujet: string;
  statut: string;
  tentatives: number;
  maxTentatives: number;
  categorie: string | null;
  derniereErreur: string | null;
  createdAt: string;
  envoyeLe: string | null;
  prochaineTentative: string | null;
}

const BADGES_STATUT: Record<string, string> = {
  EN_ATTENTE: 'bg-gray-100 text-gray-700 border-gray-200',
  EN_COURS: 'bg-blue-100 text-blue-700 border-blue-200',
  ENVOYE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ECHEC: 'bg-red-100 text-red-700 border-red-200',
};

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Composant ─────────────────────────────────────────────────────────────

export default function MailServiceCard() {
  const [stats, setStats] = useState<StatsFile | null>(null);
  const [envois, setEnvois] = useState<EnvoiRecent[]>([]);
  const [dns, setDns] = useState<VerificationDns | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [envoiTest, setEnvoiTest] = useState(false);
  const [resultatTest, setResultatTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [traitement, setTraitement] = useState(false);
  const [resultatTraitement, setResultatTraitement] = useState<string | null>(null);

  const chargerStats = useCallback(async () => {
    try {
      const res = await fetch('/api/mail');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats ?? null);
        setEnvois(Array.isArray(data.envois) ? data.envois : []);
      }
    } catch { /* silencieux */ }
  }, []);

  const chargerDns = useCallback(async () => {
    setDns(null);
    try {
      const res = await fetch('/api/mail/dns-check');
      setDns(await res.json());
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    chargerStats();
    chargerDns();
  }, [chargerStats, chargerDns]);

  async function handleTestEmail() {
    const adresse = testEmail.trim();
    if (!adresse) return;
    setEnvoiTest(true);
    setResultatTest(null);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinataires: [adresse],
          template: 'test',
          donnees: {},
          categorie: 'TEST',
          traiter: true,
        }),
      });
      const data = await res.json();
      if (res.status === 202 && data.ok) {
        setResultatTest({
          ok: true,
          message: `${data.message} (id : ${data.id}). Dans Gmail : « Afficher l'original » → vérifiez SPF: PASS, DKIM: PASS, DMARC: PASS.`,
        });
        setTestEmail('');
        setTimeout(chargerStats, 3000);
      } else {
        setResultatTest({ ok: false, message: data.erreur || `Erreur ${res.status}` });
      }
    } catch {
      setResultatTest({ ok: false, message: 'Erreur réseau lors de la demande.' });
    } finally {
      setEnvoiTest(false);
    }
  }

  async function handleTraiterFile() {
    setTraitement(true);
    setResultatTraitement(null);
    try {
      const res = await fetch('/api/mail/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResultatTraitement(
          `Terminé — orphelins récupérés : ${data.orphelinsRecuperes}, envoyés : ${data.envoyes}, ` +
          `retries planifiés : ${data.retriesProgrammes}, échecs définitifs : ${data.echecsDefinitifs}` +
          (Array.isArray(data.erreurs) && data.erreurs.length > 0 ? `, erreurs : ${data.erreurs.length}` : '')
        );
        chargerStats();
      } else {
        setResultatTraitement(data.erreur || `Erreur ${res.status}`);
      }
    } catch {
      setResultatTraitement('Erreur réseau.');
    } finally {
      setTraitement(false);
    }
  }

  const taux =
    stats && stats.envoyes24h + stats.echecs24h > 0
      ? Math.round((stats.envoyes24h / (stats.envoyes24h + stats.echecs24h)) * 1000) / 10
      : null;

  const kpis = stats
    ? [
        { label: 'Envoyés (24 h)', value: stats.envoyes24h, tone: 'text-emerald-600' },
        { label: 'Échecs (24 h)', value: stats.echecs24h, tone: 'text-red-600' },
        { label: 'En attente', value: stats.enAttente, tone: 'text-blue-600' },
        { label: 'En cours', value: stats.enCours, tone: 'text-foreground' },
        { label: 'Taux de succès', value: taux === null ? '—' : `${taux}%`, tone: 'text-foreground' },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-600" />
            Service de messagerie centralisé
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={chargerStats}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Monitoring (plan §28) ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.tone}`}>{stats === null ? '…' : kpi.value}</p>
            </div>
          ))}
        </div>

        {/* ── Statut SPF / DKIM / DMARC (plan §18-20) ── */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Authentification du domaine d&apos;expédition
            </h4>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={chargerDns}>
              <RefreshCw className={`h-3 w-3 mr-1 ${dns === null ? 'animate-spin' : ''}`} /> Revérifier
            </Button>
          </div>

          {dns === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vérification DNS en cours...
            </div>
          ) : dns.erreur ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{dns.erreur}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Domaine : <span className="font-medium text-foreground">{dns.domaine}</span>
                {dns.fromEmail ? <> — expéditeur : <span className="font-medium text-foreground">{dns.fromEmail}</span></> : null}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {([['SPF', dns.spf], ['DKIM', dns.dkim], ['DMARC', dns.dmarc]] as const).map(([nom, detail]) => (
                  <div key={nom} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{nom}</span>
                      {detail.statut === 'PASS' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] hover:bg-emerald-100">PASS</Badge>
                      ) : detail.statut === 'ABSENT' ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">ABSENT</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">ERREUR</Badge>
                      )}
                    </div>
                    {detail.enregistrement && (
                      <p className="text-[10px] text-muted-foreground font-mono break-all line-clamp-2">{detail.enregistrement}</p>
                    )}
                    {detail.erreur && <p className="text-[10px] text-amber-700 dark:text-amber-300">{detail.erreur}</p>}
                    {detail.avertissements?.map(a => (
                      <p key={a} className="text-[10px] text-muted-foreground">⚠ {a}</p>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sélecteur DKIM : <span className="font-mono">{dns.selecteurDkim}</span> — modifiable via MAIL_DKIM_SELECTOR.
                Publiez les enregistrements fournis par votre relais (Brevo / SMTP2GO) dans le DNS du domaine,
                idéalement sur un sous-domaine dédié (ex. mail.{dns.domaine}). Voir docs/MESSAGERIE.md.
              </p>
              {dns.notes.map(n => (
                <p key={n} className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" /> {n}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* ── E-mail de test (plan §19) ── */}
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-emerald-600" />
            E-mail de test
          </h4>
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Destinataire</Label>
              <Input
                type="email"
                placeholder="votre-adresse@gmail.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTestEmail(); }}
                className="h-9 text-sm"
              />
            </div>
            <Button
              className="h-9 md:mt-6 bg-emerald-600 hover:bg-emerald-700"
              disabled={envoiTest || !testEmail.trim()}
              onClick={handleTestEmail}
            >
              {envoiTest ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Envoyer un e-mail de test
            </Button>
          </div>
          {resultatTest && (
            <div className={`text-xs rounded-lg p-2.5 border ${resultatTest.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'}`}>
              {resultatTest.message}
            </div>
          )}
        </div>

        {/* ── File d'attente : traitement manuel ── */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
              File d&apos;attente — {stats ? `${stats.enAttente} en attente, ${stats.enCours} en cours` : '…'}
            </h4>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={traitement} onClick={handleTraiterFile}>
              {traitement ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Activity className="h-3 w-3 mr-1" />}
              Traiter la file maintenant
            </Button>
          </div>
          {resultatTraitement && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">{resultatTraitement}</p>
          )}
        </div>

        {/* ── Derniers envois ── */}
        {envois.length > 0 && (
          <div className="border rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Derniers envois</h4>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {envois.map(envoi => (
                <div key={envoi.id} className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${BADGES_STATUT[envoi.statut] || ''}`}>
                    {envoi.statut}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">{fmtDate(envoi.createdAt)}</span>
                  <span className="truncate text-foreground" title={envoi.derniereErreur || undefined}>
                    <span className="font-medium">{envoi.sujet}</span>
                    {' → '}
                    {envoi.destinatairePrincipal}
                    {envoi.derniereErreur ? ` — ${envoi.derniereErreur}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
