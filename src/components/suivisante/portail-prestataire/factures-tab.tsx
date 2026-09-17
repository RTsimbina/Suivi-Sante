'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Info, Receipt, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMontant, formatDate } from '@/components/suivisante/format';
import { StatutFactureBadge } from './ui-commun';
import type { FactureItem, SocieteCliente, TotauxFactures, FiltreOption } from './types';

// ─── Onglet Factures / Règlements ───────────────────────────────────────────
// Suivi des factures du prestataire (dossiers de règlement prestataire) :
// n°, date, société cliente, période, montant facturé / réglé / solde,
// statut de règlement (dérivé du workflow plateforme) et date de règlement.
// Filtres : société, statut de règlement, n° de facture, période commune.

const LIMITE = 20;

export function FacturesTab({
  societes,
  qsPeriode,
  refreshKey,
}: {
  societes: SocieteCliente[];
  qsPeriode: string;
  refreshKey: number;
}) {
  const [factures, setFactures] = useState<FactureItem[]>([]);
  const [totaux, setTotaux] = useState<TotauxFactures | null>(null);
  const [statutsOptions, setStatutsOptions] = useState<FiltreOption[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const [filtreSociete, setFiltreSociete] = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [numero, setNumero] = useState('');

  const chargerFactures = useCallback(async (pageCible: number) => {
    try {
      setLoading(true);
      setErreur('');
      const params = new URLSearchParams({ page: String(pageCible), limit: String(LIMITE) });
      if (filtreSociete !== 'tous') params.set('societeId', filtreSociete);
      if (filtreStatut !== 'tous') params.set('statutFacture', filtreStatut);
      if (numero.trim()) params.set('numero', numero.trim());
      // Filtre de période commun de la plateforme (qsPeriode vide si TOUTES)
      const url = `/api/portail-prestataire/factures?${params.toString()}${qsPeriode ? `&${qsPeriode}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErreur(err.erreur || 'Erreur de chargement des factures.');
        return;
      }
      const json = await res.json();
      setFactures(json.factures ?? []);
      setTotaux(json.totaux ?? null);
      setStatutsOptions(json.statutsDisponibles ?? []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(Math.max(1, json.pagination?.totalPages ?? 1));
      setPage(json.pagination?.page ?? pageCible);
    } catch {
      setErreur('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [filtreSociete, filtreStatut, numero, qsPeriode]);

  useEffect(() => {
    chargerFactures(1);
  }, [chargerFactures, refreshKey]);

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Receipt className='h-4 w-4 text-emerald-600' />
            Factures / Règlements
            <span className='text-xs font-normal text-muted-foreground'>({total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Bandeau explicatif des statuts (mapping workflow plateforme) */}
          <div className='rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground flex items-start gap-2'>
            <Info className='h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600' />
            <span>
              Les factures correspondent aux dossiers de <strong>règlement
              prestataire</strong> (paiement direct à l&apos;établissement). Le statut
              reflète le workflow de la plateforme : <em>Reçu → Soumise</em>,{' '}
              <em>En analyse → En cours de traitement</em>, <em>Validé / En
              comptabilité / En paiement → Validée</em>, règlement partiel →{' '}
              <em>Partiellement réglée</em>, <em>Payé → Réglée</em>, <em>Rejeté →
              Rejetée</em>. Le statut « Brouillon » n&apos;est pas utilisé : chaque
              acte est enregistré dès sa soumission.
            </span>
          </div>

          {/* Filtres */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
            <Select value={filtreSociete} onValueChange={setFiltreSociete}>
              <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='tous'>Toutes les sociétés</SelectItem>
                {societes.map(s => (
                  <SelectItem key={s.societeId} value={s.societeId}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtreStatut} onValueChange={setFiltreStatut}>
              <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='tous'>Tous les statuts de règlement</SelectItem>
                {statutsOptions.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className='relative'>
              <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
              <Input
                value={numero}
                onChange={e => setNumero(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') chargerFactures(1); }}
                placeholder='N° de facture…'
                className='pl-8 text-xs'
              />
            </div>
          </div>

          {/* Totaux (ensemble filtré) */}
          {totaux && !loading && !erreur && (
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm'>
              <div className='rounded-md border p-3'>
                <p className='text-[11px] text-muted-foreground'>Total facturé</p>
                <p className='font-bold mt-0.5 tabular-nums'>{formatMontant(totaux.montantFacture)}</p>
              </div>
              <div className='rounded-md border p-3'>
                <p className='text-[11px] text-muted-foreground'>Total réglé</p>
                <p className='font-bold mt-0.5 tabular-nums text-green-600 dark:text-green-400'>
                  {formatMontant(totaux.montantRegule)}
                </p>
              </div>
              <div className='rounded-md border p-3'>
                <p className='text-[11px] text-muted-foreground'>Solde restant</p>
                <p className='font-bold mt-0.5 tabular-nums text-orange-600 dark:text-orange-400'>
                  {formatMontant(totaux.solde)}
                </p>
              </div>
            </div>
          )}

          {/* Tableau */}
          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
            </div>
          ) : erreur ? (
            <p className='text-sm text-red-600 dark:text-red-400'>{erreur}</p>
          ) : factures.length === 0 ? (
            <p className='text-sm text-muted-foreground py-8 text-center'>
              Aucune facture ne correspond aux critères sélectionnés.
            </p>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className='hidden md:table-cell'>Société cliente</TableHead>
                      <TableHead className='hidden lg:table-cell'>Période</TableHead>
                      <TableHead className='text-right'>Facturé</TableHead>
                      <TableHead className='text-right'>Réglé</TableHead>
                      <TableHead className='text-right'>Solde</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className='hidden lg:table-cell'>Date règlement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factures.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className='font-mono text-xs'>{f.numeroFacture}</TableCell>
                        <TableCell className='text-xs whitespace-nowrap'>{formatDate(f.date)}</TableCell>
                        <TableCell className='hidden md:table-cell text-xs'>{f.societe.nom}</TableCell>
                        <TableCell className='hidden lg:table-cell text-xs capitalize'>{f.periode}</TableCell>
                        <TableCell className='text-right tabular-nums whitespace-nowrap text-xs'>
                          {formatMontant(f.montantFacture)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums whitespace-nowrap text-xs'>
                          {formatMontant(f.montantRegule)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums whitespace-nowrap text-xs font-medium'>
                          {formatMontant(f.solde)}
                        </TableCell>
                        <TableCell>
                          <StatutFactureBadge statut={f.statutFacture} label={f.statutFactureLabel} />
                        </TableCell>
                        <TableCell className='hidden lg:table-cell text-xs whitespace-nowrap'>
                          {f.dateReglement ? formatDate(f.dateReglement) : '—'}
                          {f.referenceReglement && (
                            <p className='text-[10px] text-muted-foreground'>{f.referenceReglement}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className='flex items-center justify-between'>
                  <p className='text-xs text-muted-foreground'>
                    Page {page} sur {totalPages}
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline' size='sm' className='gap-1'
                      disabled={page <= 1}
                      onClick={() => chargerFactures(page - 1)}
                    >
                      <ChevronLeft className='h-3.5 w-3.5' /> Précédent
                    </Button>
                    <Button
                      variant='outline' size='sm' className='gap-1'
                      disabled={page >= totalPages}
                      onClick={() => chargerFactures(page + 1)}
                    >
                      Suivant <ChevronRight className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
