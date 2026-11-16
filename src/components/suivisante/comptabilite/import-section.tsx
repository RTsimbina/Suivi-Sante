'use client';

/**
 * Présentateur de la section « Import Comptabilité » (refactoring P2 —
 * extrait du monolithe comptabilite-view.tsx) : onglets Suivi Excel / SAGE
 * qui basculent entre deux zones d'import (endpoints, colonnes et accents
 * différents). Onglet actif en état local pur.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileDown } from 'lucide-react';
import ComptaImportZone from './import-zone';

export default function ImportSection() {
  const [activeTab, setActiveTab] = useState<'suivi' | 'sage'>('suivi');

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-violet-600" />
            <CardTitle className="text-sm font-medium">Import Comptabilité</CardTitle>
          </div>
          {/* Onglets Suivi / SAGE */}
          <div className="flex rounded-lg border bg-muted/50 p-0.5">
            <button
              onClick={() => setActiveTab('suivi')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'suivi'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FileDown className="size-3.5" />
                Suivi Excel
              </span>
            </button>
            <button
              onClick={() => setActiveTab('sage')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'sage'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Database className="size-3.5" />
                Import SAGE
              </span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {activeTab === 'suivi' ? (
          <ComptaImportZone
            endpoint="/api/comptabilite/import-suivi"
            label="Import Suivi Comptabilité (Excel)"
            description="Met à jour les dossiers existants avec les données de suivi : statut, montant payé, date de paiement, référence et moyen de paiement. Le numéro de dossier doit correspondre à un dossier déjà enregistré."
            columns="NumeroDossier, Statut, MontantPaye, DatePaiement, ReferencePaiement, MoyenPaiement, Observations"
            accentFrom="#7c3aed"
            accentTo="#2563eb"
            icon={FileDown}
          />
        ) : (
          <ComptaImportZone
            endpoint="/api/comptabilite/import-sage"
            label="Import SAGE"
            description="Importe les données de paiement depuis un export du logiciel SAGE. Les dossiers sont automatiquement mis à jour avec le montant payé, la date et la référence de règlement. Le statut passe automatiquement à PAYE si la date de paiement est fournie."
            columns="NumeroDossier, MontantPaye (ou Montant/NetAPayer), DatePaiement (ou Date), ReferencePaiement (ou RefPiece), MoyenPaiement (ou ModeReglement)"
            accentFrom="#059669"
            accentTo="#0891b2"
            icon={Database}
            accept=".xlsx,.xls"
          />
        )}
      </CardContent>
    </Card>
  );
}
