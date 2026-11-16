'use client';

/**
 * Présentateur du panneau de détail d'une opération du Journal de Bord
 * (refactoring P2 — extrait du monolithe journal-view.tsx) : toutes les
 * colonnes techniques + encart « métadonnées » (exception de doublon).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/auth-context';
import { formatDate, getNiveauConfig } from './types';
import type { HistoriqueEntry } from './types';

interface JournalDetailProps {
  entry: HistoriqueEntry;
  onClose: () => void;
}

export default function JournalDetail({ entry, onClose }: JournalDetailProps) {
  return (
    <Card className={cn('border', getNiveauConfig(entry.niveau).border)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Détail de l&apos;opération</CardTitle>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-xs">
          <DetailField label="N° Journal" value={entry.journalNumero} mono />
          <DetailField label="Date" value={formatDate(entry.dateModification)} />
          <DetailField label="Module" value={entry.moduleLibelle} />
          <DetailField label="Entité" value={entry.entite} mono />
          <DetailField label="Objet" value={entry.objet || '-'} />
          <DetailField label="Action" value={entry.action} />
          <DetailField label="Champ modifié" value={(entry.action === 'CREATION' || entry.action === 'SUPPRESSION' || entry.action === 'EXCEPTION_DOUBLON') ? '-' : entry.champ} />
          <DetailField label="Ancienne valeur" value={entry.ancienneValeur || 'vide'} />
          <DetailField label="Nouvelle valeur" value={entry.nouvelleValeur || 'vide'} />
          <DetailField label="Effectué par" value={entry.modifiePar} />
          <DetailField label="Rôle" value={entry.roleUtilisateur ? (ROLE_LABELS[entry.roleUtilisateur as keyof typeof ROLE_LABELS] ?? entry.roleUtilisateur) : '-'} />
          {entry.metadonnees && (
            <div className="md:col-span-2 lg:col-span-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                Détails de l&apos;exception de doublon
              </p>
              <pre className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(entry.metadonnees), null, 2);
                  } catch {
                    return entry.metadonnees;
                  }
                })()}
              </pre>
            </div>
          )}
          <DetailField label="ID utilisateur" value={entry.modifieParId || '-'} mono />
          <DetailField label="ID entité" value={entry.entiteId} mono />
          <DetailField label="Niveau" value={entry.niveau} />
          <DetailField label="Adresse IP" value={entry.ipAdresse || '-'} mono />
          <DetailField label="Navigateur" value={entry.navigateur || '-'} />
          <DetailField label="Session" value={entry.sessionId || '-'} mono />
          <DetailField label="Motif" value={entry.motif || 'Aucun motif spécifié'} className="md:col-span-2 lg:col-span-3" />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <span className="text-muted-foreground">{label} :</span>
      <span className={cn('ml-1.5', mono && 'font-mono text-[11px] text-muted-foreground/80')}>{value}</span>
    </div>
  );
}
