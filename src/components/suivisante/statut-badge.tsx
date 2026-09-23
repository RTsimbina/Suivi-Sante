'use client';

// ─── Badge de statut uniforme ───────────────────────────────────────────────
// Composant unique pour afficher n'importe quel statut conventionnel de la
// plateforme avec le bon libellé et les bonnes couleurs (source : statuts.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  APPEL_FONDS_STATUTS,
  CONTRAT_STATUTS,
  COURRIEL_STATUTS,
  DOSSIER_STATUTS,
  getStatutConfig,
  type StatutConfig,
} from '@/lib/statuts';

export type EntiteStatut = 'dossier' | 'contrat' | 'appelFonds' | 'courriel';

const CONFIGS: Record<EntiteStatut, StatutConfig[]> = {
  dossier: DOSSIER_STATUTS,
  contrat: CONTRAT_STATUTS,
  appelFonds: APPEL_FONDS_STATUTS,
  courriel: COURRIEL_STATUTS,
};

interface StatutBadgeProps {
  entite: EntiteStatut;
  valeur: string;
  className?: string;
  /** Affiche aussi la valeur technique (ex: "Validé (VALIDE)") */
  avecValeur?: boolean;
}

export function StatutBadge({ entite, valeur, className, avecValeur }: StatutBadgeProps) {
  const config = getStatutConfig(CONFIGS[entite], valeur);
  const label = config?.label ?? valeur;
  const badgeClass = config?.badge ?? 'bg-muted text-muted-foreground border-border';

  return (
    <Badge variant="outline" className={cn(badgeClass, className)}>
      {avecValeur && config ? `${label} (${config.valeur})` : label}
    </Badge>
  );
}
