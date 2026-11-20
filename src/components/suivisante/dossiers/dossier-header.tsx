'use client';

/**
 * Présentateur de l'en-tête du détail dossier (refactoring P2 — extrait du
 * monolithe dossier-detail.tsx) : titre, métadonnées société/date/statut,
 * sélection du statut et barre d'onglets avec compteurs.
 */
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, Building2, Calendar, Clock, MessageSquare, Paperclip, Brain,
} from 'lucide-react';
import { formatDate, statutLabel, statutColor } from '../format';
import { cn } from '@/lib/utils';
import { DOSSIER_STATUT_VALEURS } from '@/lib/statuts';
import type { DossierDetail } from './types';

export type OngletDossier = 'info' | 'ia' | 'historique' | 'commentaires' | 'justificatifs';

interface DossierHeaderProps {
  dossier: DossierDetail;
  nbAlertesIa: number;
  ongletActif: OngletDossier;
  onOngletChange: (onglet: OngletDossier) => void;
  onStatutChange: (statut: string) => void;
}

const STATUTS = DOSSIER_STATUT_VALEURS;

export default function DossierHeader({
  dossier,
  nbAlertesIa,
  ongletActif,
  onOngletChange,
  onStatutChange,
}: DossierHeaderProps) {
  const onglets: { key: OngletDossier; label: string; icon: typeof FileText }[] = [
    { key: 'info', label: 'Informations', icon: FileText },
    { key: 'ia', label: `IA (${nbAlertesIa})`, icon: Brain },
    { key: 'historique', label: `Historique (${dossier.historiqueParsed?.length || 0})`, icon: Clock },
    { key: 'commentaires', label: `Commentaires (${dossier.commentaires?.length || 0})`, icon: MessageSquare },
    { key: 'justificatifs', label: `Pièces (${dossier.justificatifs?.length || 0})`, icon: Paperclip },
  ];

  return (
    <div className="px-6 pt-6 pb-4 border-b shrink-0">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="text-lg">
              <span className="font-mono text-brand-600">{dossier.numeroDossier}</span>
              <span className="mx-2 text-muted-foreground">—</span>
              {dossier.beneficiaire}
            </DialogTitle>
            <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-xs">
                <Building2 className="h-3 w-3" />
                {dossier.societe?.nom}
              </span>
              <span className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                {formatDate(dossier.dateReception)}
              </span>
              <Badge variant="outline" className={cn('text-xs', statutColor(dossier.statut))}>
                {statutLabel(dossier.statut)}
              </Badge>
            </DialogDescription>
          </div>
          <Select value={dossier.statut} onValueChange={onStatutChange}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUTS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {statutLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogHeader>

      {/* Onglets */}
      <div className="flex gap-1 mt-4 border-b -mb-px">
        {onglets.map((onglet) => {
          const Icon = onglet.icon;
          return (
            <button
              key={onglet.key}
              type="button"
              onClick={() => onOngletChange(onglet.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                ongletActif === onglet.key
                  ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {onglet.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
