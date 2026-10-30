'use client';

/**
 * Carte d'un dossier client côté portail : en-tête (numéro, type, prestataire,
 * badge statut), pipeline visuel, montants et message contextuel selon le
 * statut (payé / rejeté / en cours / reçu). Extrait tel quel de l'ancien
 * monolithe portail-view.tsx.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMontant, formatDate, statutColor, typeDossierLabel } from '../format';
import { cn } from '@/lib/utils';
import type { PortailDossier } from './types';
import StatusPipeline from './status-pipeline';

export default function DossierClientCard({ dossier }: { dossier: PortailDossier }) {
  const isPaye = dossier.statut === 'PAYE';
  const isRejete = dossier.statut === 'REJETE';
  const isEnCours = !isPaye && !isRejete && dossier.statut !== 'RECU';

  // Déterminer le service actuel
  const serviceActif = (() => {
    switch (dossier.statut) {
      case 'RECU': return 'réception';
      case 'EN_ANALYSE': return 'service médical';
      case 'VALIDE': return 'vérification comptable';
      case 'EN_COMPTABILITE': return 'comptabilité';
      case 'EN_PAIEMENT': return 'paiement';
      default: return 'traitement';
    }
  })();

  return (
    <Card className="border-emerald-100 dark:border-emerald-800 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{dossier.numeroDossier}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {typeDossierLabel(dossier.typeDossier)} — Reçu le {formatDate(dossier.dateReception)}
            </p>
            {dossier.prestataire && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Prestataire : {dossier.prestataire}
              </p>
            )}
          </div>
          <Badge className={cn('text-[10px] shrink-0', statutColor(dossier.statut))}>
            {dossier.statutLabel}
          </Badge>
        </div>

        {/* Pipeline visuel */}
        <StatusPipeline statut={dossier.statut} />

        {/* Montants */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Montant réclamé</p>
            <p className="text-base font-bold text-foreground mt-0.5">{formatMontant(dossier.montantReclame)}</p>
          </div>
          {isPaye && dossier.montantPaye !== undefined && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 p-3">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Montant payé</p>
              <p className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatMontant(dossier.montantPaye)}</p>
            </div>
          )}
        </div>

        {/* Message contextuel */}
        <div className={cn(
          'rounded-lg p-3 text-sm',
          isPaye && 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
          isRejete && 'bg-red-50 dark:bg-red-950/40 border border-red-100 text-red-800',
          isEnCours && 'bg-amber-50 dark:bg-amber-950/40 border border-amber-100 text-amber-800',
          !isPaye && !isRejete && !isEnCours && 'bg-muted border border-border text-foreground'
        )}>
          {isPaye && dossier.montantPaye && dossier.datePaiement && (
            <p>
              ✓ Votre remboursement de <strong>{formatMontant(dossier.montantPaye)}</strong> a été effectué le{' '}
              <strong>{formatDate(dossier.datePaiement)}</strong>.
              {dossier.referencePaiement && (
                <> Référence : <strong>{dossier.referencePaiement}</strong></>
              )}
            </p>
          )}
          {isRejete && (
            <p>
              ✕ Votre dossier a été rejeté.
              {dossier.motifRejet && <> Motif : <strong>{dossier.motifRejet}</strong></>}
              {' '}Pour toute réclamation, veuillez contacter votre service RH.
            </p>
          )}
          {isEnCours && (
            <p>
              ⏳ Votre dossier est en cours de traitement au service{' '}
              <strong>{serviceActif}</strong>.
            </p>
          )}
          {!isPaye && !isRejete && !isEnCours && (
            <p>
              📋 Votre dossier a été reçu et est en attente de prise en charge par nos services.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
