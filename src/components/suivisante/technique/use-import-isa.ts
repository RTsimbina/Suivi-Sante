'use client';

/**
 * Hook : import de fichier ISA (.xlsx) — drag & drop, upload, résultat.
 * Extrait de technique-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useRef } from 'react';
import { toast } from 'sonner';

import { ImportResult } from './types';

export function useImportISA() {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.xlsx')) {
      setImportFile(file);
      setImportResult(null);
    } else {
      toast.error('Veuillez déposer un fichier .xlsx');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('source', 'ISA');
      const res = await fetch('/api/technique/import-isa', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur lors de l'import");
      }
      const data = await res.json();
      setImportResult(data);
      if (data.nbErreurs === 0) {
        toast.success(`Import réussi : ${data.nbSucces} lignes traitées`);
      } else {
        toast.warning(`Import partiel : ${data.nbSucces} succès, ${data.nbErreurs} erreurs`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  return {
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
  };
}

export type ImportISAState = ReturnType<typeof useImportISA>;
