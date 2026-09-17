'use client';

import { useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Scale, Building2, Search, UserSearch, Info, CheckCircle2, XCircle,
} from 'lucide-react';
import { formatMontant } from '@/components/suivisante/format';
import { ConventionBadge } from './ui-commun';
import type { SocieteBaremes, AssureMinimal } from './types';

// ─── Onglet Barèmes ─────────────────────────────────────────────────────────
// Chaîne métier affichée : Prestataire → Société cliente → Acte médical →
// Barème applicable. Pour chaque société cliente : les 8 prestations parentes
// avec taux, plafond, conditions (description) et état du barème.
// Recherche d'assuré : assuré des sociétés clientes actives — retourne son
// société de rattachement pour identifier le barème applicable (données
// minimales uniquement : identité + NSS masqué).

export function BaremesTab({
  societes,
  loading,
}: {
  societes: SocieteBaremes[];
  loading: boolean;
}) {
  const [societeSelection, setSocieteSelection] = useState<string>('');

  // Recherche d'assuré (données minimales, serveur filtré)
  const [recherche, setRecherche] = useState('');
  const [assures, setAssures] = useState<AssureMinimal[]>([]);
  const [rechercheFaite, setRechercheFaite] = useState(false);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);

  const societeCourante = societes.find(
    s => s.societeId === (societeSelection || societes[0]?.societeId)
  );
  const societeIdCourante = societeCourante?.societeId ?? '';

  const rechercherAssures = async () => {
    if (!societeIdCourante) return;
    try {
      setRechercheEnCours(true);
      const params = new URLSearchParams({ scope: 'clients', societeId: societeIdCourante });
      if (recherche.trim()) params.set('search', recherche.trim());
      const res = await fetch(`/api/portail-prestataire/assures?${params}`);
      if (res.ok) {
        const json = await res.json();
        setAssures(json.assures ?? []);
        setRechercheFaite(true);
      }
    } finally {
      setRechercheEnCours(false);
    }
  };

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-96 w-full' />
      </div>
    );
  }

  if (societes.length === 0) {
    return (
      <Card>
        <CardContent className='p-6 text-center'>
          <Building2 className='h-10 w-10 mx-auto text-muted-foreground/40 mb-3' />
          <p className='text-sm font-medium'>Aucune société cliente rattachée</p>
          <p className='text-xs text-muted-foreground mt-1'>
            Vous n&apos;avez pas encore de convention avec une société cliente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Sélecteur de société cliente */}
      <Card>
        <CardContent className='p-4 flex flex-col md:flex-row md:items-center gap-3'>
          <div className='flex items-center gap-2 min-w-0'>
            <Building2 className='h-4 w-4 text-emerald-600 shrink-0' />
            <span className='text-sm font-medium shrink-0'>Société cliente :</span>
          </div>
          <Select
            value={societeSelection || societeCourante?.societeId || ''}
            onValueChange={setSocieteSelection}
          >
            <SelectTrigger className='w-full md:w-80'>
              <SelectValue placeholder='Choisir une société' />
            </SelectTrigger>
            <SelectContent>
              {societes.map(s => (
                <SelectItem key={s.societeId} value={s.societeId}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {societeCourante && <ConventionBadge active={societeCourante.conventionActive} />}
        </CardContent>
      </Card>

      {/* Barèmes de la société sélectionnée */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Scale className='h-4 w-4 text-emerald-600' />
            Barèmes applicables — {societeCourante?.nom}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acte médical</TableHead>
                  <TableHead className='text-right'>Taux de couverture</TableHead>
                  <TableHead className='text-right'>Plafond</TableHead>
                  <TableHead className='hidden md:table-cell'>Conditions</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {societeCourante?.baremes.map(b => (
                  <TableRow key={b.prestation}>
                    <TableCell className='font-medium'>{b.label}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {b.configure ? `${b.tauxCouverture} %` : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums whitespace-nowrap'>
                      {b.configure ? formatMontant(b.plafond ?? 0) : '—'}
                    </TableCell>
                    <TableCell className='hidden md:table-cell max-w-xs'>
                      <span className='text-xs text-muted-foreground'>
                        {b.description || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {!b.configure ? (
                        <Badge className='text-[10px] border-transparent bg-muted text-muted-foreground'>
                          Non configuré
                        </Badge>
                      ) : b.actif ? (
                        <Badge className='text-[10px] border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'>
                          Applicable
                        </Badge>
                      ) : (
                        <Badge className='text-[10px] border-transparent bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'>
                          Inactif
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className='text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5'>
            <Info className='h-3 w-3 mt-0.5 shrink-0' />
            Un barème « Non configuré » ou « Inactif » signifie que l&apos;acte n&apos;est
            pas pris en charge pour cette société. La plateforme ne prévoit pas de
            période de validité datée par barème : l&apos;état (actif/inactif) fait foi.
            Les conventions inactives entraînent le refus automatique des actes.
          </p>
        </CardContent>
      </Card>

      {/* Recherche d'assuré (sociétés clientes actives) */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <UserSearch className='h-4 w-4 text-emerald-600' />
            Assuré qui se présente — barème applicable
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') rechercherAssures(); }}
              placeholder='Nom, prénom ou NSS de l&apos;assuré…'
              className='flex-1'
            />
            <Button onClick={rechercherAssures} disabled={rechercheEnCours} className='gap-1.5'>
              <Search className='h-3.5 w-3.5' />
              Rechercher
            </Button>
          </div>

          {rechercheEnCours ? (
            <div className='space-y-2'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-8 w-full' />
            </div>
          ) : rechercheFaite ? (
            assures.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                Aucun assuré trouvé dans les sociétés clientes actives.
              </p>
            ) : (
              <ScrollArea className='max-h-72'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assuré</TableHead>
                      <TableHead>N° Sécurité Sociale</TableHead>
                      <TableHead>Société (barème applicable)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assures.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <span className='font-medium'>{a.prenom ? `${a.prenom} ` : ''}{a.nom}</span>
                          {!a.actif && (
                            <Badge className='ml-2 text-[10px] border-transparent bg-muted text-muted-foreground'>
                              Radié
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='font-mono text-xs'>{a.nSSMasque}</TableCell>
                        <TableCell>
                          <span className='flex items-center gap-1.5 text-sm'>
                            {a.societe.nom}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )
          ) : (
            <p className='text-xs text-muted-foreground flex items-center gap-1.5'>
              <CheckCircle2 className='h-3 w-3 text-emerald-600' />
              Recherchez un assuré pour identifier sa société et consulter le barème
              applicable ci-dessus (données limitées à l&apos;identification).
              <XCircle className='hidden' />
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
