'use client';

/**
 * Présentateur de l'onglet Justificatifs (refactoring P2 — extrait du
 * monolithe dossier-detail.tsx) : formulaire d'upload (fichier + type) et
 * liste des pièces jointes avec téléchargement via /api/upload?id=.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText, Download, Upload, Paperclip, Loader2 } from 'lucide-react';
import { formatDate } from '../format';
import { cn } from '@/lib/utils';
import { JUSTIFICATIF_COLORS, JUSTIFICATIF_LABELS } from './types';
import type { JustificatifDossier } from './types';

interface JustificatifsTabProps {
  justificatifs: JustificatifDossier[];
  uploadFile: File | null;
  uploadType: string;
  onTypeChange: (type: string) => void;
  onSelectFichier: (fichier: File | null) => void;
  uploading: boolean;
  onEnvoyer: () => void;
}

export default function JustificatifsTab({
  justificatifs,
  uploadFile,
  uploadType,
  onTypeChange,
  onSelectFichier,
  uploading,
  onEnvoyer,
}: JustificatifsTabProps) {
  return (
    <div className="space-y-3">
      {/* Upload form */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end p-3 rounded-lg border border-dashed bg-muted/30">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Fichier (PDF, JPG, PNG, max 10 Mo)</label>
          <input
            type="file"
            id="upload-justificatif"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => onSelectFichier(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-emerald-50 dark:file:bg-emerald-950/40 file:text-emerald-700 dark:file:text-emerald-300 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50"
          />
        </div>
        <Select value={uploadType} onValueChange={onTypeChange}>
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FACTURE">Facture</SelectItem>
            <SelectItem value="ORDONNANCE">Ordonnance</SelectItem>
            <SelectItem value="RIB">RIB</SelectItem>
            <SelectItem value="CARNET_SOINS">Carnet de soins</SelectItem>
            <SelectItem value="DECOMPTE">Décompte</SelectItem>
            <SelectItem value="AUTRE">Autre</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 gap-1 shrink-0"
          onClick={onEnvoyer}
          disabled={uploading || !uploadFile}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Ajouter
        </Button>
      </div>

      {justificatifs && justificatifs.length > 0 ? (
        justificatifs.map((j) => (
          <div
            key={j.id}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="h-10 w-10 rounded-md bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{j.nomFichier}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn('text-[10px]', JUSTIFICATIF_COLORS[j.type] || JUSTIFICATIF_COLORS.AUTRE)}>
                  {JUSTIFICATIF_LABELS[j.type] || j.type}
                </Badge>
                {j.tailleKo && (
                  <span className="text-xs text-muted-foreground">{j.tailleKo} Ko</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(j.createdAt)}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" asChild>
              <a href={`/api/upload?id=${j.id}`} download={j.nomFichier} target="_blank" rel="noopener noreferrer">
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </a>
            </Button>
          </div>
        ))
      ) : (
        <div className="text-center py-12">
          <Paperclip className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucun justificatif téléchargé pour ce dossier
          </p>
        </div>
      )}
    </div>
  );
}
