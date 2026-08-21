'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles, LogOut, User, Building2, FileText, Heart, Users, FolderOpen,
  Shield, CreditCard, TrendingUp, BarChart3, CalendarDays, ChevronRight,
  AlertTriangle, CheckCircle, Clock, XCircle, Info, Phone, Mail, MapPin,
  Baby, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortailData {
  type: 'PORTAIL_CLIENT' | 'CONTACT_ENTREPRISE';
  assure?: any;
  societe: { id: string; nom: string; adresse?: string | null; telephone?: string | null; email?: string | null };
  famille?: any[];
  assures?: any[];
  contrats: any[];
  baremes?: any[];
  dossiers: PortailDossier[];
  kpis: Record<string, number>;
}

interface PortailDossier {
  id: string;
  numeroDossier: string;
  statut: string;
  typeDossier: string;
  beneficiaire: string;
  dateReception: string;
  dateSoins?: string | null;
  montantReclame: number;
  montantValide?: number | null;
  montantPaye?: number | null;
  partPatient?: number | null;
  datePaiement?: string | null;
  referencePaiement?: string | null;
  motifRejet?: string | null;
  assure?: { nom: string; prenom: string | null; typeBeneficiaire: string } | null;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

const STATUT_LABELS: Record<string, string> = {
  RECU: 'Reçu',
  EN_ANALYSE: 'En analyse',
  VALIDE: 'Validé',
  EN_COMPTABILITE: 'En comptabilité',
  EN_PAIEMENT: 'En paiement',
  PAYE: 'Payé',
  REJETE: 'Rejeté',
};

const STATUT_COLORS: Record<string, string> = {
  RECU: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  EN_ANALYSE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  VALIDE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  EN_COMPTABILITE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  EN_PAIEMENT: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  PAYE: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  REJETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_BENEF_LABELS: Record<string, string> = {
  ASSURE: 'Assuré principal',
  CONJOINT: 'Conjoint(e)',
  ENFANT: 'Enfant',
};

function formatMontant(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' Ar';
}

function formatDate(d: string): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
}

function StatutIcon({ statut }: { statut: string }) {
  if (statut === 'PAYE') return <CheckCircle className='h-3.5 w-3.5 text-teal-600' />;
  if (statut === 'REJETE') return <XCircle className='h-3.5 w-3.5 text-red-500' />;
  if (statut === 'EN_PAIEMENT' || statut === 'EN_COMPTABILITE') return <Clock className='h-3.5 w-3.5 text-violet-500' />;
  if (statut === 'EN_ANALYSE') return <Clock className='h-3.5 w-3.5 text-amber-500' />;
  return <Info className='h-3.5 w-3.5 text-sky-500' />;
}

// ─── Composant Principal ────────────────────────────────────────────────────

export default function PortailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<PortailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const role = session?.user?.role as string;
  const isPortailUser = role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE';

  // Rediriger les utilisateurs internes
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && !isPortailUser) {
      router.push('/');
    }
  }, [status, role, isPortailUser, router]);

  // Charger les données du portail
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/portail-client');
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) {
        const err = await res.json();
        setError(err.erreur || 'Erreur de chargement.');
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isPortailUser) fetchData();
  }, [isPortailUser, fetchData]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  // Loading
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

      {/* Contenu principal */}
      <main className='flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full'>
        {data.type === 'PORTAIL_CLIENT' && data.assure ? (
          <PortailAssure data={data} />
        ) : (
          <PortailEntreprise data={data} />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTAIL ASSURÉ
// ═══════════════════════════════════════════════════════════════════════════

function PortailAssure({ data }: { data: PortailData }) {
  const assure = data.assure;
  const [dossierFilter, setDossierFilter] = useState('tous');

  const filteredDossiers = data.dossiers.filter(d => {
    if (dossierFilter === 'tous') return true;
    if (dossierFilter === 'en-cours') return !['PAYE', 'REJETE'].includes(d.statut);
    if (dossierFilter === 'payes') return d.statut === 'PAYE';
    if (dossierFilter === 'rejetes') return d.statut === 'REJETE';
    return true;
  });

  return (
    <div className='space-y-6'>
      {/* Informations personnelles */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium flex items-center gap-2'>
            <User className='h-4 w-4 text-emerald-600' />
            Mes informations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            <InfoField label='Nom' value={`${assure.prenom || ''} ${assure.nom}`} />
            <InfoField label='Matricule' value={assure.matricule || '—'} />
            <InfoField label='N° Sécurité Sociale' value={assure.nSS || '—'} />
            <InfoField label='Type' value={TYPE_BENEF_LABELS[assure.typeBeneficiaire] || assure.typeBeneficiaire} />
            <InfoField label='Date de naissance' value={formatDate(assure.dateNaissance)} />
            <InfoField label='Sexe' value={assure.sexe === 'M' ? 'Masculin' : assure.sexe === 'F' ? 'Féminin' : assure.sexe || '—'} />
            <InfoField label={"Date d'effet"} value={formatDate(assure.dateEffet)} />
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
        <KPICard icon={<FolderOpen className='h-4 w-4 text-emerald-600' />} label='Total dossiers' value={String(data.kpis.totalDossiers)} color='emerald' />
        <KPICard icon={<BarChart3 className='h-4 w-4 text-sky-600' />} label='Montant réclamé' value={formatMontant(data.kpis.totalReclame || 0)} color='sky' />
        <KPICard icon={<TrendingUp className='h-4 w-4 text-teal-600' />} label='Montant payé' value={formatMontant(data.kpis.totalPaye || 0)} color='teal' />
        <KPICard icon={<Clock className='h-4 w-4 text-amber-600' />} label='En cours' value={String(data.kpis.enCours || 0)} color='amber' />
        <KPICard icon={<XCircle className='h-4 w-4 text-red-500' />} label='Rejetés' value={String(data.kpis.rejetes || 0)} color='red' />
      </div>

      {/* Onglets principaux */}
      <Tabs defaultValue='dossiers' className='w-full'>
        <TabsList className='bg-card'>
          <TabsTrigger value='dossiers' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <FileText className='h-3.5 w-3.5' /> Mes dossiers
          </TabsTrigger>
          <TabsTrigger value='famille' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <Heart className='h-3.5 w-3.5' /> Ma famille
          </TabsTrigger>
          <TabsTrigger value='garanties' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <Shield className='h-3.5 w-3.5' /> Mes garanties
          </TabsTrigger>
          <TabsTrigger value='contrats' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <CreditCard className='h-3.5 w-3.5' /> Contrats
          </TabsTrigger>
        </TabsList>

        {/* Tab : Dossiers */}
        <TabsContent value='dossiers' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <FileText className='h-4 w-4 text-emerald-600' />
                  Dossiers ({filteredDossiers.length})
                </CardTitle>
                <div className='flex gap-1.5'>
                  {['tous', 'en-cours', 'payes', 'rejetes'].map(f => (
                    <button
                      key={f}
                      onClick={() => setDossierFilter(f)}
                      className={cn(
                        'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                        dossierFilter === f
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      {f === 'tous' ? 'Tous' : f === 'en-cours' ? 'En cours' : f === 'payes' ? 'Payés' : 'Rejetés'}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredDossiers.length === 0 ? (
                <div className='text-center py-8'>
                  <FolderOpen className='h-10 w-10 mx-auto text-muted-foreground/30 mb-2' />
                  <p className='text-sm text-muted-foreground'>Aucun dossier trouvé.</p>
                </div>
              ) : (
                <div className='space-y-2'>
                  {filteredDossiers.map(d => <DossierCard key={d.id} dossier={d} showAssure={!!(data.famille && data.famille.length > 0)} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab : Famille */}
        <TabsContent value='famille' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <Heart className='h-4 w-4 text-emerald-600' />
                Mon foyer ({(data.famille || []).length + 1} personne(s))
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {/* Assuré principal */}
                <div className='flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'>
                  <div className='h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center'>
                    <UserCheck className='h-5 w-5 text-emerald-600' />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium'>{assure.prenom || ''} {assure.nom}</p>
                    <p className='text-xs text-muted-foreground'>Assuré principal</p>
                  </div>
                  <Badge className='bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]'>Principal</Badge>
                </div>
                {/* Ayants droit */}
                {(data.famille || []).map(m => (
                  <div key={m.id} className='flex items-center gap-3 p-3 rounded-lg border bg-card'>
                    <div className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center',
                      m.typeBeneficiaire === 'CONJOINT' ? 'bg-violet-100 dark:bg-violet-900/50' : 'bg-sky-100 dark:bg-sky-900/50'
                    )}>
                      {m.typeBeneficiaire === 'CONJOINT'
                        ? <Heart className='h-5 w-5 text-violet-600' />
                        : <Baby className='h-5 w-5 text-sky-600' />
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
                <Shield className='h-4 w-4 text-emerald-600' />
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
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <CreditCard className='h-4 w-4 text-emerald-600' />
                Contrats de {data.societe.nom}
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
                            c.statut === 'ACTIF' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-700'
                          )}>{c.statut}</Badge>
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
                            <span>Taux d\'utilisation</span>
                            <span className={taux > 80 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{taux.toFixed(1)}%</span>
                          </div>
                          <div className='w-full h-1.5 rounded-full bg-muted overflow-hidden'>
                            <div className={cn(
                              'h-full rounded-full transition-all',
                              taux > 80 ? 'bg-red-500' : taux > 50 ? 'bg-amber-500' : 'bg-emerald-500'
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTAIL ENTREPRISE
// ═══════════════════════════════════════════════════════════════════════════

function PortailEntreprise({ data }: { data: PortailData }) {
  const [dossierFilter, setDossierFilter] = useState('tous');
  const [assureSearch, setAssureSearch] = useState('');

  const filteredDossiers = data.dossiers.filter(d => {
    if (dossierFilter === 'tous') return true;
    if (dossierFilter === 'en-cours') return !['PAYE', 'REJETE'].includes(d.statut);
    if (dossierFilter === 'payes') return d.statut === 'PAYE';
    if (dossierFilter === 'rejetes') return d.statut === 'REJETE';
    return true;
  });

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
            <Building2 className='h-4 w-4 text-emerald-600' />
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
        <KPICard icon={<Users className='h-4 w-4 text-emerald-600' />} label='Assurés' value={String(data.kpis.totalAssures || 0)} color='emerald' />
        <KPICard icon={<Baby className='h-4 w-4 text-sky-600' />} label='Ayants droit' value={String(data.kpis.totalAyantsDroit || 0)} color='sky' />
        <KPICard icon={<FolderOpen className='h-4 w-4 text-violet-600' />} label='Total dossiers' value={String(data.kpis.totalDossiers)} color='violet' />
        <KPICard icon={<BarChart3 className='h-4 w-4 text-sky-600' />} label='Montant réclamé' value={formatMontant(data.kpis.totalReclame || 0)} color='sky' />
        <KPICard icon={<TrendingUp className='h-4 w-4 text-teal-600' />} label='Montant payé' value={formatMontant(data.kpis.totalPaye || 0)} color='teal' />
        <KPICard icon={<Clock className='h-4 w-4 text-amber-600' />} label='En cours' value={String(data.kpis.enCours || 0)} color='amber' />
        <KPICard icon={<XCircle className='h-4 w-4 text-red-500' />} label='Rejetés' value={String(data.kpis.rejetes || 0)} color='red' />
      </div>

      {/* Onglets */}
      <Tabs defaultValue='dossiers' className='w-full'>
        <TabsList className='bg-card'>
          <TabsTrigger value='dossiers' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <FileText className='h-3.5 w-3.5' /> Dossiers
          </TabsTrigger>
          <TabsTrigger value='assures' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <Users className='h-3.5 w-3.5' /> Assurés
          </TabsTrigger>
          <TabsTrigger value='contrats' className='gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white'>
            <CreditCard className='h-3.5 w-3.5' /> Contrats
          </TabsTrigger>
        </TabsList>

        {/* Tab : Dossiers */}
        <TabsContent value='dossiers' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <FileText className='h-4 w-4 text-emerald-600' />
                  Dossiers de l'entreprise ({filteredDossiers.length})
                </CardTitle>
                <div className='flex gap-1.5'>
                  {['tous', 'en-cours', 'payes', 'rejetes'].map(f => (
                    <button key={f} onClick={() => setDossierFilter(f)} className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                      dossierFilter === f ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border hover:bg-muted'
                    )}>
                      {f === 'tous' ? 'Tous' : f === 'en-cours' ? 'En cours' : f === 'payes' ? 'Payés' : 'Rejetés'}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredDossiers.length === 0 ? (
                <div className='text-center py-8'>
                  <FolderOpen className='h-10 w-10 mx-auto text-muted-foreground/30 mb-2' />
                  <p className='text-sm text-muted-foreground'>Aucun dossier trouvé.</p>
                </div>
              ) : (
                <div className='space-y-2 max-h-[600px] overflow-y-auto'>
                  {filteredDossiers.map(d => <DossierCard key={d.id} dossier={d} showAssure />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab : Assurés */}
        <TabsContent value='assures' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                <CardTitle className='text-sm font-medium flex items-center gap-2'>
                  <Users className='h-4 w-4 text-emerald-600' />
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
                        <th className='pb-2 font-medium text-xs'>Date d'effet</th>
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
                          <td className='py-2 text-xs'>{formatDate(a.dateEffet)}</td>
                          <td className='py-2 text-xs text-center'>
                            <Badge className={cn('text-[10px]', a.actif ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700')}>
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

        {/* Tab : Contrats */}
        <TabsContent value='contrats' className='mt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <CreditCard className='h-4 w-4 text-emerald-600' />
                Contrats
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.contrats.length === 0 ? (
                <p className='text-sm text-muted-foreground text-center py-4'>Aucun contrat trouvé.</p>
              ) : (
                <div className='space-y-3'>
                  {data.contrats.map(c => {
                    const taux = c.budgetAnnuel > 0 ? (c.budgetUtilise / c.budgetAnnuel) * 100 : 0;
                    return (
                      <div key={c.id} className='p-4 rounded-lg border bg-card'>
                        <div className='flex items-center justify-between mb-2'>
                          <p className='text-sm font-medium'>{c.reference}</p>
                          <Badge className={cn('text-[10px]', c.statut === 'ACTIF' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-700')}>
                            {c.statut}
                          </Badge>
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
                            <span>Taux d'utilisation</span>
                            <span className={taux > 80 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{taux.toFixed(1)}%</span>
                          </div>
                          <div className='w-full h-1.5 rounded-full bg-muted overflow-hidden'>
                            <div className={cn('h-full rounded-full transition-all', taux > 80 ? 'bg-red-500' : taux > 50 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(taux, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANTS PARTAGÉS
// ═══════════════════════════════════════════════════════════════════════════

function DossierCard({ dossier, showAssure }: { dossier: PortailDossier; showAssure?: boolean }) {
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

function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
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

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium'>{label}</p>
      <p className='text-sm mt-0.5'>{value || '—'}</p>
    </div>
  );
}
