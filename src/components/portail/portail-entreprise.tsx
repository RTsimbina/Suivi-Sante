'use client';

/**
 * portail-entreprise.tsx — Vue entreprise du portail (découpage P2-01 de
 * l'ancien monolithe, fonctionnalités inchangées) : informations société,
 * KPIs, onglets Dossiers (PAGINÉS côté serveur, P2-02) / Assurés / Contrats /
 * Assistant IA. L'onglet Contrats est partagé (ContratsOnglet de la vue
 * assuré) — aucune duplication.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, FileText, Users, FolderOpen, CreditCard,
  Clock, XCircle, Phone, Mail, MapPin, Baby, Bot, BarChart3, TrendingUp,
} from 'lucide-react';
import AssistantView from '@/components/suivisante/assistant-view';
import { cn } from '@/lib/utils';
import { useOngletUrl } from '@/lib/use-url-state';
import { formatMontant, formatDate, TYPE_BENEF_LABELS } from './utils';
import { KPICard, OngletDossiers } from './portail-commun';
import { ContratsOnglet } from './portail-assure';
import type { PortailData } from './types';
import type { PropsPortailVue } from './use-portail-data';

/** Onglets du portail entreprise, adressables par URL : /portail?onglet=<key> */
const ONGLETS_PORTAIL_ENTREPRISE = ['dossiers', 'assures', 'contrats', 'assistant'] as const;

export default function PortailEntreprise({
  data,
  hook,
}: {
  data: PortailData;
  hook: PropsPortailVue;
}) {
  // Onglet actif dans l'URL : restauré après actualisation (F5), partageable.
  const [onglet, setOnglet] = useOngletUrl(ONGLETS_PORTAIL_ENTREPRISE, 'dossiers');
  // Recherche locale dans la liste des assurés (client-side, inchangée)
  const [assureSearch, setAssureSearch] = useState('');
  const filteredAssures = (data.assures || []).filter(a => {
    if (!assureSearch) return true;
    const q = assureSearch.toLowerCase();
    return a.nom.toLowerCase().includes(q) || (a.prenom || '').toLowerCase().includes(q) || (a.matricule || '').toLowerCase().includes(q);
  });

  return (
    <div className='space-y-6'>
      {/* Informations entreprise */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-brand-600' />
            {data.societe.nom}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {data.societe.adresse && (
              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <MapPin className='h-3.5 w-3.5 shrink-0' /> {data.societe.adresse}
              </div>
            )}
            {data.societe.telephone && (
              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <Phone className='h-3.5 w-3.5 shrink-0' /> {data.societe.telephone}
              </div>
            )}
            {data.societe.email && (
              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <Mail className='h-3.5 w-3.5 shrink-0' /> {data.societe.email}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3'>
        <KPICard icon={<Users className='h-4 w-4 text-brand-600' />} label='Assurés' value={String(data.kpis.totalAssures || 0)} color='emerald' />
        <KPICard icon={<Baby className='h-4 w-4 text-info-600' />} label='Ayants droit' value={String(data.kpis.totalAyantsDroit || 0)} color='sky' />
        <KPICard icon={<FolderOpen className='h-4 w-4 text-violet-600' />} label='Total dossiers' value={String(data.kpis.totalDossiers)} color='violet' />
        <KPICard icon={<BarChart3 className='h-4 w-4 text-info-600' />} label='Montant réclamé' value={formatMontant(data.kpis.totalReclame || 0)} color='sky' />
        <KPICard icon={<TrendingUp className='h-4 w-4 text-teal-600' />} label='Montant payé' value={formatMontant(data.kpis.totalPaye || 0)} color='teal' />
        <KPICard icon={<Clock className='h-4 w-4 text-amber-600' />} label='En cours' value={String(data.kpis.enCours || 0)} color='amber' />
        <KPICard icon={<XCircle className='h-4 w-4 text-red-500' />} label='Rejetés' value={String(data.kpis.rejetes || 0)} color='red' />
      </div>

      {/* Onglets */}
      <Tabs value={onglet} onValueChange={setOnglet} className='w-full'>
        <TabsList className='bg-card'>
          <TabsTrigger value='dossiers' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <FileText className='h-3.5 w-3.5' /> Dossiers
          </TabsTrigger>
          <TabsTrigger value='assures' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <Users className='h-3.5 w-3.5' /> Assurés
          </TabsTrigger>
          <TabsTrigger value='contrats' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <CreditCard className='h-3.5 w-3.5' /> Contrats
          </TabsTrigger>
          <TabsTrigger value='assistant' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <Bot className='h-3.5 w-3.5' /> Assistant IA
          </TabsTrigger>
        </TabsList>

        {/* Tab : Dossiers — P2-02 : pagination / recherche / export serveur */}
        <TabsContent value='dossiers' className='mt-4'>
          <OngletDossiers
            data={data}
            showAssure
            filtres={hook.filtres}
            majFiltres={hook.majFiltres}
            changerPage={hook.changerPage}
            qsPeriode={hook.qsPeriode}
            libellePeriode={hook.libellePeriode}
            titreSansPage="Dossiers de l'entreprise"
            maxHauteur
          />
        </TabsContent>

        {/* Tab : Assurés */}
        <TabsContent value='assures' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Users className='h-4 w-4 text-brand-600' />
                  Assurés ({filteredAssures.length})
                </CardTitle>
                <input
                  type='text' placeholder='Rechercher...'
                  value={assureSearch} onChange={e => setAssureSearch(e.target.value)}
                  className='h-8 w-full sm:w-60 rounded-md border border-input bg-transparent px-3 text-xs'
                />
              </div>
            </CardHeader>
            <CardContent>
              {filteredAssures.length === 0 ? (
                <p className='text-sm text-muted-foreground text-center py-4'>Aucun assuré trouvé.</p>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b text-left text-muted-foreground'>
                        <th className='pb-2 font-medium text-xs'>Nom</th>
                        <th className='pb-2 font-medium text-xs'>Matricule</th>
                        <th className='pb-2 font-medium text-xs'>Type</th>
                        <th className='pb-2 font-medium text-xs'>Date d&apos;effet</th>
                        <th className='pb-2 font-medium text-xs text-center'>Statut</th>
                        <th className='pb-2 font-medium text-xs text-center'>Dossiers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssures.map(a => (
                        <tr key={a.id} className='border-b last:border-0'>
                          <td className='py-2 text-xs font-medium'>{a.prenom ? `${a.prenom} ` : ''}{a.nom}</td>
                          <td className='py-2 text-xs text-muted-foreground'>{a.matricule || '—'}</td>
                          <td className='py-2 text-xs'>
                            <Badge variant='outline' className='text-[10px]'>
                              {TYPE_BENEF_LABELS[a.typeBeneficiaire] || a.typeBeneficiaire}
                            </Badge>
                          </td>
                          <td className='py-2 text-xs'>{formatDate(a.dateEffet ?? '')}</td>
                          <td className='py-2 text-xs text-center'>
                            <Badge className={cn('text-[10px]', a.actif ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-red-100 text-red-700')}>
                              {a.actif ? 'Actif' : 'Inactif'}
                            </Badge>
                          </td>
                          <td className='py-2 text-xs text-center'>{a.nbDossiers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab : Contrats (partagé avec la vue assuré) */}
        <TabsContent value='contrats' className='mt-4'>
          <ContratsOnglet data={data} titre='Contrats' />
        </TabsContent>

        {/* Tab : Assistant IA */}
        <TabsContent value='assistant' className='mt-4'>
          <Card className='overflow-hidden'>
            <div className='h-[600px]'>
              <AssistantView compact />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
