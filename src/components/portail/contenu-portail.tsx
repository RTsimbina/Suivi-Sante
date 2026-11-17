'use client';

/**
 * contenu-portail.tsx — Coque du portail client (découpage P2-01 de l'ancien
 * monolithe de 829 lignes) : session et redirections, chargement des données
 * (paginées côté serveur, P2-02), en-tête, barre de période, puis rendu de la
 * vue Assuré ou Entreprise selon le rôle connecté.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, LogOut, AlertTriangle } from 'lucide-react';
import PeriodFilter from '@/components/suivisante/period-filter';
import { usePortailData } from './use-portail-data';
import PortailAssure from './portail-assure';
import PortailEntreprise from './portail-entreprise';

export default function ContenuPortail() {
  const {
    status, role, isPortailUser, data, loading, error,
    qsPeriode, libellePeriode, filtres, majFiltres, changerPage, handleLogout,
  } = usePortailData();
  const router = useRouter();

  // Chargement
  if (status === 'loading' || loading) {
    return (
      <div className='min-h-screen flex flex-col bg-muted/30'>
        <header className='h-14 border-b bg-card flex items-center px-4 gap-3'>
          <Skeleton className='h-8 w-8 rounded-lg' />
          <Skeleton className='h-4 w-32' />
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

  if (!isPortailUser || !data) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-muted/30'>
        <Card className='max-w-md'>
          <CardContent className='p-6 text-center'>
            <AlertTriangle className='h-10 w-10 mx-auto text-amber-500 mb-3' />
            <p className='text-sm font-medium'>{error || 'Accès réservé aux utilisateurs du portail client.'}</p>
            <Button variant='outline' className='mt-4' onClick={() => router.push('/login')}>
              Retour à la connexion
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Rendu par type ─────────────────────────────────────────────────────────
  return (
    <div className='min-h-screen flex flex-col bg-muted/30'>
      {/* Header */}
      <header className='h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-50 shadow-sm'>
        <div className='flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600'>
            <Sparkles className='h-4 w-4 text-white' />
          </div>
          <div className='hidden sm:block'>
            <h1 className='font-bold text-sm leading-tight'>Suivi Santé</h1>
            <p className='text-[10px] text-muted-foreground'>Portail {data.type === 'PORTAIL_CLIENT' ? 'Assuré' : 'Entreprise'}</p>
          </div>
        </div>
        <div className='ml-auto flex items-center gap-2'>
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

      {/* Barre de filtre par période — réutilisable, visible pour les utilisateurs du portail */}
      <div className="border-b bg-card/60 px-4 py-2 flex justify-center">
        <PeriodFilter dateRefLabel="Date de réception des dossiers" />
      </div>

      {/* Contenu principal */}
      <main className='flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full'>
        {data.type === 'PORTAIL_CLIENT' && data.assure ? (
          <PortailAssure data={data} hook={{ data, loading, error, qsPeriode, libellePeriode, filtres, majFiltres, changerPage }} />
        ) : (
          <PortailEntreprise data={data} hook={{ data, loading, error, qsPeriode, libellePeriode, filtres, majFiltres, changerPage }} />
        )}
      </main>
    </div>
  );
}
