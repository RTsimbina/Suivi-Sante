'use client';

import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Clock, History, Trash2, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Anomalie { ligne: number; type: 'erreur' | 'avertissement'; champ: string; message: string; }
interface ImportResult { importId: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; tauxSucces: number; anomalies: Anomalie[]; }
interface HistoriqueItem { id: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; createdAt: string; _count: { dossiers: number }; }

function ImportZone({ source, label, description, columns }: { source: string; label: string; description: string; columns: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
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
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
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
    <Card className="p-5">
      <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <FileUp className="size-4 text-emerald-600" />
        {label}
      </h4>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <form onSubmit={handleImport} className="space-y-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-6 mx-auto text-muted-foreground mb-1.5" />
          <p className="text-xs font-medium">{file ? file.name : 'Glissez ou cliquez'}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">.xlsx, .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
        </div>
        <p className="text-[10px] text-muted-foreground">Colonnes : {columns}</p>
        <Button type="submit" disabled={!file || loading} size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
          {loading ? 'Import...' : 'Importer'}
        </Button>
      </form>
      {result && (
        <div className="mt-3 space-y-2 p-3 rounded-lg border bg-muted/20">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><p className="font-bold">{result.nbSucces}</p><p className="text-muted-foreground">Succès</p></div>
            <div><p className="font-bold text-red-600">{result.nbErreurs}</p><p className="text-muted-foreground">Erreurs</p></div>
            <div><p className="font-bold">{result.tauxSucces}%</p><p className="text-muted-foreground">Taux</p></div>
          </div>
          {result.anomalies.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {result.anomalies.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  {a.type === 'erreur' ? <XCircle className="size-3 text-red-500 shrink-0 mt-0.5" /> : <AlertTriangle className="size-3 text-amber-500 shrink-0 mt-0.5" />}
                  <span>Ligne {a.ligne}: {a.message}</span>
                </div>
              ))}
              {result.anomalies.length > 5 && <p className="text-[10px] text-muted-foreground">...et {result.anomalies.length - 5} autres</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ImportView() {
  const [historique, setHistorique] = useState<HistoriqueItem[]>([]);

  async function loadHistorique() {
    try {
      const res = await fetch('/api/import');
      const data = await res.json();
      setHistorique(data.historiques || []);
    } catch { /* silent */ }
  }

  useState(() => { loadHistorique(); });

  return (
    <div className="space-y-6">
      {/* Deux zones côte à côte : ISA et SAGE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImportZone
          source="ISA"
          label="Import ISA"
          description="Met à jour les montants techniques et l'avancement des dossiers en cours."
          columns="NumeroDossier, MontantValide, StatutTechnique, DateTraitement"
        />
        <ImportZone
          source="SAGE"
          label="Import SAGE"
          description="Met à jour les paiements effectués et les références de règlement."
          columns="NumeroDossier, MontantPaye, DatePaiement, ReferencePaiement"
        />
      </div>

      {/* Zone Excel générique */}
      <ImportZone
        source="EXCEL"
        label="Import Excel Générique"
        description="Crée de nouveaux dossiers ou met à jour les existants depuis un fichier Excel standard."
        columns="NumeroDossier, Beneficiaire, Societe, TypeDossier, MontantReclame, DateReception"
      />

      {/* Historique */}
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