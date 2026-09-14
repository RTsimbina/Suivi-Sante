'use client';

/**
 * Onglet 3 : Import ISA (dropzone .xlsx + résultats d'import).
 * Présentateur pur extrait de technique-view.tsx (Vague 3) — JSX inchangé,
 * l'état est fourni par le hook useImportISA appelé dans TechniqueView.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  XCircle as XCircleIcon,
} from 'lucide-react';

import { ImportISAState } from './use-import-isa';

export default function ImportISATab({
  state,
}: {
  state: ImportISAState;
}) {
  const {
    importFile,
    importing,
    importResult,
    isDragging,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleImport,
  } = state;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          Import fichier ISA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
            cursor-pointer transition-colors
            ${isDragging
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
              : importFile
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40/50'
                : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          {importFile ? (
            <>
              <FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" />
              <p className="text-sm font-medium">{importFile.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(importFile.size / 1024).toFixed(1)} Ko — Cliquez ou déposez pour changer
              </p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium">
                Glissez-déposez votre fichier <span className="text-emerald-600 font-semibold">.xlsx</span> ici
              </p>
              <p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
            </>
          )}
        </div>

        <Button
          onClick={handleImport}
          disabled={importing || !importFile}
          className="w-full gap-2 sm:w-auto"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {importing ? 'Import en cours...' : 'Importer le fichier'}
        </Button>

        {/* Results */}
        {importResult && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Lignes traitées</p>
                <p className="text-2xl font-bold">{importResult.nbLignes}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-emerald-600">Succès</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.nbSucces}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-red-500">Erreurs</p>
                <p className="text-2xl font-bold text-red-600">{importResult.nbErreurs}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Taux de succès</p>
                <p className="text-2xl font-bold">{importResult.tauxSucces.toFixed(1)}%</p>
              </Card>
            </div>

            {importResult.erreurs && importResult.erreurs.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-semibold">Détail des erreurs</p>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {importResult.erreurs.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm rounded-md border border-red-100 bg-red-50 dark:bg-red-950/40 p-2"
                    >
                      <XCircleIcon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-red-700 dark:text-red-300">Ligne {err.ligne} :</span>{' '}
                        <span className="text-red-600">{err.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {importResult.nbErreurs === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  Toutes les lignes ont été importées avec succès !
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
