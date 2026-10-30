'use client';

/**
 * Dialogue d'import Excel des bénéficiaires : dropzone avec validation
 * d'extension, envoi FormData, rapport de succès/erreurs par ligne et
 * remise à zéro à la fermeture. Extrait tel quel de l'ancien monolithe
 * assures-view.tsx — les états du formulaire d'import sont locaux au
 * dialogue (comme dans le monolithe, ils sont réinitialisés à la fermeture) ;
 * l'appel réseau est délégué à `importerFichier` (hook de la vue mère).
 */
import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle as XCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { ImportResult } from './types';

interface ImportDialogProps {
  /** POST FormData : renvoie le rapport ou lève une erreur (messages toasts locaux). */
  importerFichier: (file: File) => Promise<ImportResult>;
}

export default function ImportDialog({ importerFichier }: ImportDialogProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Handlers: Import ───
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setImportFile(file); setImportResult(null);
    } else { toast.error('Veuillez déposer un fichier .xlsx'); }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImportFile(file); setImportResult(null); }
  };

  const handleImport = async () => {
    if (!importFile) { toast.error('Veuillez sélectionner un fichier'); return; }
    setImporting(true); setImportResult(null);
    try {
      const data = await importerFichier(importFile);
      setImportResult(data);
      if (data.nbErreurs === 0) {
        toast.success(`Import réussi : ${data.nbSucces} bénéficiaires importés`);
      } else {
        toast.warning(`Import partiel : ${data.nbSucces} succès, ${data.nbErreurs} erreurs`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally { setImporting(false); }
  };

  return (
    <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setImportFile(null); setImportResult(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 h-9 text-sm"><Upload className="h-4 w-4" />Importer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Importer des bénéficiaires
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Colonnes attendues :</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Matricule *</strong>, <strong>Nom *</strong>, Prénoms, <strong>Statut</strong> (Assuré/Conjoint/Enfant), <strong>Société client *</strong>,
              Assuré(e) (matricule principal), Famille, Genre, Date de naissance, Date d'effet, Barème (ex: 0,8), Téléphone, Email, NSS
            </p>
            <p className="text-xs text-amber-600 mt-1">* = obligatoire. Les assurés principaux sont créés en premier, puis les ayants droit sont rattachés automatiquement.</p>
          </div>
          <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors
              ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                : importFile ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50'
                : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'}`}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            {importFile ? (
              <><FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" /><p className="text-sm font-medium">{importFile.name}</p><p className="text-xs text-muted-foreground mt-1">{(importFile.size / 1024).toFixed(1)} Ko</p></>
            ) : (
              <><Upload className="h-10 w-10 text-muted-foreground/40 mb-2" /><p className="text-sm font-medium">Glissez-déposez votre fichier <span className="text-emerald-600 font-semibold">.xlsx</span> ici</p><p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p></>
            )}
          </div>
          <Button onClick={handleImport} disabled={importing || !importFile} className="w-full gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Import en cours...' : 'Importer le fichier'}
          </Button>
          {importResult && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">Lignes</p><p className="text-xl font-bold">{importResult.nbLignes}</p></Card>
                <Card className="p-3 text-center"><p className="text-xs text-emerald-600">Succès</p><p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.nbSucces}</p></Card>
                <Card className="p-3 text-center"><p className="text-xs text-red-500">Erreurs</p><p className="text-xl font-bold text-red-600">{importResult.nbErreurs}</p></Card>
              </div>
              {importResult.erreurs && importResult.erreurs.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {importResult.erreurs.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded-md border border-red-100 bg-red-50 dark:bg-red-950/40 p-2">
                      <XCircleIcon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div><span className="font-medium text-red-700 dark:text-red-300">Ligne {err.ligne} :</span>{' '}<span className="text-red-600">{err.message}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {importResult.nbErreurs === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" /><p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Tous les bénéficiaires ont été importés avec succès !</p>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
