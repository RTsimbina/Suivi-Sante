'use client';

import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Clock, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';

interface Anomalie { ligne: number; type: 'erreur' | 'avertissement'; champ: string; message: string; }
interface ImportResult { importId: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; tauxSucces: number; anomalies: Anomalie[]; }
interface HistoriqueItem { id: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; createdAt: string; _count: { dossiers: number }; }

export default function ImportView() {
  const [source, setSource] = useState('EXCEL');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [historique, setHistorique] = useState<HistoriqueItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setResult(data);
      loadHistorique();
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistorique() {
    try {
      const res = await fetch('/api/import');
      const data = await res.json();
      setHistorique(data.historiques || []);
    } catch { /* silent */ }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  }

  return (
    <div className="space-y-6">
      {/* Formulaire d'import */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-emerald-600" />
          Importer des dossiers
        </h3>
        <form onSubmit={handleImport} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source des données</label>
              <div className="flex gap-2">
                {(['EXCEL', 'ISA', 'SAGE'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      source === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border hover:bg-muted'
                    }`}
                  >
                    {s === 'ISA' ? 'ISA' : s === 'SAGE' ? 'SAGE' : 'Excel Générique'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {source === 'ISA' && 'ISA : met à jour les montants techniques et l\'avancement des dossiers'}
                {source === 'SAGE' && 'SAGE : met à jour les paiements effectués'}
                {source === 'EXCEL' && 'Excel : crée de nouveaux dossiers ou met à jour les existants'}
              </p>
            </div>
          </div>

          {/* Zone de drop */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {file ? file.name : 'Glissez votre fichier Excel ici ou cliquez pour sélectionner'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Formats acceptés : .xlsx, .xls</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Colonnes attendues : NumeroDossier, Beneficiaire, Societe, TypeDossier, MontantReclame, DateReception
              {source === 'ISA' && ' + MontantValide, StatutTechnique, DateTraitement'}
              {source === 'SAGE' && ' + MontantPaye, DatePaiement, ReferencePaiement'}
            </p>
            <Button type="submit" disabled={!file || loading}>
              {loading ? 'Import en cours...' : 'Importer'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Résultat de l'import */}
      {result && (
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            Rapport d&apos;import — {result.nomFichier}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.nbLignes}</p>
              <p className="text-xs text-muted-foreground">Lignes traitées</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.nbSucces}</p>
              <p className="text-xs text-muted-foreground">Succès</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{result.nbErreurs}</p>
              <p className="text-xs text-muted-foreground">Erreurs</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.tauxSucces}%</p>
              <p className="text-xs text-muted-foreground">Taux de succès</p>
            </div>
          </div>
          {result.anomalies.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Anomalies détectées ({result.anomalies.length})</h4>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {result.anomalies.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                    {a.type === 'erreur' ? <XCircle className="size-3.5 text-red-500 shrink-0 mt-0.5" /> : <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-medium">Ligne {a.ligne}</span> — {a.message}
                      <span className="text-muted-foreground ml-1">({a.champ})</span>
                    </div>
                    <Badge variant="outline" className={`ml-auto text-[10px] shrink-0 ${a.type === 'erreur' ? 'border-red-200 text-red-600' : 'border-amber-200 text-amber-600'}`}>
                      {a.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Historique des imports */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <History className="size-5 text-emerald-600" />
            Historique des imports
          </h3>
          <Button variant="outline" size="sm" onClick={loadHistorique}>Actualiser</Button>
        </div>
        {historique.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun import effectué.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Date</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Fichier</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Source</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Lignes</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Succès</th>
                  <th className="py-2 font-medium text-muted-foreground text-right">Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="py-2 pr-4 font-medium">{h.nomFichier}</td>
                    <td className="py-2 pr-4"><Badge variant="outline" className="text-xs">{h.source}</Badge></td>
                    <td className="py-2 pr-4 text-right">{h.nbLignes}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600 font-medium">{h.nbSucces}</td>
                    <td className="py-2 text-right text-red-600 font-medium">{h.nbErreurs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}