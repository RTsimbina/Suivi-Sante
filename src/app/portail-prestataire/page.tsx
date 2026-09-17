'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles, LogOut, Stethoscope, Scale, Receipt, FileText, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { PeriodeProvider, usePeriode } from '@/lib/periode-context';
import PeriodFilter from '@/components/suivisante/period-filter';
import { DashboardTab } from '@/components/suivisante/portail-prestataire/dashboard-tab';
import { BaremesTab } from '@/components/suivisante/portail-prestataire/baremes-tab';
import { ActesTab } from '@/components/suivisante/portail-prestataire/actes-tab';
import { FacturesTab } from '@/components/suivisante/portail-prestataire/factures-tab';
import type { DonneesPortail, SocieteBaremes } from '@/components/suivisante/portail-prestataire/types';

// ─── Portail Prestataire ────────────────────────────────────────────────────
// Espace dédié aux prestataires de soins. L'isolation est garantie côté
// serveur : l'API /api/portail-prestataire* résout le prestataire associé au
// compte connecté (JWT) et ignore toute identité fournie par le navigateur.
// Aucun id n'est transmis dans les requêtes (uniquement filtres + période).

export default function PortailPrestatairePage() {
  return (
    <PeriodeProvider>
      <ContenuPortailPrestataire />
    </PeriodeProvider>
  );
}

function ContenuPortailPrestataire() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { queryString: qsPeriode, libelle } = usePeriode();

  const [data, setData] = useState<DonneesPortail | null>(null);
  const [baremes, setBaremes] = useState<SocieteBaremes[]>([]);
  const [baremesCharges, setBaremesCharges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const role = session?.user?.role as string;
  const autorise = role === 'PRESTATAIRE' || role === 'ADMINISTRATEUR';

  // Gardes : non connecté → login ; rôle interne → dashboard ; portail client → son portail
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && !autorise) {
      router.push(role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE' ? '/portail' : '/');
    }
  }, [status, role, autorise, router]);

  // Données principales (profil, sociétés, KPIs, derniers actes)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const url = `/api/portail-prestataire${qsPeriode ? `?${qsPeriode}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.erreur || 'Erreur de chargement.');
        return;
      }
      setData(await res.json());
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [router, qsPeriode]);

  // Barèmes (une seule charge par période ; l'API renvoie toutes les conventions)
  const fetchBaremes = useCallback(async () => {
    try {
      const res = await fetch('/api/portail-prestataire/baremes');
      if (res.ok) {
        const json = await res.json();
        setBaremes(json.societes ?? []);
      }
    } catch {
      // non bloquant : la vue barèmes affichera un message
    } finally {
      setBaremesCharges(true);
    }
  }, []);

  useEffect(() => {
    if (autorise) fetchData();
  }, [autorise, fetchData]);

  useEffect(() => {
    if (autorise && !baremesCharges) fetchBaremes();
  }, [autorise, baremesCharges, fetchBaremes]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const estAdmin = data?.type === 'ADMINISTRATEUR';
  const societes = data?.societes ?? [];

  // Chargement
  if (status === 'loading' || (loading && !data)) {
    return (
      <div className='min-h-screen flex flex-col bg-muted/30'>
        <header className='h-14 border-b bg-card flex items-center px-4 gap-3'>
          <Skeleton className='h-8 w-8 rounded-lg' />
          <Skeleton className='h-4 w-36' />
          <div className='ml-auto'><Skeleton className='h-8 w-8 rounded-full' /></div>
        </header>
        <div className='flex-1 flex items-center justify-center p-6'>
          <div className='flex flex-col items-center gap-3'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent' />
            <p className='text-sm text-muted-foreground'>Chargement de votre espace...</p>
          </div>
        </div>
      </div>
    );
  }

  // Erreur ou accès refusé
  if (!autorise || !data || error) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-muted/30'>
        <Card className='max-w-md'>
          <CardContent className='p-6 text-center'>
            <AlertTriangle className='h-10 w-10 mx-auto text-amber-500 mb-3' />
            <p className='text-sm font-medium'>
              {error || data?.message || 'Accès réservé aux comptes prestataires.'}
            </p>
            <Button variant='outline' className='mt-4' onClick={() => router.push('/login')}>
              Retour à la connexion
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='min-h-screen flex flex-col bg-muted/30'>
      {/* Header */}
      <header className='h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-50 shadow-sm'>
        <div className='flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600'>
            <Stethoscope className='h-4 w-4 text-white' />
          </div>
          <div className='hidden sm:block'>
            <h1 className='font-bold text-sm leading-tight'>Suivi Santé</h1>
            <p className='text-[10px] text-muted-foreground'>
              Portail Prestataire{data.prestataire ? ` — ${data.prestataire.nom}` : ''}
            </p>
          </div>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          {estAdmin && (
            <Badge variant='outline' className='text-[10px] border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400'>
              Mode administrateur
            </Badge>
          )}
          <Badge variant='outline' className='text-[10px] border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hidden sm:flex'>
            <span className='mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block' />
            Connecté
          </Badge>
          <Button variant='ghost' size='sm' className='text-xs gap-1.5' onClick={handleLogout}>
            <LogOut className='h-3.5 w-3.5' />
            <span className='hidden sm:inline'>Déconnexion</span>
          </Button>
        </div>
      </header>

      {/* Barre de filtre par période — système commun de la plateforme */}
      <div className='border-b bg-card/60 px-4 py-2 flex flex-col items-center gap-1'>
        <PeriodFilter dateRefLabel='Date de réception des dossiers' />
        <div className='flex items-center gap-2'>
          <p className='text-[10px] text-muted-foreground'>
            Période affichée : <span className='font-medium'>{libelle}</span>
          </p>
          <Button
            variant='ghost' size='sm'
            className='h-5 px-2 text-[10px] text-muted-foreground'
            onClick={() => { fetchData(); setRefreshKey(k => k + 1); }}
          >
            <RefreshCw className='h-3 w-3' />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Contenu principal */}
      <main className='flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full'>
        {estAdmin ? (
          <Card className='max-w-lg mx-auto'>
            <CardContent className='p-6 text-center'>
              <Stethoscope className='h-10 w-10 mx-auto text-emerald-600 mb-3' />
              <p className='text-sm font-medium'>{data.message}</p>
              <p className='text-xs text-muted-foreground mt-2'>
                Créez un compte de rôle « Prestataire » dont l&apos;e-mail correspond à la
                fiche d&apos;un prestataire (GESTION → Prestataires) pour consulter le portail.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue='dashboard' className='space-y-4'>
            <TabsList className='flex flex-wrap h-auto gap-1'>
              <TabsTrigger value='dashboard' className='gap-1.5 text-xs'>
                <Stethoscope className='h-3.5 w-3.5' />
                Tableau de bord
              </TabsTrigger>
              <TabsTrigger value='baremes' className='gap-1.5 text-xs'>
                <Scale className='h-3.5 w-3.5' />
                Barèmes
              </TabsTrigger>
              <TabsTrigger value='actes' className='gap-1.5 text-xs'>
                <FileText className='h-3.5 w-3.5' />
                Actes médicaux
              </TabsTrigger>
              <TabsTrigger value='factures' className='gap-1.5 text-xs'>
                <Receipt className='h-3.5 w-3.5' />
                Factures / Règlements
              </TabsTrigger>
            </TabsList>

            <TabsContent value='dashboard'>
              <DashboardTab data={data} />
            </TabsContent>
            <TabsContent value='baremes'>
              <BaremesTab societes={baremes} loading={!baremesCharges} />
            </TabsContent>
            <TabsContent value='actes'>
              <ActesTab societes={societes} qsPeriode={qsPeriode} refreshKey={refreshKey} />
            </TabsContent>
            <TabsContent value='factures'>
              <FacturesTab societes={societes} qsPeriode={qsPeriode} refreshKey={refreshKey} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
