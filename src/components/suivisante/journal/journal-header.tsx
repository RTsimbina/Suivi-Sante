'use client';

/**
 * Présentateur de l'en-tête du Journal de Bord (refactoring P2 — extrait du
 * monolithe journal-view.tsx) : titre et boutons d'export Excel/PDF.
 */
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, FileSpreadsheet, FileText } from 'lucide-react';

interface JournalHeaderProps {
  exporting: boolean;
  onExport: (format: 'excel' | 'pdf') => void;
}

export default function JournalHeader({ exporting, onExport }: JournalHeaderProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
              <Shield className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <CardTitle className="text-base">Journal d&apos;Audit des Paramétrages</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Historique immuable des opérations — Accessible uniquement aux administrateurs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => onExport('excel')} disabled={exporting}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => onExport('pdf')} disabled={exporting}
            >
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
