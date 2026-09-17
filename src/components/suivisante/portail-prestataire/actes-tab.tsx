'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { Stethoscope, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMontant, formatDate } from '@/components/suivisante/format';
import { StatutDossierBadge } from './ui-commun';
import type { ActeItem, SocieteCliente, FiltreOption } from './types';

// ─── Onglet Actes médicaux ──────────────────────────────────────────────────
// Vue médicale : tous les actes du prestataire connecté. Filtres : société
// cliente, assuré, type d'acte, statut du dossier, recherche, période (le
// filtre temporel commun est appliqué par la page parente). La pagination et
// l'isolation sont gérées côté serveur.

const LIMITE = 15;

export function ActesTab({
  societes,
  qsPeriode,
  refreshKey,
}: {
  societes: SocieteCliente[];
  qsPeriode: string;
  refreshKey: number;
}) {
  const [actes, setActes] = useState<ActeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const [filtreSociete, setFiltreSociete] = useState('tous');
  const [filtreAssure, setFiltreAssure] = useState('tous');
  const [filtreType, setFiltreType] = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [recherche, setRecherche] = useState('');

  const [assuresOptions, setAssuresOptions] = useState<FiltreOption[]>([]);
  const [typesOptions, setTypesOptions] = useState<FiltreOption[]>([]);
  const [statutsOptions, setStatutsOptions] = useState<FiltreOption[]>([]);

  // Charger les assurés distincts des actes du prestataire (pour le filtre)
  const chargerAssures = useCallback(async () => {
    try {
      const res = await fetch('/api/portail-prestataire/assures?scope=mes-actes');
      if (res.ok) {
        const json = await res.json();
        setAssuresOptions((json.assures ?? []).map((a: { assureId: string; nom: string }) => ({
          value: a.assureId,
          label: a.nom,
        })));
      }
    } catch {
      // filtre assuré indisponible : non bloquant
    }
  }, []);

  const chargerActes = useCallback(async (pageCible: number) => {
    try {
      setLoading(true);
      setErreur('');
      const params = new URLSearchParams({ page: String(pageCible), limit: String(LIMITE) });
      if (filtreSociete !== 'tous') params.set('societeId', filtreSociete);
      if (filtreAssure !== 'tous') params.set('assureId', filtreAssure);
      if (filtreType !== 'tous') params.set('typeActe', filtreType);
      if (filtreStatut !== 'tous') params.set('statut', filtreStatut);
      if (recherche.trim()) params.set('search', recherche.trim());
      // Filtre de période commun de la plateforme (qsPeriode vide si TOUTES)
      const url = `/api/portail-prestataire/actes?${params.toString()}${qsPeriode ? `&${qsPeriode}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErreur(err.erreur || 'Erreur de chargement des actes.');
        return;
      }
      const json = await res.json();
      setActes(json.actes ?? []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(Math.max(1, json.pagination?.totalPages ?? 1));
      setPage(json.pagination?.page ?? pageCible);
      if (json.filtres) {
        setTypesOptions(json.filtres.typesActe ?? []);
        setStatutsOptions(json.filtres.statuts ?? []);
      }
    } catch {
      setErreur('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [filtreSociete, filtreAssure, filtreType, filtreStatut, recherche, qsPeriode]);

  useEffect(() => {
    chargerAssures();
  }, [chargerAssures]);

  useEffect(() => {
    chargerActes(1);
  }, [chargerActes, refreshKey]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm font-medium flex items-center gap-2'>
          <Stethoscope className='h-4 w-4 text-emerald-600' />
          Actes médicaux réalisés
          <span className='text-xs font-normal text-muted-foreground'>
            ({total} au total)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Filtres */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2'>
          <Select value={filtreSociete} onValueChange={setFiltreSociete}>
            <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='tous'>Toutes les sociétés</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.societeId} value={s.societeId}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtreAssure} onValueChange={setFiltreAssure}>
            <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='tous'>Tous les assurés</SelectItem>
              {assuresOptions.map(a => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtreType} onValueChange={setFiltreType}>
            <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='tous'>Tous les types d&apos;acte</SelectItem>
              {typesOptions.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtreStatut} onValueChange={setFiltreStatut}>
            <SelectTrigger className='text-xs'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='tous'>Tous les statuts</SelectItem>
              {statutsOptions.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
            <Input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') chargerActes(1); }}
              placeholder='N° dossier ou bénéficiaire…'
              className='pl-8 text-xs'
            />
          </div>
        </div>

        {/* Tableau */}
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
          </div>
        ) : erreur ? (
          <p className='text-sm text-red-600 dark:text-red-400'>{erreur}</p>
        ) : actes.length === 0 ? (
          <p className='text-sm text-muted-foreground py-8 text-center'>
            Aucun acte ne correspond aux critères sélectionnés.
          </p>
        ) : (
          <>
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
                    <TableHead className='text-right'>Réclamé</TableHead>
                    <TableHead className='text-right hidden sm:table-cell'>Réglé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actes.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className='font-mono text-xs'>{a.numeroDossier}</TableCell>
                      <TableCell className='text-xs'>{a.typeLabel}</TableCell>
                      <TableCell className='hidden md:table-cell text-xs'>{a.beneficiaire}</TableCell>
                      <TableCell className='hidden lg:table-cell text-xs'>{a.societe.nom}</TableCell>
                      <TableCell className='text-xs whitespace-nowrap'>{formatDate(a.dateReception)}</TableCell>
                      <TableCell>
                        <StatutDossierBadge statut={a.statut} />
                        {a.motifRejet && (
                          <p className='text-[10px] text-muted-foreground mt-1 max-w-40 truncate' title={a.motifRejet}>
                            {a.motifRejet}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className='text-right tabular-nums whitespace-nowrap text-xs'>
                        {formatMontant(a.montantReclame)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums whitespace-nowrap text-xs hidden sm:table-cell'>
                        {a.montantPaye != null ? formatMontant(a.montantPaye) : '—'}
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
                    onClick={() => chargerActes(page - 1)}
                  >
                    <ChevronLeft className='h-3.5 w-3.5' /> Précédent
                  </Button>
                  <Button
                    variant='outline' size='sm' className='gap-1'
                    disabled={page >= totalPages}
                    onClick={() => chargerActes(page + 1)}
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
  );
}
