'use client';

/**
 * Présentateur de la section « Justificatifs » du formulaire de création de
 * dossier (refactoring P2 — extrait du monolithe dossier-form.tsx) : zone de
 * dépôt multi-fichiers, choix du type par fichier, indicateur d'upload et
 * suppression. La ref de l'input caché est fournie par le hook.
 */
import type { RefObject } from 'react';
import { Loader2, FileText, Upload, X } from 'lucide-react';
import { JUSTIF_TYPES, JUSTIF_LABELS } from './types';
import type { UploadedFile } from './types';

interface FormJustificatifsProps {
  files: UploadedFile[];
  uploadingFiles: string[];
  fileRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onFileTypeChange: (id: string, type: string) => void;
}

export default function FormJustificatifs({
  files,
  uploadingFiles,
  fileRef,
  onAddFiles,
  onRemoveFile,
  onFileTypeChange,
}: FormJustificatifsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText className="size-4 text-emerald-600" />
        Justificatifs
      </h4>
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
        <Upload className="size-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">Cliquez pour ajouter des fichiers (PDF, JPG, PNG — max 10 Mo)</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={onAddFiles} />
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border p-2">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 truncate">{f.file.name}</span>
              <select value={f.type} onChange={e => onFileTypeChange(f.id, e.target.value)} className="h-7 text-xs rounded border bg-transparent px-1">
                {JUSTIF_TYPES.map(t => <option key={t} value={t}>{JUSTIF_LABELS[t]}</option>)}
              </select>
              {uploadingFiles.includes(f.id) && <Loader2 className="size-3.5 animate-spin text-emerald-600" />}
              <button type="button" onClick={() => onRemoveFile(f.id)} className="text-red-500 hover:text-red-700 dark:text-red-300">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
