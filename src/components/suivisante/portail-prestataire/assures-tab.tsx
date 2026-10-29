'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, Search, Building2, Info, UserCheck } from 'lucide-react';
import { ConventionBadge } from './ui-commun';
import type { AssureMinimal, SocieteCliente } from './types';

// ─── Onglet Assurés ─────────────────────────────────────────────────────────
// Assurés des sociétés clientes dont la convention est ACTIVE (API
// /api/portail-prestataire/assures?scope=clients, périmètre forcé côté
// serveur : intersection sociétés du prestataire × societeId du filtre).
// Données MINIMALES (identité, type bénéficiaire, NSS masqué, société) :
// aucun contact, aucune donnée médicale, aucun montant.
// Le prestataire y trouve « qui a droit, et chez qui » pour un assuré qui se
// présente — le barème applicable est consulté dans l'onglet Barèmes.

export function AssuresTab({
  societes,
  qsPeriode,
  refreshKey,
}: {
  societes: SocieteCliente[];
  qsPeriode: string;
  refreshKey: number;
}) {
  const [assures, setAssures] = useState<AssureMinimal[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const [filtreSociete, setFiltreSociete] = useState('toutes');
  const [recherche, setRecherche] = useState('');

  // Sociétés avec convention ACTIVE uniquement (l'API re-filtre côté serveur)
  const societesActives = societes.filter(s => s.conventionActive);

  const chargerAssures = useCallback(async () => {
    try {
      setLoading(true);
      setErreur('');
      const params = new URLSearchParams({ scope: 'clients' });
      if (filtreSociete !== 'toutes') params.set('societeId', filtreSociete);
      if (recherche.trim()) params.set('search', recherche.trim());
      const url = `/api/portail-prestataire/assures?${params.toString()}${qsPeriode ? `&${qsPeriode}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErreur(err.erreur || 'Erreur de chargement des assurés.');
        return;
      }
      const json = await res.json();
      setAssures(json.assures ?? []);
    } catch {
      setErreur('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [filtreSociete, recherche, qsPeriode]);

  useEffect(() => {
    chargerAssures();
  }, [chargerAssures, refreshKey]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm font-medium flex items-center gap-2'>
          <Users className='h-4 w-4 text-emerald-600' />
          Assurés des sociétés clientes
          <span className='text-xs font-normal text-muted-foreground'>
            ({assures.length} affiché{assures.length > 1 ? 's' : ''})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Filtres : société cliente + recherche */}
        <div className='flex flex-col sm:flex-row gap-2'>
          <Select value={filtreSociete} onValueChange={setFiltreSociete}>
            <SelectTrigger className='w-full sm:w-72'>
              <SelectValue placeholder='Toutes mes sociétés actives' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='toutes'>
                Toutes mes sociétés actives
              </SelectItem>
              {societesActives.map(s => (
                <SelectItem key={s.societeId} value={s.societeId}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className='flex flex-1 gap-2'>
            <Input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') chargerAssures(); }}
              placeholder='Nom, prénom ou NSS…'
              className='flex-1'
            />
            <Button onClick={chargerAssures} className='gap-1.5'>
              <Search className='h-3.5 w-3.5' />
              <span className='hidden sm:inline'>Rechercher</span>
            </Button>
          </div>
        </div>

        {/* Société sélectionnée : rappel de l'état de convention */}
        {filtreSociete !== 'toutes' && (
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <Building2 className='h-3.5 w-3.5' />
            <span>{societes.find(s => s.societeId === filtreSociete)?.nom}</span>
            <ConventionBadge active={societes.find(s => s.societeId === filtreSociete)?.conventionActive ?? false} />
          </div>
        )}

        {erreur ? (
          <p className='text-sm text-red-600 dark:text-red-400'>{erreur}</p>
        ) : loading ? (
          <div className='space-y-2'>
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
          </div>
        ) : assures.length === 0 ? (
          <div className='text-center py-8'>
            <UserCheck className='h-10 w-10 mx-auto text-muted-foreground/40 mb-3' />
            <p className='text-sm font-medium'>Aucun assuré trouvé</p>
            <p className='text-xs text-muted-foreground mt-1'>
              Ajustez la recherche ou sélectionnez une autre société cliente.
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assuré</TableHead>
                  <TableHead>N° Sécurité Sociale</TableHead>
                  <TableHead className='hidden sm:table-cell'>Type</TableHead>
                  <TableHead>Société (barème applicable)</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assures.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className='font-medium'>
                      {a.prenom ? `${a.prenom} ` : ''}{a.nom}
                    </TableCell>
                    <TableCell className='font-mono text-xs'>{a.nSSMasque}</TableCell>
                    <TableCell className='hidden sm:table-cell text-xs text-muted-foreground'>
                      {a.typeBeneficiaire === 'ASSURE' ? 'Assuré principal' : a.typeBeneficiaire === 'CONJOINT' ? 'Conjoint' : a.typeBeneficiaire === 'ENFANT' ? 'Enfant' : a.typeBeneficiaire}
                    </TableCell>
                    <TableCell>
                      <span className='flex items-center gap-1.5 text-sm'>
                        <Building2 className='h-3.5 w-3.5 text-muted-foreground' />
                        {a.societe.nom}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.actif ? (
                        <Badge className='text-[10px] border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'>
                          Actif
                        </Badge>
                      ) : (
                        <Badge className='text-[10px] border-transparent bg-muted text-muted-foreground'>
                          Radié
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className='text-[11px] text-muted-foreground flex items-start gap-1.5'>
          <Info className='h-3 w-3 mt-0.5 shrink-0' />
          Données limitées à l&apos;identification (NSS masqué) : aucun contact,
          aucune donnée médicale ni montant. Seuls les assurés des sociétés dont
          la convention est ACTIVE apparaissent. Le taux et le plafond applicables
          sont consultables dans l&apos;onglet Barèmes.
        </p>
      </CardContent>
    </Card>
  );
}
