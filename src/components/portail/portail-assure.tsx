'use client';

/**
 * portail-assure.tsx — Vue assuré du portail (découpage P2-01 de l'ancien
 * monolithe src/app/portail/page.tsx, fonctionnalités inchangées) :
 * informations personnelles, KPIs, onglets Dossiers (PAGINÉS côté serveur,
 * P2-02) / Famille / Garanties / Contrats / Assistant IA.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, FileText, Heart, Users, FolderOpen, Shield, CreditCard,
  Clock, XCircle, Phone, Baby, UserCheck, Bot, BarChart3, TrendingUp,
} from 'lucide-react';
import AssistantView from '@/components/suivisante/assistant-view';
import { cn } from '@/lib/utils';
import { useOngletUrl } from '@/lib/use-url-state';
import { CONTRAT_STATUTS, getStatutConfig } from '@/lib/statuts';
import { formatMontant, formatDate, TYPE_BENEF_LABELS } from './utils';
import { KPICard, InfoField, OngletDossiers } from './portail-commun';
import type { PortailData } from './types';
import type { PropsPortailVue } from './use-portail-data';

/** Onglets du portail assuré, adressables par URL : /portail?onglet=<key> */
const ONGLETS_PORTAIL_ASSURE = ['dossiers', 'famille', 'garanties', 'contrats', 'assistant'] as const;

export default function PortailAssure({
  data,
  hook,
}: {
  data: PortailData;
  hook: PropsPortailVue;
}) {
  // Onglet actif dans l'URL : restauré après actualisation (F5), partageable.
  const [onglet, setOnglet] = useOngletUrl(ONGLETS_PORTAIL_ASSURE, 'dossiers');
  const assure = data.assure!;

  return (
    <div className='space-y-6'>
      {/* Informations personnelles */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-brand-600' />
            Mes informations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            <InfoField label='Nom' value={`${assure.prenom || ''} ${assure.nom}`} />
            <InfoField label='Matricule' value={assure.matricule || '—'} />
            <InfoField label='N° Sécurité Sociale' value={assure.nSS || '—'} />
            <InfoField label='Type' value={TYPE_BENEF_LABELS[assure.typeBeneficiaire] || assure.typeBeneficiaire} />
            <InfoField label='Date de naissance' value={formatDate(assure.dateNaissance ?? '')} />
            <InfoField label='Sexe' value={assure.sexe === 'M' ? 'Masculin' : assure.sexe === 'F' ? 'Féminin' : assure.sexe || '—'} />
            <InfoField label={"Date d'effet"} value={formatDate(assure.dateEffet ?? '')} />
            <InfoField label='Barème' value={assure.bareme ? String(assure.bareme) : '—'} />
            <InfoField label='Téléphone' value={assure.telephone || '—'} />
            <InfoField label='E-mail' value={assure.email || '—'} />
            <InfoField label='Adresse' value={assure.adresse || '—'} />
          </div>
          <div className='mt-4 pt-4 border-t flex items-center gap-2 text-xs text-muted-foreground'>
            <Building2 className='h-3.5 w-3.5' />
            <span>Entreprise : <strong className='text-foreground'>{data.societe.nom}</strong></span>
            {data.societe.telephone && <span className='ml-3'><Phone className='h-3 w-3 inline mr-1' />{data.societe.telephone}</span>}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3'>
        <KPICard icon={<FolderOpen className='h-4 w-4 text-brand-600' />} label='Total dossiers' value={String(data.kpis.totalDossiers)} color='emerald' />
        <KPICard icon={<BarChart3 className='h-4 w-4 text-info-600' />} label='Montant réclamé' value={formatMontant(data.kpis.totalReclame || 0)} color='sky' />
        <KPICard icon={<TrendingUp className='h-4 w-4 text-teal-600' />} label='Montant payé' value={formatMontant(data.kpis.totalPaye || 0)} color='teal' />
        <KPICard icon={<Clock className='h-4 w-4 text-amber-600' />} label='En cours' value={String(data.kpis.enCours || 0)} color='amber' />
        <KPICard icon={<XCircle className='h-4 w-4 text-red-500' />} label='Rejetés' value={String(data.kpis.rejetes || 0)} color='red' />
      </div>

      {/* Onglets principaux */}
      <Tabs value={onglet} onValueChange={setOnglet} className='w-full'>
        <TabsList className='bg-card'>
          <TabsTrigger value='dossiers' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <FileText className='h-3.5 w-3.5' /> Mes dossiers
          </TabsTrigger>
          <TabsTrigger value='famille' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <Heart className='h-3.5 w-3.5' /> Ma famille
          </TabsTrigger>
          <TabsTrigger value='garanties' className='gap-1.5 data-[state=active]:bg-brand-600 data-[state=active]:text-white'>
            <Shield className='h-3.5 w-3.5' /> Mes garanties
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
            showAssure={!!(data.famille && data.famille.length > 0)}
            filtres={hook.filtres}
            majFiltres={hook.majFiltres}
            changerPage={hook.changerPage}
            qsPeriode={hook.qsPeriode}
            libellePeriode={hook.libellePeriode}
            titreSansPage='Mes dossiers'
          />
        </TabsContent>

        {/* Tab : Famille */}
        <TabsContent value='famille' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <Heart className='h-4 w-4 text-brand-600' />
                Mon foyer ({(data.famille || []).length + 1} personne(s))
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {/* Assuré principal */}
                <div className='flex items-center gap-3 p-3 rounded-lg bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800'>
                  <div className='h-10 w-10 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center'>
                    <UserCheck className='h-5 w-5 text-brand-600' />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium'>{assure.prenom || ''} {assure.nom}</p>
                    <p className='text-xs text-muted-foreground'>Assuré principal</p>
                  </div>
                  <Badge className='bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 text-[10px]'>Principal</Badge>
                </div>
                {/* Ayants droit */}
                {(data.famille || []).map(m => (
                  <div key={m.id} className='flex items-center gap-3 p-3 rounded-lg border bg-card'>
                    <div className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center',
                      m.typeBeneficiaire === 'CONJOINT' ? 'bg-accent-100 dark:bg-accent-900/50' : 'bg-info-100 dark:bg-info-900/50'
                    )}>
                      {m.typeBeneficiaire === 'CONJOINT'
                        ? <Heart className='h-5 w-5 text-accent-600' />
                        : <Baby className='h-5 w-5 text-info-600' />
                      }
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium'>{m.prenom || ''} {m.nom}</p>
                      <p className='text-xs text-muted-foreground'>
                        {TYPE_BENEF_LABELS[m.typeBeneficiaire] || m.typeBeneficiaire}
                        {m.dateNaissance ? ` — Né(e) le ${formatDate(m.dateNaissance)}` : ''}
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='text-xs text-muted-foreground'>{m._count?.dossiers || 0} dossier(s)</p>
                    </div>
                  </div>
                ))}
                {(data.famille || []).length === 0 && (
                  <p className='text-sm text-muted-foreground text-center py-4'>Aucun ayant droit enregistré.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab : Garanties (barèmes) */}
        <TabsContent value='garanties' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <Shield className='h-4 w-4 text-brand-600' />
                Mes garanties — {data.societe.nom}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(data.baremes && data.baremes.length > 0) ? (
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b text-left text-muted-foreground'>
                        <th className='pb-2 font-medium text-xs'>Prestation</th>
                        <th className='pb-2 font-medium text-xs text-right'>Taux couverture</th>
                        <th className='pb-2 font-medium text-xs text-right'>Plafond annuel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.baremes.map(b => (
                        <tr key={b.id} className='border-b last:border-0'>
                          <td className='py-2.5 text-xs font-medium'>{b.prestation}</td>
                          <td className='py-2.5 text-xs text-right'>{b.tauxCouverture}%</td>
                          <td className='py-2.5 text-xs text-right font-bold'>{formatMontant(b.plafond)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground text-center py-4'>Aucune garantie configurée.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab : Contrats */}
        <TabsContent value='contrats' className='mt-4'>
          <ContratsOnglet data={data} titre={`Contrats de ${data.societe.nom}`} />
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

/** Onglet contrats partagé (vues Assuré et Entreprise). */
export function ContratsOnglet({ data, titre }: { data: PortailData; titre: string }) {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm font-medium flex items-center gap-2'>
          <CreditCard className='h-4 w-4 text-brand-600' />
          {titre}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.contrats.length === 0 ? (
          <p className='text-sm text-muted-foreground text-center py-4'>Aucun contrat actif trouvé.</p>
        ) : (
          <div className='space-y-3'>
            {data.contrats.map(c => {
              const taux = c.budgetAnnuel > 0 ? (c.budgetUtilise / c.budgetAnnuel) * 100 : 0;
              return (
                <div key={c.id} className='p-4 rounded-lg border bg-card'>
                  <div className='flex items-center justify-between mb-2'>
                    <p className='text-sm font-medium'>{c.reference}</p>
                    <Badge className={cn(
                      'text-[10px]',
                      c.statut === 'ACTIF' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : getStatutConfig(CONTRAT_STATUTS, c.statut)?.badge ?? 'bg-muted text-muted-foreground'
                    )}>{getStatutConfig(CONTRAT_STATUTS, c.statut)?.label ?? c.statut}</Badge>
                  </div>
                  <div className='grid grid-cols-3 gap-4 text-xs'>
                    <div>
                      <p className='text-muted-foreground'>Budget annuel</p>
                      <p className='font-semibold mt-0.5'>{formatMontant(c.budgetAnnuel)}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Utilisé</p>
                      <p className='font-semibold mt-0.5'>{formatMontant(c.budgetUtilise)}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Du {formatDate(c.dateDebut)} au {formatDate(c.dateFin)}</p>
                    </div>
                  </div>
                  <div className='mt-3'>
                    <div className='flex items-center justify-between text-[10px] text-muted-foreground mb-1'>
                      <span>Taux d&apos;utilisation</span>
                      <span className={taux > 80 ? 'text-red-600 font-semibold' : 'text-brand-600 font-semibold'}>{taux.toFixed(1)}%</span>
                    </div>
                    <div className='w-full h-1.5 rounded-full bg-muted overflow-hidden'>
                      <div className={cn(
                        'h-full rounded-full transition-all',
                        taux > 80 ? 'bg-red-500' : taux > 50 ? 'bg-amber-500' : 'bg-brand-500'
                      )} style={{ width: `${Math.min(taux, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
