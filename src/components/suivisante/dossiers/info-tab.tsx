'use client';

/**
 * Présentateur de l'onglet Informations (refactoring P2 — extrait du
 * monolithe dossier-detail.tsx) : sections bénéficiaire, détails du dossier,
 * soins & paiement, gestionnaires et observations.
 */
import {
  User, Building2, Calendar, CreditCard, AlertCircle,
} from 'lucide-react';
import { formatDate, formatMontant, typeDossierLabel } from '../format';
import { cn } from '@/lib/utils';
import type { DossierDetail } from './types';

export default function InfoTab({ dossier }: { dossier: DossierDetail }) {
  return (
    <div className="space-y-6">
      {/* Bénéficiaire */}
      <InfoSection title="Bénéficiaire & Assuré">
        <InfoRow label="Bénéficiaire" value={dossier.beneficiaire} icon={User} />
        <InfoRow label="Assuré" value={dossier.assure || null} />
        <InfoRow label="N° SS" value={dossier.nSS} />
        <InfoRow label="Société" value={dossier.societe?.nom} icon={Building2} />
      </InfoSection>

      {/* Dossier */}
      <InfoSection title="Détails du dossier">
        <InfoRow label="Type" value={typeDossierLabel(dossier.typeDossier)} />
        <InfoRow label="Source" value={dossier.source} />
        <InfoRow label="Montant réclamé" value={formatMontant(dossier.montantReclame)} icon={CreditCard} highlight />
        {dossier.montantValide !== null && (
          <InfoRow label="Montant validé" value={formatMontant(dossier.montantValide)} />
        )}
        {dossier.montantPaye !== null && (
          <InfoRow label="Montant payé" value={formatMontant(dossier.montantPaye)} />
        )}
        {dossier.motifRejet && (
          <div className="flex items-start gap-2 py-1.5">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Motif de rejet</p>
              <p className="text-sm font-medium text-red-600">{dossier.motifRejet}</p>
            </div>
          </div>
        )}
      </InfoSection>

      {/* Soins */}
      <InfoSection title="Soins & Paiement">
        <InfoRow label="Date des soins" value={dossier.dateSoins ? formatDate(dossier.dateSoins) : null} icon={Calendar} />
        <InfoRow label="Prestataire" value={dossier.prestataire || null} />
        <InfoRow label="Moyen de paiement" value={dossier.moyenPaiement} />
        {dossier.referencePaiement && (
          <InfoRow label="Réf. paiement" value={dossier.referencePaiement} />
        )}
      </InfoSection>

      {/* Gestionnaires */}
      <InfoSection title="Gestionnaires">
        <InfoRow label="Accueil" value={dossier.gestionnaireAccueil?.nom} />
        <InfoRow label="Technique" value={dossier.gestionnaireTechnique?.nom} />
        <InfoRow label="Comptabilité" value={dossier.gestionnaireCompta?.nom} />
        <InfoRow label="Créé par" value={dossier.createur?.nom} />
      </InfoSection>

      {/* Observations */}
      {dossier.observations && (
        <InfoSection title="Observations">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dossier.observations}</p>
        </InfoSection>
      )}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm', highlight ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-medium')}>
          {value || <span className="text-muted-foreground font-normal">—</span>}
        </p>
      </div>
    </div>
  );
}
