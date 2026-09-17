'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  STATUT_FACTURE_COLORS,
  STATUT_DOSSIER_COLORS,
  STATUT_DOSSIER_LABELS,
} from '@/lib/portail-prestataire';

// ─── Carte KPI (même pattern que le Portail Client) ────────────────────────

export function KPICard({
  icon: Icon,
  label,
  value,
  color = 'text-emerald-600 dark:text-emerald-400',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Card className='py-4'>
      <CardContent className='px-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='min-w-0'>
            <p className='text-[11px] text-muted-foreground truncate'>{label}</p>
            <p className='text-lg font-bold tracking-tight mt-0.5'>{value}</p>
          </div>
          <Icon className={cn('h-4 w-4 shrink-0', color)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Badge de statut de facture (statut dérivé) ────────────────────────────

export function StatutFactureBadge({ statut, label }: { statut: string; label: string }) {
  const color = STATUT_FACTURE_COLORS[statut as keyof typeof STATUT_FACTURE_COLORS]
    ?? 'bg-muted text-muted-foreground';
  return <Badge className={cn('text-[10px] border-transparent', color)}>{label}</Badge>;
}

// ─── Badge de statut de dossier (workflow plateforme) ──────────────────────

export function StatutDossierBadge({ statut }: { statut: string }) {
  const color = STATUT_DOSSIER_COLORS[statut as keyof typeof STATUT_DOSSIER_COLORS]
    ?? 'bg-muted text-muted-foreground';
  const label = STATUT_DOSSIER_LABELS[statut] ?? statut;
  return <Badge className={cn('text-[10px] border-transparent', color)}>{label}</Badge>;
}

// ─── Badge de convention ────────────────────────────────────────────────────

export function ConventionBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className='text-[10px] border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'>
      Convention active
    </Badge>
  ) : (
    <Badge className='text-[10px] border-transparent bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'>
      Convention inactive
    </Badge>
  );
}
