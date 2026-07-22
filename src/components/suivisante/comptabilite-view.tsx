'use client';

import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet, BadgeCheck, HourglassIcon, Wallet, Upload, XCircle,
  AlertTriangle, CheckCircle2, FileDown, ArrowDownToLine, Database,
  Download, History,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatMontantCourt } from './format';

// ─── Types ───────────────────────────────────────────────────────────────
interface ComptabiliteViewProps {
  kpis: {
    comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
    parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  } | null;
  loading: boolean;
}

interface Anomalie { ligne: number; type: 'erreur' | 'avertissement'; champ: string; message: string; }
interface ImportResult {
  importId: string; source: string; nomFichier: string; nbLignes: number;
  nbSucces: number; nbErreurs: number; nbIgnorees?: number; tauxSucces: number;
  anomalies: Anomalie[]; totalMontantImporte?: number;
}

// ─── Composant zone d'import réutilisable ───────────────────────────────
function ComptaImportZone({ endpoint, label, description, columns, accentFrom, accentTo, icon: Icon, accept = '.xlsx,.xls' }: {
  endpoint: string; label: string; description: string; columns: string;
  accentFrom: string; accentTo: string; icon: React.ElementType; accept?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'import');
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(null); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setError(null); }
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${accentFrom}, ${accentTo})` }} />
      <CardContent className="p-5 space-y-4">
        {/* En-tête */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${accentFrom}15` }}>
            <Icon className="size-5" style={{ color: accentFrom }} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{label}</h4>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Zone de dépôt */}
        <form onSubmit={handleImport} className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all hover:bg-muted/30"
            style={{
              borderColor: file ? accentFrom : undefined,
              backgroundColor: file ? `${accentFrom}08` : undefined,
            }}
            onClick={() => fileRef.current?.click()}
          >
            {file ? (
              <div className="space-y-1.5">
                <FileSpreadsheet className="size-8 mx-auto" style={{ color: accentFrom }} />
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Upload className="size-7 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Glissez votre fichier ici ou cliquez pour parcourir</p>
                <p className="text-xs text-muted-foreground/70">{accept.toUpperCase()}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
          </div>

          {/* Colonnes attendues */}
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Colonnes attendues</p>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">{columns}</p>
          </div>

          {/* Bouton importer */}
          <Button
            type="submit"
            disabled={!file || loading}
            className="w-full text-white transition-all"
            style={{
              background: loading ? undefined : `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Import en cours...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ArrowDownToLine className="size-4" />
                Importer le fichier
              </span>
            )}
          </Button>
        </form>

        {/* Message d'erreur */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Résultat de l'import */}
        {result && (
          <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span className="text-sm font-semibold text-foreground">Résultat de l'import</span>
              <Badge variant="outline" className="text-xs ml-auto">{result.source}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                <p className="text-lg font-bold text-emerald-600">{result.nbSucces}</p>
                <p className="text-[10px] text-muted-foreground">Succès</p>
              </div>
              <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30">
                <p className="text-lg font-bold text-red-600">{result.nbErreurs}</p>
                <p className="text-[10px] text-muted-foreground">Erreurs</p>
              </div>
              <div className="p-2 rounded-md bg-sky-50 dark:bg-sky-950/30">
                <p className="text-lg font-bold text-sky-600">{result.tauxSucces}%</p>
                <p className="text-[10px] text-muted-foreground">Taux</p>
              </div>
            </div>
            {result.nbIgnorees !== undefined && result.nbIgnorees > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                {result.nbIgnorees} ligne(s) ignorée(s) (dossier introuvable ou aucune donnée à mettre à jour)
              </p>
            )}
            {result.totalMontantImporte !== undefined && result.totalMontantImporte > 0 && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <Wallet className="size-3" />
                Total montant importé : {formatMontantCourt(result.totalMontantImporte)}
              </p>
            )}
            {result.anomalies.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Détail des anomalies</p>
                {result.anomalies.slice(0, 8).map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    {a.type === 'erreur'
                      ? <XCircle className="size-3 text-red-500 shrink-0 mt-0.5" />
                      : <AlertTriangle className="size-3 text-amber-500 shrink-0 mt-0.5" />}
                    <span className="text-muted-foreground">
                      <span className="font-medium">Ligne {a.ligne}</span> — {a.message}
                    </span>
                  </div>
                ))}
                {result.anomalies.length > 8 && (
                  <p className="text-[10px] text-muted-foreground">...et {result.anomalies.length - 8} autre(s)</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Composant section Import ───────────────────────────────────────────
function ImportSection({ kpis, loading }: { kpis: ComptabiliteViewProps['kpis']; loading: boolean }) {
  const [activeTab, setActiveTab] = useState<'suivi' | 'sage'>('suivi');

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-violet-600" />
            <CardTitle className="text-sm font-medium">Import Comptabilité</CardTitle>
          </div>
          {/* Onglets Suivi / SAGE */}
          <div className="flex rounded-lg border bg-muted/50 p-0.5">
            <button
              onClick={() => setActiveTab('suivi')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'suivi'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FileDown className="size-3.5" />
                Suivi Excel
              </span>
            </button>
            <button
              onClick={() => setActiveTab('sage')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'sage'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Database className="size-3.5" />
                Import SAGE
              </span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {activeTab === 'suivi' ? (
          <ComptaImportZone
            endpoint="/api/comptabilite/import-suivi"
            label="Import Suivi Comptabilité (Excel)"
            description="Met à jour les dossiers existants avec les données de suivi : statut, montant payé, date de paiement, référence et moyen de paiement. Le numéro de dossier doit correspondre à un dossier déjà enregistré."
            columns="NumeroDossier, Statut, MontantPaye, DatePaiement, ReferencePaiement, MoyenPaiement, Observations"
            accentFrom="#7c3aed"
            accentTo="#2563eb"
            icon={FileDown}
          />
        ) : (
          <ComptaImportZone
            endpoint="/api/comptabilite/import-sage"
            label="Import SAGE"
            description="Importe les données de paiement depuis un export du logiciel SAGE. Les dossiers sont automatiquement mis à jour avec le montant payé, la date et la référence de règlement. Le statut passe automatiquement à PAYE si la date de paiement est fournie."
            columns="NumeroDossier, MontantPaye (ou Montant/NetAPayer), DatePaiement (ou Date), ReferencePaiement (ou RefPiece), MoyenPaiement (ou ModeReglement)"
            accentFrom="#059669"
            accentTo="#0891b2"
            icon={Database}
            accept=".xlsx,.xls"
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Composant KPI ──────────────────────────────────────────────────────
const kpiDefs = [
  { key: 'decomptesRecus', label: 'Décomptes reçus', icon: FileSpreadsheet, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40' },
  { key: 'paiementsEffectues', label: 'Paiements effectués', icon: BadgeCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { key: 'enCoursPaiement', label: 'En cours de paiement', icon: HourglassIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'montantTotalPaye', label: 'Montant total payé', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', format: true },
];

// ─── Vue principale ─────────────────────────────────────────────────────
export default function ComptabiliteView({ kpis, loading }: ComptabiliteViewProps) {
  if (loading || !kpis) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-96 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const topSocietes = [...kpis.parSociete].sort((a, b) => b.montantPaye - a.montantPaye).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiDefs.map((def) => {
          const val = kpis.comptabilite[def.key as keyof typeof kpis.comptabilite] as number;
          const Icon = def.icon;
          return (
            <Card key={def.key}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${def.bg}`}><Icon className={`h-4 w-4 ${def.color}`} /></div>
                  <span className="text-xs text-muted-foreground font-medium">{def.label}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {def.format ? formatMontantCourt(val) : val.toLocaleString('fr-FR')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Section Import Comptabilité (Suivi Excel + SAGE) */}
      <ImportSection kpis={kpis} loading={loading} />

      {/* Graphique Top 10 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 10 sociétés par montant payé</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topSocietes} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(v: number) => formatMontantCourt(v)} fontSize={11} />
              <YAxis type="category" dataKey="societeNom" width={120} fontSize={11} tickLine={false} />
              <Tooltip formatter={(v: number) => [formatMontantCourt(v), 'Montant payé']} />
              <Bar dataKey="montantPaye" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tableau résumé financier */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Résumé financier par société</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          <div className="min-w-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Société</th>
                  <th className="pb-2 font-medium text-right">Dossiers</th>
                  <th className="pb-2 font-medium text-right">Réclamé</th>
                  <th className="pb-2 font-medium text-right">Payé</th>
                  <th className="pb-2 font-medium text-right">Coût moyen</th>
                </tr>
              </thead>
              <tbody>
                {kpis.parSociete.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.societeNom}</td>
                    <td className="py-2 text-right">{s.nbDossiers}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.montantReclame)}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.montantPaye)}</td>
                    <td className="py-2 text-right">{formatMontantCourt(s.coutMoyen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}