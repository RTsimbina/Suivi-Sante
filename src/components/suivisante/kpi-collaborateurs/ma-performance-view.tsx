'use client';

/**
 * ma-performance-view.tsx — Rubrique « Ma performance » de l'espace
 * collaborateur. Les données proviennent de /api/kpi/ma-performance : le
 * serveur mesure TOUJOURS l'utilisateur authentifié (JWT) — aucun paramètre
 * client ne peut faire apparaître les KPI d'un autre collaborateur.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Clock, Percent, Timer, AlertTriangle, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { usePeriode } from '@/lib/periode-context';

interface MaPerfBundle {
  periode: { debut: string; fin: string };
  utilisateur: { nom: string; role: string };
  kpis: {
    attribues: number;
    traites: number;
    enCours: number;
    enRetard: number;
    delaiMoyenPriseEnChargeMin: number | null;
    tempsMoyenTraitementMin: number | null;
    delaiMedianTraitementMin: number | null;
    tauxRespectDelais: number | null;
    tauxRetourCorrection: number | null;
    evolutionMensuelle: { mois: string; traites: number; tauxRespect: number | null }[];
  } | null;
  attention: { dossierId: string; numeroDossier: string; service: string; pourcentageObjectif: number; enRetard: boolean }[];
}

const monthLabels: Record<string, string> = {
  '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr', '05': 'Mai', '06': 'Juin',
  '07': 'Juil', '08': 'Août', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
};
const labelMois = (v: string) => monthLabels[v.split('-')[1]] ?? v;
const fmtMin = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('fr-FR')} min`);
const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);

export default function MaPerformanceView() {
  const { queryString: qsPeriode } = usePeriode();
  const [bundle, setBundle] = useState<MaPerfBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/kpi/ma-performance${qsPeriode ? `?${qsPeriode}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.erreur ?? `Erreur ${res.status}`);
      }
      setBundle(await res.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [qsPeriode]);

  useEffect(() => { charger(); }, [charger]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-56 w-full" /></CardContent></Card>
      </div>
    );
  }
  if (erreur || !bundle) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">
        {erreur ?? 'Données indisponibles'}
        <div className="mt-3"><Button variant="outline" onClick={charger}><RefreshCw className="h-4 w-4 mr-1" />Réessayer</Button></div>
      </CardContent></Card>
    );
  }

  const k = bundle.kpis;
  const cards = k ? [
    { label: 'Dossiers traités', val: k.traites.toLocaleString('fr-FR'), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'En cours', val: k.enCours.toLocaleString('fr-FR'), icon: Timer, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'En retard', val: k.enRetard.toLocaleString('fr-FR'), icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
    { label: 'Délai moyen', val: fmtMin(k.tempsMoyenTraitementMin), icon: Clock, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40' },
    { label: 'Délai médian', val: fmtMin(k.delaiMedianTraitementMin), icon: Clock, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40' },
    { label: 'Respect des délais', val: fmtPct(k.tauxRespectDelais), icon: Percent, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Retours pour correction', val: fmtPct(k.tauxRetourCorrection), icon: Percent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
    { label: 'Prise en charge moyenne', val: fmtMin(k.delaiMoyenPriseEnChargeMin), icon: Timer, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  ] : [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Vos indicateurs personnels — {bundle.utilisateur.nom} ({bundle.utilisateur.role}). Période :{' '}
        {new Date(bundle.periode.debut).toLocaleDateString('fr-FR')} — {new Date(bundle.periode.fin).toLocaleDateString('fr-FR')}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${c.bg}`}><Icon className={`h-4 w-4 ${c.color}`} /></div>
                  <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                </div>
                <p className="text-xl font-bold tracking-tight">{c.val}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Évolution mensuelle de votre activité</CardTitle></CardHeader>
        <CardContent>
          {k && k.evolutionMensuelle.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={k.evolutionMensuelle}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis dataKey="mois" tickFormatter={labelMois} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip labelFormatter={labelMois} />
                <Legend />
                <Line type="monotone" dataKey="traites" stroke="#0ea5e9" name="Dossiers traités" dot={false} />
                <Line type="monotone" dataKey="tauxRespect" stroke="#10b981" name="Respect des délais (%)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune activité enregistrée sur la période.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Mes dossiers nécessitant une attention particulière</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {bundle.attention.length === 0 && <p className="text-sm text-muted-foreground">Aucun dossier proche ou au-delà de son délai cible.</p>}
          {bundle.attention.map((a) => (
            <div key={a.dossierId} className="flex items-center justify-between text-sm border-b pb-1">
              <span className="font-medium">{a.numeroDossier}</span>
              <Badge variant="outline" className={a.enRetard
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}>
                {a.service} — {a.pourcentageObjectif} % de l'objectif{a.enRetard ? ' (dépassé)' : ''}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
