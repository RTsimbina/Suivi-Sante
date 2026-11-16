'use client';

/**
 * Présentateur du tableau principal du Journal de Bord (refactoring P2 —
 * extrait du monolithe journal-view.tsx) : 10 colonnes, lignes critiques
 * surlignées, sélection d'une ligne pour le panneau de détail.
 */
import { Card } from '@/components/ui/card';
import { Clock, User, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auditActionLabel, auditNiveauLabel } from '@/lib/referentiels';
import { formatDateShort, getNiveauConfig, getActionConfig, truncate } from './types';
import type { HistoriqueEntry } from './types';

interface JournalTableProps {
  entries: HistoriqueEntry[];
  selectedEntry: HistoriqueEntry | null;
  onSelectEntry: (entry: HistoriqueEntry | null) => void;
}

export default function JournalTable({ entries, selectedEntry, onSelectEntry }: JournalTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Date / Heure</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Module</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Objet</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Action</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Champ</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Ancienne valeur</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nouvelle valeur</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Utilisateur</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Niveau</th>
              <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Détail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const nivCfg = getNiveauConfig(entry.niveau);
              const actCfg = getActionConfig(entry.action);
              const isSelected = selectedEntry?.id === entry.id;

              return (
                <tr
                  key={entry.id}
                  className={cn(
                    'border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer',
                    isSelected && 'bg-muted/60',
                    entry.niveau === 'CRITIQUE' && 'bg-red-50/30 dark:bg-red-950/20',
                  )}
                  onClick={() => onSelectEntry(isSelected ? null : entry)}
                >
                  <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {formatDateShort(entry.dateModification)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                    {entry.moduleLibelle}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap max-w-[180px] truncate">
                    {entry.objet || '-'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', actCfg.bg, actCfg.text)}>
                      {actCfg.icon} {auditActionLabel(entry.action)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {(entry.action === 'CREATION' || entry.action === 'SUPPRESSION' || entry.action === 'EXCEPTION_DOUBLON') ? '-' : entry.champ}
                  </td>
                  <td className="py-2.5 px-3 max-w-[160px]">
                    {entry.action === 'CREATION' ? (
                      <span className="text-muted-foreground">-</span>
                    ) : entry.action === 'SUPPRESSION' ? (
                      <span className="text-red-600 dark:text-red-400 line-through">{truncate(entry.ancienneValeur, 35)}</span>
                    ) : (
                      <span className="text-muted-foreground line-through">{truncate(entry.ancienneValeur, 35)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 max-w-[160px] font-medium">
                    {entry.action === 'SUPPRESSION' ? (
                      <span className="text-red-600 dark:text-red-400">Supprimé</span>
                    ) : entry.action === 'CREATION' ? (
                      <span className="text-emerald-600 dark:text-emerald-400">{truncate(entry.nouvelleValeur, 35)}</span>
                    ) : (
                      truncate(entry.nouvelleValeur, 35)
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {entry.modifiePar}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full', nivCfg.bg, nivCfg.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', nivCfg.dot)} />
                      {auditNiveauLabel(entry.niveau)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button className="p-1 rounded hover:bg-muted transition-colors">
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
