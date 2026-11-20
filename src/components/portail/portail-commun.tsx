'use client';

/**
 * portail-commun.tsx — Composants partagés du portail (découpage P2-01) :
 * cartes KPI, champs d'information, carte dossier, barre de pagination et
 * barre d'export des dossiers (P2-02B/C/D). Un seul fichier pour les petits
 * composants communs aux vues Assuré et Entreprise — pas de duplication.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, ChevronRight, ChevronLeft, Download, FileDown, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatMontant, formatDate, STATUT_COLORS, STATUT_LABELS, TYPE_BENEF_LABELS, BoutonsStatut,
} from './utils';
import { telechargerExportCsv, telechargerExportPdf } from './exports';
import type { PaginationInfo, PortailData, PortailDossier } from './types';

// ─── Cartes KPI ──────────────────────────────────────────────────────────────

export function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className={cn('border-' + color + '-100 dark:border-' + color + '-800')}>
      <CardContent className='p-3 flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <div className={cn('p-1.5 rounded-md bg-' + color + '-50 dark:bg-' + color + '-950/40')}>
            {icon}
          </div>
          <span className='text-[10px] text-muted-foreground font-medium leading-tight'>{label}</span>
        </div>
        <p className='text-lg font-bold leading-tight'>{value}</p>
      </CardContent>
    </Card>
  );
}

export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium'>{label}</p>
      <p className='text-sm mt-0.5'>{value || '—'}</p>
    </div>
  );
}

// ─── Carte dossier ───────────────────────────────────────────────────────────

export function DossierCard({ dossier, showAssure }: { dossier: PortailDossier; showAssure?: boolean }) {
  return (
    <div className='p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 flex-wrap'>
            <p className='text-xs font-semibold'>{dossier.numeroDossier}</p>
            <Badge className={cn('text-[10px]', STATUT_COLORS[dossier.statut] || 'bg-gray-100 text-gray-700')}>
              {STATUT_LABELS[dossier.statut] || dossier.statut}
            </Badge>
          </div>
          <div className='flex items-center gap-3 mt-1.5 text-xs text-muted-foreground'>
            <span>{dossier.beneficiaire}</span>
            {showAssure && dossier.assure && (
              <span className='text-[10px]'>
                ({TYPE_BENEF_LABELS[dossier.assure.typeBeneficiaire] || dossier.assure.typeBeneficiaire})
              </span>
            )}
          </div>
        </div>
        <div className='text-right shrink-0'>
          <p className='text-xs font-semibold'>{formatMontant(dossier.montantReclame)}</p>
          <p className='text-[10px] text-muted-foreground'>{formatDate(dossier.dateReception)}</p>
        </div>
      </div>
      {/* Détails étendus */}
      {(dossier.montantPaye || dossier.motifRejet) && (
        <div className='mt-2 pt-2 border-t flex flex-wrap gap-x-4 gap-y-1 text-xs'>
          {dossier.montantPaye && (
            <span className='text-teal-700 dark:text-teal-300'>
              Payé : <strong>{formatMontant(dossier.montantPaye)}</strong>
              {dossier.referencePaiement ? ` (Réf : ${dossier.referencePaiement})` : ''}
            </span>
          )}
          {dossier.motifRejet && (
            <span className='text-red-600'>Motif : {dossier.motifRejet}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Barre de pagination (P2-02B) ────────────────────────────────────────────

export function BarrePagination({
  pagination,
  changerPage,
  limit,
  changerLimit,
  label = 'dossier(s)',
}: {
  pagination: PaginationInfo;
  changerPage: (p: number) => void;
  limit: number;
  changerLimit: (l: number) => void;
  label?: string;
}) {
  const pages: number[] = [];
  const debut = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
  for (let p = debut; p <= Math.min(pagination.totalPages, debut + 4); p++) pages.push(p);

  return (
    <div className='mt-3 pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-xs'>
      <div className='flex items-center gap-2 text-muted-foreground'>
        <span>
          {pagination.total.toLocaleString('fr-FR')} {label} — page {pagination.page}/{pagination.totalPages}
        </span>
        <select
          value={limit}
          onChange={(e) => changerLimit(Number(e.target.value))}
          className='h-7 rounded-md border border-input bg-transparent px-1.5 text-xs'
          aria-label='Résultats par page'
        >
          {[10, 25, 50, 100].map(l => (
            <option key={l} value={l}>{l}/page</option>
          ))}
        </select>
      </div>
      <div className='flex items-center gap-1'>
        <Button
          variant='outline' size='sm' className='h-7 px-2 text-xs'
          disabled={!pagination.hasPrev} onClick={() => changerPage(pagination.page - 1)}
        >
          <ChevronLeft className='h-3.5 w-3.5' /> Précédente
        </Button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => changerPage(p)}
            className={cn(
              'h-7 min-w-7 px-1.5 rounded-md text-xs border transition-colors',
              p === pagination.page
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-border hover:bg-muted',
            )}
          >
            {p}
          </button>
        ))}
        <Button
          variant='outline' size='sm' className='h-7 px-2 text-xs'
          disabled={!pagination.hasNext} onClick={() => changerPage(pagination.page + 1)}
        >
          Suivante <ChevronRight className='h-3.5 w-3.5' />
        </Button>
      </div>
    </div>
  );
}

// ─── Barre d'export (P2-02C/D) ───────────────────────────────────────────────

export function BarreExport({
  filtres,
  qsPeriode,
  contexte,
}: {
  filtres: { search: string; statut: string };
  qsPeriode: string;
  contexte: { societeNom: string; libellePeriode: string; typeVue: string };
}) {
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [erreur, setErreur] = useState('');

  const lancer = async (format: 'csv' | 'pdf') => {
    setBusy(format);
    setErreur('');
    try {
      if (format === 'csv') {
        await telechargerExportCsv(filtres, qsPeriode);
      } else {
        await telechargerExportPdf(filtres, qsPeriode, contexte);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Export impossible.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button
        variant='outline' size='sm' className='h-7 px-2 text-[11px] gap-1'
        disabled={busy !== null} onClick={() => lancer('csv')}
      >
        {busy === 'csv' ? <Loader2 className='h-3 w-3 animate-spin' /> : <Download className='h-3 w-3' />}
        CSV
      </Button>
      <Button
        variant='outline' size='sm' className='h-7 px-2 text-[11px] gap-1'
        disabled={busy !== null} onClick={() => lancer('pdf')}
      >
        {busy === 'pdf' ? <Loader2 className='h-3 w-3 animate-spin' /> : <FileDown className='h-3 w-3' />}
        PDF
      </Button>
      {erreur && <span className='text-[11px] text-red-600'>{erreur}</span>}
    </div>
  );
}

// ─── Onglet Dossiers commun (vues Assuré ET Entreprise — P2-01/P2-02) ───────

export function OngletDossiers({
  data,
  showAssure,
  filtres,
  majFiltres,
  changerPage,
  qsPeriode,
  libellePeriode,
  titreSansPage,
  maxHauteur,
}: {
  data: PortailData;
  showAssure: boolean;
  filtres: { page: number; limit: number; search: string; statut: string };
  majFiltres: (partiel: Partial<{ page: number; limit: number; search: string; statut: string }>) => void;
  changerPage: (p: number) => void;
  qsPeriode: string;
  libellePeriode: string;
  titreSansPage: string;
  maxHauteur?: boolean;
}) {
  const pagination = data.pagination ?? {
    page: 1, limit: filtres.limit, total: data.dossiers.length,
    totalPages: 1, hasNext: false, hasPrev: false,
  };
  const societeNom = data.societe?.nom ?? '';

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <FolderOpen className='h-4 w-4 text-brand-600' />
            {titreSansPage} ({pagination.total.toLocaleString('fr-FR')})
          </CardTitle>
          <div className='flex flex-col sm:flex-row sm:items-center gap-1.5'>
            <BoutonsStatut valeur={filtres.statut} onChange={(v) => majFiltres({ statut: v })} />
            <input
              type='text'
              placeholder='N° dossier ou bénéficiaire…'
              value={filtres.search}
              onChange={(e) => majFiltres({ search: e.target.value })}
              className='h-7 w-full sm:w-44 rounded-md border border-input bg-transparent px-2 text-[11px]'
            />
            <BarreExport
              filtres={{ search: filtres.search, statut: filtres.statut }}
              qsPeriode={qsPeriode}
              contexte={{ societeNom, libellePeriode, typeVue: data.type === 'PORTAIL_CLIENT' ? 'assuré' : 'entreprise' }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.dossiers.length === 0 ? (
          <div className='text-center py-8'>
            <FolderOpen className='h-10 w-10 mx-auto text-muted-foreground/30 mb-2' />
            <p className='text-sm text-muted-foreground'>Aucun dossier trouvé.</p>
          </div>
        ) : (
          <div className={cn('space-y-2', maxHauteur && 'max-h-[600px] overflow-y-auto')}>
            {data.dossiers.map(d => (
              <DossierCard key={d.id} dossier={d} showAssure={showAssure} />
            ))}
          </div>
        )}
        {/* P2-02B : navigation précédente/suivante, numéros de pages,
            sélection du nombre par page, total — filtres conservés */}
        {data.pagination && (
          <BarrePagination
            pagination={pagination}
            changerPage={changerPage}
            limit={filtres.limit}
            changerLimit={(l) => majFiltres({ limit: l })}
          />
        )}
      </CardContent>
    </Card>
  );
}
