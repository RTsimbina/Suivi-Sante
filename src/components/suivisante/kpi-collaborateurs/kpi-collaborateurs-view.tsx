'use client';

/**
 * kpi-collaborateurs-view.tsx — Rubrique « KPI – Performance des collaborateurs »
 * (partie Administration, rôle ADMINISTRATEUR).
 * Onglets locaux (navigation-locale) : Tableau de bord, Par service, Individuel,
 * Historique, Objectifs, Alertes. Exports Excel/PDF — même moteur que les
 * écrans (cohérence). Aucune couleur codée en dur hors conventions statuts.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  FileText, CheckCircle2, Clock, TrendingUp, Percent, AlertTriangle,
  Users, Target, History, LayoutDashboard, Building2, Download, Timer,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { useOngletLocal } from './navigation-locale';
import { serviceGestionnaireLabel } from '@/lib/referentiels';
import {
  useKpiCollaborateursData, telechargerExportKpi, SERVICES_KPI_UI,
  type KpiCollaborateurUI,
} from './use-kpi-collaborateurs-data';

const ONGLETS = ['tableau-bord', 'services', 'individuel', 'historique', 'objectifs', 'alertes'] as const;

const serviceColors: Record<string, string> = {
  ACCUEIL: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  CONTROLE_MEDICAL: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  COMPTABILITE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
};
const monthLabels: Record<string, string> = {
  '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr', '05': 'Mai', '06': 'Juin',
  '07': 'Juil', '08': 'Août', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
};
const labelMois = (v: string) => monthLabels[v.split('-')[1]] ?? v;

const fmtMin = (v: number | null) => (v === null ? '—' : v.toLocaleString('fr-FR'));
const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);

export default function KpiCollaborateursView() {
  const [onglet, setOnglet] = useOngletLocal(ONGLETS, 'tableau-bord');
  const [service, setService] = useState('');
  const { bundle, objectifs, loading, erreur, recharger, rechargerObjectifs } = useKpiCollaborateursData(service);
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [collabSelectionne, setCollabSelectionne] = useState<KpiCollaborateurUI | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  const faireExport = async (format: 'xlsx' | 'pdf') => {
    setExportEnCours(true);
    try { await telechargerExportKpi(format, service); } finally { setExportEnCours(false); }
  };

  if (loading || (!bundle && !erreur)) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (erreur || !bundle) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">
        {erreur ?? 'Données indisponibles'}
        <div className="mt-3"><Button variant="outline" onClick={recharger}>Réessayer</Button></div>
      </CardContent></Card>
    );
  }

  const p = bundle.performance;
  const cards = [
    { key: 'traites', label: 'Dossiers traités', val: p.totalTraites, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { key: 'affectes', label: 'Dossiers affectés', val: p.totalAffectes, icon: FileText, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40' },
    { key: 'enCours', label: 'En cours', val: p.enCours, icon: Timer, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { key: 'enRetard', label: 'En retard', val: p.enRetard, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
    { key: 'delaiMoyen', label: 'Délai moyen (min)', val: p.delaiMoyenTraitementMin, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', decimal: true },
    { key: 'delaiMedian', label: 'Délai médian (min)', val: p.delaiMedianTraitementMin, icon: Clock, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40', decimal: true },
    { key: 'respect', label: 'Respect des délais', val: p.tauxRespectDelais, icon: Percent, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', decimal: true, suffix: ' %' },
    { key: 'retours', label: 'Retours pour correction', val: p.tauxRetourCorrection, icon: TrendingUp, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', decimal: true, suffix: ' %' },
  ];

  return (
    <div className="space-y-6">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-2">
        {ONGLETS.map((o) => (
          <Button key={o} variant={onglet === o ? 'default' : 'outline'} size="sm" onClick={() => setOnglet(o)}>
            {o === 'tableau-bord' && <LayoutDashboard className="h-4 w-4 mr-1" />}
            {o === 'services' && <Building2 className="h-4 w-4 mr-1" />}
            {o === 'individuel' && <Users className="h-4 w-4 mr-1" />}
            {o === 'historique' && <History className="h-4 w-4 mr-1" />}
            {o === 'objectifs' && <Target className="h-4 w-4 mr-1" />}
            {o === 'alertes' && <AlertTriangle className="h-4 w-4 mr-1" />}
            {{ 'tableau-bord': 'Tableau de bord', services: 'Par service', individuel: 'Individuel', historique: 'Historique', objectifs: 'Objectifs', alertes: 'Alertes' }[o]}
          </Button>
        ))}
        <div className="grow" />
        <select
          className="border rounded-md bg-background px-2 py-1.5 text-sm"
          value={service}
          onChange={(e) => { setService(e.target.value); setCollabSelectionne(null); }}
        >
          <option value="">Tous les services</option>
          {SERVICES_KPI_UI.map((s) => <option key={s} value={s}>{serviceGestionnaireLabel(s === 'CONTROLE_MEDICAL' ? 'SANTE' : s) || s}</option>)}
        </select>
        <Button variant="outline" size="sm" disabled={exportEnCours} onClick={() => faireExport('xlsx')}>
          <Download className="h-4 w-4 mr-1" />Excel
        </Button>
        <Button variant="outline" size="sm" disabled={exportEnCours} onClick={() => faireExport('pdf')}>
          <Download className="h-4 w-4 mr-1" />PDF
        </Button>
      </div>

      {onglet === 'tableau-bord' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.key}>
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${c.bg}`}><Icon className={`h-4 w-4 ${c.color}`} /></div>
                      <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">
                      {c.decimal && typeof c.val === 'number' ? c.val.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : typeof c.val === 'number' ? c.val.toLocaleString('fr-FR') : '—'}
                      {c.suffix ?? ''}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Évolution mensuelle des dossiers traités</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={p.evolutionMensuelle}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                    <XAxis dataKey="mois" tickFormatter={labelMois} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip labelFormatter={labelMois} />
                    <Bar dataKey="traites" fill="#10b981" radius={[4, 4, 0, 0]} name="Traités" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Taux de respect des délais (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={p.evolutionMensuelle}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                    <XAxis dataKey="mois" tickFormatter={labelMois} fontSize={11} />
                    <YAxis fontSize={11} domain={[0, 100]} />
                    <Tooltip labelFormatter={labelMois} />
                    <Legend />
                    <Line type="monotone" dataKey="tauxRespect" stroke="#10b981" name="Respect" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {onglet === 'services' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Performance par service</CardTitle></CardHeader>
          <CardContent>
            <div className="min-w-[700px]">
              <table className="w-full text-sm">
                <thead className="bg-background">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Service</th>
                    <th className="pb-2 font-medium text-right">Affectés</th>
                    <th className="pb-2 font-medium text-right">Traités</th>
                    <th className="pb-2 font-medium text-right">En cours</th>
                    <th className="pb-2 font-medium text-right">En retard</th>
                    <th className="pb-2 font-medium text-right">Moyen (min)</th>
                    <th className="pb-2 font-medium text-right">Médian (min)</th>
                    <th className="pb-2 font-medium text-right">Respect</th>
                    <th className="pb-2 font-medium text-right">Retours</th>
                  </tr>
                </thead>
                <tbody>
                  {p.parService.map((s) => (
                    <tr key={s.service} className="border-b last:border-0">
                      <td className="py-2"><Badge variant="outline" className={serviceColors[s.service] ?? ''}>{s.service}</Badge></td>
                      <td className="py-2 text-right">{s.attribues}</td>
                      <td className="py-2 text-right">{s.traites}</td>
                      <td className="py-2 text-right">{s.enCours}</td>
                      <td className="py-2 text-right text-red-600 dark:text-red-400">{s.enRetard}</td>
                      <td className="py-2 text-right">{fmtMin(s.tempsMoyenTraitementMin)}</td>
                      <td className="py-2 text-right">{fmtMin(s.delaiMedianTraitementMin)}</td>
                      <td className="py-2 text-right">{fmtPct(s.tauxRespectDelais)}</td>
                      <td className="py-2 text-right">{fmtPct(s.tauxRetourCorrection)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {onglet === 'individuel' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Performance individuelle</CardTitle></CardHeader>
            <CardContent>
              <div className="min-w-[760px]">
                <table className="w-full text-sm">
                  <thead className="bg-background">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Collaborateur</th>
                      <th className="pb-2 font-medium">Service(s)</th>
                      <th className="pb-2 font-medium text-right">Affectés</th>
                      <th className="pb-2 font-medium text-right">Traités</th>
                      <th className="pb-2 font-medium text-right">En cours</th>
                      <th className="pb-2 font-medium text-right">En retard</th>
                      <th className="pb-2 font-medium text-right">Respect</th>
                      <th className="pb-2 font-medium text-right">Retours</th>
                      <th className="pb-2 font-medium text-right">Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.parCollaborateur.length === 0 && (
                      <tr><td colSpan={9} className="py-4 text-center text-muted-foreground">Aucune activité sur la période.</td></tr>
                    )}
                    {p.parCollaborateur.map((c) => (
                      <tr key={c.userId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.nom ?? c.userId}</td>
                        <td className="py-2">{c.service ?? '—'}</td>
                        <td className="py-2 text-right">{c.attribues}</td>
                        <td className="py-2 text-right">{c.traites}</td>
                        <td className="py-2 text-right">{c.enCours}</td>
                        <td className="py-2 text-right text-red-600 dark:text-red-400">{c.enRetard}</td>
                        <td className="py-2 text-right">{fmtPct(c.tauxRespectDelais)}</td>
                        <td className="py-2 text-right">{fmtPct(c.tauxRetourCorrection)}</td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setCollabSelectionne(c)}>Voir</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {collabSelectionne && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Détail — {collabSelectionne.nom ?? collabSelectionne.userId}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div>Prise en charge moyenne : <span className="font-medium">{fmtMin(collabSelectionne.delaiMoyenPriseEnChargeMin)} min</span></div>
                  <div>Traitement moyen : <span className="font-medium">{fmtMin(collabSelectionne.tempsMoyenTraitementMin)} min</span></div>
                  <div>Traitement médian : <span className="font-medium">{fmtMin(collabSelectionne.delaiMedianTraitementMin)} min</span></div>
                  <div>Respect des délais : <span className="font-medium">{fmtPct(collabSelectionne.tauxRespectDelais)}</span></div>
                  <div>Retours correction : <span className="font-medium">{fmtPct(collabSelectionne.tauxRetourCorrection)}</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Évolution mensuelle</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={collabSelectionne.evolutionMensuelle}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                      <XAxis dataKey="mois" tickFormatter={labelMois} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip labelFormatter={labelMois} />
                      <Legend />
                      <Line type="monotone" dataKey="traites" stroke="#0ea5e9" name="Traités" dot={false} />
                      <Line type="monotone" dataKey="tauxRespect" stroke="#10b981" name="Respect %" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {onglet === 'historique' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Historique mensuel (global)</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Mois</th><th className="pb-2 text-right font-medium">Traités</th><th className="pb-2 text-right font-medium">Respect</th>
                </tr></thead>
                <tbody>
                  {p.evolutionMensuelle.map((m) => (
                    <tr key={m.mois} className="border-b last:border-0">
                      <td className="py-2">{m.mois}</td>
                      <td className="py-2 text-right">{m.traites}</td>
                      <td className="py-2 text-right">{fmtPct(m.tauxRespect)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Évolution annuelle</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={p.evolutionAnnuelle}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                  <XAxis dataKey="annee" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="traites" fill="#529286" radius={[4, 4, 0, 0]} name="Traités" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {onglet === 'objectifs' && objectifs && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Délais cibles en vigueur (minutes)</CardTitle>
              <Button size="sm" onClick={() => setDialogOuvert(true)}><Target className="h-4 w-4 mr-1" />Modifier un objectif</Button>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Type de dossier</th>
                  <th className="pb-2 text-right font-medium">Délai cible (min)</th>
                  <th className="pb-2 font-medium">En vigueur depuis</th>
                </tr></thead>
                <tbody>
                  {objectifs.enVigueur.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2"><Badge variant="outline" className={serviceColors[o.service] ?? ''}>{o.service}</Badge></td>
                      <td className="py-2">{o.typeDossier ?? 'Tous'}</td>
                      <td className="py-2 text-right font-medium">{o.delaiMinutes}</td>
                      <td className="py-2">{new Date(o.valideDu).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Historique des modifications (valeurs conservées)</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Service</th><th className="pb-2 font-medium">Valeur (min)</th>
                  <th className="pb-2 font-medium">Du</th><th className="pb-2 font-medium">Au</th><th className="pb-2 font-medium">Motif</th>
                </tr></thead>
                <tbody>
                  {objectifs.historique.length === 0 && (
                    <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">Aucune modification enregistrée.</td></tr>
                  )}
                  {objectifs.historique.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2">{o.service}{o.typeDossier ? ` / ${o.typeDossier}` : ''}</td>
                      <td className="py-2">{o.delaiMinutes}</td>
                      <td className="py-2">{new Date(o.valideDu).toLocaleDateString('fr-FR')}</td>
                      <td className="py-2">{o.valideAu ? new Date(o.valideAu).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="py-2 text-muted-foreground">{o.motif ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <DialogObjectifs
            ouvert={dialogOuvert}
            onFerme={() => setDialogOuvert(false)}
            onSucces={() => { setDialogOuvert(false); rechargerObjectifs(); recharger(); }}
          />
        </div>
      )}

      {onglet === 'alertes' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">Dossiers ayant dépassé le délai cible ({bundle.alertes.dossiersDepasses.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-60 overflow-y-auto">
              {bundle.alertes.dossiersDepasses.length === 0 && <p className="text-sm text-muted-foreground">Aucun dossier dépassé.</p>}
              {bundle.alertes.dossiersDepasses.map((a) => (
                <div key={a.dossierId} className="flex items-center justify-between text-sm border-b pb-1">
                  <span className="font-medium">{a.numeroDossier}</span>
                  <Badge variant="outline" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">{a.service} — {a.pourcentageObjectif} %</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">Dossiers proches du délai cible ({bundle.alertes.dossiersProches.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-60 overflow-y-auto">
              {bundle.alertes.dossiersProches.length === 0 && <p className="text-sm text-muted-foreground">Aucun dossier proche.</p>}
              {bundle.alertes.dossiersProches.map((a) => (
                <div key={a.dossierId} className="flex items-center justify-between text-sm border-b pb-1">
                  <span className="font-medium">{a.numeroDossier}</span>
                  <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">{a.service} — {a.pourcentageObjectif} %</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Accumulations / dégradations</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {bundle.alertes.accumulations.length === 0 && bundle.alertes.degradations.length === 0 && (
                <p className="text-muted-foreground">Aucune alerte structurelle.</p>
              )}
              {bundle.alertes.accumulations.map((a) => (
                <div key={`acc-${a.service}`} className="flex justify-between"><span>Accumulation — {a.service}</span><Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">{a.nbOuverts} ouverts (seuil {a.seuil})</Badge></div>
              ))}
              {bundle.alertes.degradations.map((d) => (
                <div key={`deg-${d.service}`} className="flex justify-between"><span>Dégradation — {d.service}</span><Badge variant="outline" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">{d.tauxPrecedent} % → {d.tauxActuel} %</Badge></div>
              ))}
              {bundle.alertes.hausseRetours.map((h) => (
                <div key={`ret-${h.service}`} className="flex justify-between"><span>Hausse des retours — {h.service}</span><Badge variant="outline" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">{h.taux} % (seuil {h.seuil} %)</Badge></div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Boîte de dialogue de modification d'objectif ────────────────────────────

function DialogObjectifs({ ouvert, onFerme, onSucces }: { ouvert: boolean; onFerme: () => void; onSucces: () => void }) {
  const [service, setService] = useState<string>('ACCUEIL');
  const [typeDossier, setTypeDossier] = useState('');
  const [delai, setDelai] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const soumettre = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch('/api/kpi/objectifs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          typeDossier: typeDossier.trim() || null,
          delaiMinutes: Number(delai),
          motif: motif.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.erreur ?? `Erreur ${res.status}`);
      }
      onSucces();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? null : onFerme())}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier un délai cible (versionné)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="kpi-obj-service">Service</Label>
              <select id="kpi-obj-service" className="border rounded-md bg-background px-2 py-1.5 text-sm w-full"
                value={service} onChange={(e) => setService(e.target.value)}>
                {SERVICES_KPI_UI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="kpi-obj-delai">Délai cible (minutes)</Label>
              <Input id="kpi-obj-delai" type="number" min={1} value={delai} onChange={(e) => setDelai(e.target.value)} placeholder="240" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-obj-type">Type de dossier (optionnel — vide = tous)</Label>
            <Input id="kpi-obj-type" value={typeDossier} onChange={(e) => setTypeDossier(e.target.value)} placeholder="CONSULTATION" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kpi-obj-motif">Motif de la modification (obligatoire, tracé)</Label>
            <Textarea id="kpi-obj-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Décision interne n°…, ajustement du délai Technique…" />
          </div>
          {erreur && <p className="text-sm text-red-600 dark:text-red-400">{erreur}</p>}
          <p className="text-xs text-muted-foreground">La valeur précédente reste conservée (historique des objectifs) et le changement est journalisé.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFerme}>Annuler</Button>
          <Button onClick={soumettre} disabled={envoi || !delai || motif.trim().length < 10}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
