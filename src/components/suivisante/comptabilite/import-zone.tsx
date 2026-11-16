'use client';

/**
 * Présentateur de la zone d'import comptable réutilisable (refactoring P2 —
 * extrait du monolithe comptabilite-view.tsx) : dépôt glisser-déposer d'un
 * fichier Excel, colonnes attendues, POST multipart vers l'endpoint fourni
 * puis affichage du résultat (succès/erreurs/taux, lignes ignorées, montant
 * total, anomalies détaillées). État local autonome, thème par accents CSS.
 */
import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet, Wallet, Upload, XCircle,
  AlertTriangle, CheckCircle2, ArrowDownToLine,
} from 'lucide-react';
import { formatMontantCourt } from '../format';
import type { ImportResult } from './types';

interface ComptaImportZoneProps {
  endpoint: string;
  label: string;
  description: string;
  columns: string;
  accentFrom: string;
  accentTo: string;
  icon: React.ElementType;
  accept?: string;
}

export default function ComptaImportZone({
  endpoint, label, description, columns, accentFrom, accentTo, icon: Icon, accept = '.xlsx,.xls',
}: ComptaImportZoneProps) {
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
              <span className="text-sm font-semibold text-foreground">Résultat de l&apos;import</span>
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
