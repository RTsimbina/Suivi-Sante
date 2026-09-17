'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Stethoscope, Users, FileText, Clock, CheckCircle2, Receipt,
  Banknote, Hourglass, Building2, Info,
} from 'lucide-react';
import { formatMontant, formatDate } from '@/components/suivisante/format';
import { KPICard, StatutDossierBadge, ConventionBadge } from './ui-commun';
import type { DonneesPortail } from './types';

// ─── Onglet Tableau de bord du prestataire ─────────────────────────────────
// Tous les indicateurs sont calculés côté serveur sur le périmètre du
// prestataire connecté, pour la période sélectionnée dans le filtre commun.

export function DashboardTab({ data }: { data: DonneesPortail }) {
  const prestataire = data.prestataire!;
  const kpis = data.kpis!;
  const societes = data.societes ?? [];
  const derniers = data.derniersActes ?? [];

  return (
    <div className='space-y-6'>
      {/* Profil synthétique */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Stethoscope className='h-4 w-4 text-emerald-600' />
            Mon établissement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
            <div>
              <p className='text-[11px] text-muted-foreground'>Nom / Raison sociale</p>
              <p className='font-medium mt-0.5'>{prestataire.nom}</p>
            </div>
            <div>
              <p className='text-[11px] text-muted-foreground'>Type</p>
              <p className='font-medium mt-0.5'>{prestataire.typeLabel}</p>
            </div>
            <div>
              <p className='text-[11px] text-muted-foreground'>Statut conventionnel</p>
              <div className='mt-0.5'>
                <Badge
                  className={
                    prestataire.actif
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-transparent text-[10px]'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-transparent text-[10px]'
                  }
                >
                  {prestataire.statut === 'SUSPENDU' ? 'Suspendu' : 'Conventionné'}
                </Badge>
              </div>
            </div>
            <div>
              <p className='text-[11px] text-muted-foreground'>Téléphone</p>
              <p className='font-medium mt-0.5'>{prestataire.telephone || '—'}</p>
            </div>
            <div>
              <p className='text-[11px] text-muted-foreground'>Adresse e-mail</p>
              <p className='font-medium mt-0.5 break-all'>{prestataire.email || '—'}</p>
            </div>
            <div>
              <p className='text-[11px] text-muted-foreground'>Adresse</p>
              <p className='font-medium mt-0.5'>{prestataire.adresse || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Indicateurs (période sélectionnée) */}
      <div>
        <h3 className='text-sm font-medium mb-2 flex items-center gap-2'>
          <Receipt className='h-4 w-4 text-emerald-600' />
          Indicateurs de la période
        </h3>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
          <KPICard icon={Stethoscope} label='Actes médicaux réalisés' value={kpis.actesRealises} />
          <KPICard icon={Users} label='Assurés pris en charge' value={kpis.assuresPrisEnCharge} />
          <KPICard icon={FileText} label='Factures émises' value={kpis.facturesEmises} />
          <KPICard icon={Clock} label='Factures en attente' value={kpis.facturesEnAttente} color='text-amber-500' />
          <KPICard icon={CheckCircle2} label='Factures réglées' value={kpis.facturesRegles} color='text-green-600' />
          <KPICard icon={Banknote} label='Montants facturés' value={formatMontant(kpis.montantFacture)} />
          <KPICard icon={Receipt} label='Montants réglés' value={formatMontant(kpis.montantRegule)} color='text-green-600' />
          <KPICard icon={Hourglass} label='Restant à régler' value={formatMontant(kpis.montantRestant)} color='text-orange-500' />
        </div>
        <p className='text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5'>
          <Info className='h-3 w-3 mt-0.5 shrink-0' />
          Les montants portent sur les factures de règlement prestataire (paiement direct).
          Les actes réglés par remboursement de l&apos;assuré n&apos;y figurent pas.
        </p>
      </div>

      {/* Sociétés clientes */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-emerald-600' />
            Mes sociétés clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {societes.length === 0 ? (
            <p className='text-sm text-muted-foreground'>Aucune convention enregistrée.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Société</TableHead>
                  <TableHead>Convention</TableHead>
                  <TableHead className='text-right'>Actes (période)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {societes.map(s => (
                  <TableRow key={s.idLien}>
                    <TableCell className='font-medium'>{s.nom}</TableCell>
                    <TableCell><ConventionBadge active={s.conventionActive} /></TableCell>
                    <TableCell className='text-right tabular-nums'>{s.nbActes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Derniers actes */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Stethoscope className='h-4 w-4 text-emerald-600' />
            Derniers actes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {derniers.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Aucun acte sur la période sélectionnée.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° dossier</TableHead>
                    <TableHead>Acte</TableHead>
                    <TableHead className='hidden md:table-cell'>Bénéficiaire</TableHead>
                    <TableHead className='hidden lg:table-cell'>Société</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className='text-right'>Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {derniers.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className='font-mono text-xs'>{d.numeroDossier}</TableCell>
                      <TableCell>{d.typeLabel}</TableCell>
                      <TableCell className='hidden md:table-cell'>{d.beneficiaire}</TableCell>
                      <TableCell className='hidden lg:table-cell'>{d.societe.nom}</TableCell>
                      <TableCell className='text-xs whitespace-nowrap'>{formatDate(d.dateReception)}</TableCell>
                      <TableCell><StatutDossierBadge statut={d.statut} /></TableCell>
                      <TableCell className='text-right tabular-nums whitespace-nowrap'>
                        {formatMontant(d.montantReclame)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
