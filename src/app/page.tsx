'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Inbox, Wrench, Calculator, Brain, MessageCircle,
  FileText, Menu, X, Sparkles, Globe, Kanban, Upload, FileBarChart, Plus,
  Heart, Stethoscope, Building2, Zap, HeartPulse, Mail, Shield, Users,
  TrendingUp, Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { PeriodeProvider, usePeriode } from '@/lib/periode-context';
import { resoudreVue, PARAM_VUE } from '@/lib/navigation';
import PeriodFilter from '@/components/suivisante/period-filter';
import UserMenu from '@/components/suivisante/user-menu';
import UtilisateursView from '@/components/suivisante/utilisateurs-view';
import { ThemeToggle } from '@/components/theme-toggle';
import DirectionView from '@/components/suivisante/direction-view';
import TechniqueView from '@/components/suivisante/technique-view';
import ComptabiliteView from '@/components/suivisante/comptabilite-view';
import IaView from '@/components/suivisante/ia-view';
import AssistantView from '@/components/suivisante/assistant-view';
import DossiersView from '@/components/suivisante/dossiers-view';
import KanbanView from '@/components/suivisante/kanban-view';
import ImportView from '@/components/suivisante/import-view';
import ReportingView from '@/components/suivisante/reporting-view';
import PortailView from '@/components/suivisante/portail-view';
import DossierForm from '@/components/suivisante/dossier-form';
import AssuresView from '@/components/suivisante/assures-view';
import PrestatairesView from '@/components/suivisante/prestataires-view';
import ConfigurationView from '@/components/suivisante/configuration-view';
import SocietesView from '@/components/suivisante/societes-view';
import SanteView from '@/components/suivisante/sante-view';
import ReceptionView from '@/components/suivisante/reception-view';
import JournalView from '@/components/suivisante/journal-view';
import ProfilView from '@/components/suivisante/profil-view';
import KpiCollaborateursView from '@/components/suivisante/kpi-collaborateurs/kpi-collaborateurs-view';
import MaPerformanceView from '@/components/suivisante/kpi-collaborateurs/ma-performance-view';

type View = 'direction' | 'dossiers' | 'kanban' | 'technique' | 'comptabilite' | 'import' | 'reception' | 'reporting' | 'ia' | 'chat' | 'portail' | 'assures' | 'prestataires' | 'societes' | 'utilisateurs' | 'profil' | 'configuration' | 'sante' | 'journal' | 'kpi-collaborateurs' | 'ma-performance';

interface Kpis {
  direction: { totalRecus: number; totalTraites: number; totalPayes: number; totalRejetes: number; delaiMoyenGlobal: number; montantTotalReclame: number; montantTotalPaye: number; tauxRejet: number };
  technique: { totalAnalyses: number; totalValides: number; totalRejetes: number; delaiMoyenAnalyse: number; montantTotalValide: number; enCours: number };
  comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
  productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  volumeMensuel: { mois: string; nbDossiers: number }[];
}

const allNavItems: { key: View; label: string; icon: typeof LayoutDashboard; badge?: string; section?: string; roles: string[] }[] = [
  { key: 'direction', label: 'Direction Générale', icon: LayoutDashboard, section: 'PILOTAGE', roles: ['ADMINISTRATEUR'] },
  { key: 'import', label: 'Accueil', icon: Inbox, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'ACCUEIL'] },
  { key: 'reception', label: 'Réception Courriels', icon: Mail, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'ACCUEIL'] },
  { key: 'dossiers', label: 'Table des Dossiers', icon: FileText, section: 'PILOTAGE', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'kanban', label: 'Vue Kanban', icon: Kanban, section: 'PILOTAGE', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE'] },
  { key: 'technique', label: 'Service Technique', icon: Wrench, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'TECHNIQUE'] },
  { key: 'comptabilite', label: 'Comptabilité', icon: Calculator, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'COMPTABILITE'] },
  { key: 'reporting', label: 'Reporting', icon: FileBarChart, section: 'FINANCE', roles: ['ADMINISTRATEUR', 'COMPTABILITE'] },

  { key: 'assures', label: 'Assurés', icon: Heart, section: 'GESTION', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'prestataires', label: 'Prestataires', icon: Stethoscope, section: 'GESTION', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'societes', label: 'Sociétés Client', icon: Building2, section: 'GESTION', roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'SANTE', 'COMPTABILITE'] },
  { key: 'sante', label: 'Contrôle Santé', icon: HeartPulse, badge: 'Santé', section: 'SANTE', roles: ['ADMINISTRATEUR', 'SANTE'] },
  { key: 'utilisateurs', label: 'Gestion Utilisateurs', icon: Users, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },
  { key: 'configuration', label: 'Configuration Bots', icon: Zap, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },
  { key: 'journal', label: 'Journal de Bord', icon: Shield, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },
  // ─── Module KPI — Performance des collaborateurs (Administration) ────────
  { key: 'kpi-collaborateurs', label: 'KPI – Performance Collaborateurs', icon: TrendingUp, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },
  // Espace personnel du collaborateur (vues internes uniquement)
  { key: 'ma-performance', label: 'Ma Performance', icon: Gauge, section: 'PILOTAGE', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'ia', label: 'Intelligence IA', icon: Brain, badge: 'IA', section: 'IA', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'chat', label: 'Assistant IA', icon: MessageCircle, badge: 'Questions', section: 'IA', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
  { key: 'portail', label: 'Portail Client', icon: Globe, badge: 'Demo', section: 'CLIENT', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'] },
];

/** Vues concernées par le filtre de période (la barre n'y est affichée que pour elles). */
const VUES_AVEC_PERIODE: View[] = ['direction', 'dossiers', 'kanban', 'technique', 'comptabilite', 'reception', 'reporting', 'ia', 'journal', 'sante', 'kpi-collaborateurs', 'ma-performance'];

/** Date de référence du filtre de période, définie explicitement par module. */
const DATE_REFERENCE_PAR_VUE: Partial<Record<View, string>> = {
  direction: 'Date de réception des dossiers',
  dossiers: 'Date de réception des dossiers',
  kanban: 'Date de réception des dossiers',
  technique: 'Date de réception des dossiers',
  comptabilite: 'Date de réception des dossiers',
  ia: 'Date de réception des dossiers',
  sante: 'Date de réception des dossiers',
  reception: 'Date du courriel',
  reporting: 'Date de début des contrats',
  journal: 'Date de modification',
  'kpi-collaborateurs': "Date d'affectation des dossiers",
  'ma-performance': "Date d'affectation des dossiers",
};

export default function Home() {
  return (
    // useSearchParams (vue + période) exige une limite Suspense pour le prerender
    <Suspense fallback={null}>
      <PeriodeProvider>
        <ContenuSante />
      </PeriodeProvider>
    </Suspense>
  );
}

function ContenuSante() {
  const { role, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { queryString: qsPeriode } = usePeriode();
  const searchParams = useSearchParams();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Rediriger les utilisateurs portail vers leur page dédiée
  useEffect(() => {
    if (role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE') {
      router.replace('/portail');
    } else if (role === 'PRESTATAIRE') {
      router.replace('/portail-prestataire');
    }
  }, [role, router]);

  // Filtrer la navigation selon le rôle
  const navItems = useMemo(() => {
    if (!role) return [];
    return allNavItems.filter(item => item.roles.includes(role));
  }, [role]);

  // ─── Vue active résolue depuis l'URL (/?vue=...) ─────────────────────────
  // L'URL est la source de vérité : après F5/Ctrl+R ou partage de lien, le
  // module consulté est restauré. Une vue absente, inconnue ou NON autorisée
  // pour le rôle retombe sur la vue par défaut du rôle et l'URL est corrigée
  // (router.replace) pour refléter la page réellement affichée — la garde de
  // rôle existante est ainsi préservée, sans boucle (vue valide ⇒ null).
  const clesAutorisees = useMemo(() => navItems.map(n => n.key), [navItems]);
  const { vue: vueResolue, urlCanonique } = useMemo(
    () => resoudreVue(searchParams.get(PARAM_VUE), role, clesAutorisees),
    [searchParams, role, clesAutorisees],
  );
  // Fallback de typage uniquement : vueResolue est toujours non-null ici
  // (les rôles portail sont redirigés vers leur page dédiée ci-dessus avant
  // tout rendu de contenu, et isViewAllowed reste false pour eux).
  const view = (vueResolue ?? 'direction') as View;

  useEffect(() => {
    if (urlCanonique) router.replace(urlCanonique, { scroll: false });
  }, [urlCanonique, router]);

  // Vérifier si l'utilisateur peut créer des dossiers
  const canCreateDossier = role === 'ADMINISTRATEUR' || role === 'ACCUEIL' || role === 'TECHNIQUE' || role === 'COMPTABILITE';

  // Défense en profondeur : s'assurer que la vue actuelle est autorisée pour le rôle
  // (le rôle SANTE ne doit jamais voir les vues financières : reporting, comptabilite, direction)
  const isViewAllowed = navItems.some(n => n.key === view);

  useEffect(() => {
    async function fetchKpis() {
      try {
        // Le filtre de période est transmis à l'API : les indicateurs, graphiques
        // et tableaux de bord reflètent automatiquement la période sélectionnée.
        const url = qsPeriode ? `/api/kpis?${qsPeriode}` : '/api/kpis';
        const res = await fetch(url);
        if (!res.ok) return; // Le proxy gère déjà la redirection 401
        const data = await res.json();
        setKpis(data);
      } catch {
        // silent
      } finally {
        setLoadingKpis(false);
      }
    }
    if (isAuthenticated) fetchKpis();
  }, [isAuthenticated, qsPeriode]);

  function handleDossierCreated() {
    setFormOpen(false);
    setFormKey(k => k + 1);
    // Re-fetch KPIs (avec la période sélectionnée)
    const url = qsPeriode ? `/api/kpis?${qsPeriode}` : '/api/kpis';
    fetch(url).then(r => r.json()).then(setKpis).catch(() => {});
  }

  // Group nav items by section
  const sections = navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
    const section = item.section || 'OTHER';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 shadow-sm',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">Suivi Santé</h1>
              <p className="text-[10px] text-muted-foreground">Suivi des Dossiers Santé</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation grouped by section */}
        <ScrollArea className="min-h-0 flex-1 py-2">
          <nav className="space-y-3 px-3">
            {Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-1">{section}</p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = view === item.key;
                    return (
                      // Navigation par URL réelles : chaque module possède une
                      // adresse stable (/?vue=<clé>), ouvrable dans un nouvel
                      // onglet et restaurée à l'identique par F5/Ctrl+R.
                      <Link
                        key={item.key}
                        href={`/?vue=${item.key}`}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', active && 'text-brand-600 dark:text-brand-400')} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-brand-300 dark:border-brand-800 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/50">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t">
          {canCreateDossier && (
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-brand-600 hover:bg-brand-700 text-xs h-8">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Nouveau dossier
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Enregistrer un nouveau dossier</DialogTitle>
                </DialogHeader>
                <DossierForm key={formKey} onSuccess={handleDossierCreated} />
              </DialogContent>
            </Dialog>
          )}
          <div className="px-3 py-2 mt-2 rounded-lg bg-muted/50">
            <p className="text-[10px] text-muted-foreground">Suivi Santé v2.0</p>
            <p className="text-[10px] text-muted-foreground">{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — figée : le shell est en hauteur bornée (h-screen +
            overflow-hidden) et le défilement se fait DANS <main> ci-dessous */}
        <header className="h-14 border-b bg-card flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {(() => {
              // La vue « profil » (menu utilisateur) n'est pas dans la sidebar :
              // titre et icône dédiés, cohérents avec /?vue=profil.
              const Icon = view === 'profil' ? Users : navItems.find(n => n.key === view)?.icon || LayoutDashboard;
              return <Icon className="h-4 w-4 text-muted-foreground" />;
            })()}
            <h2 className="font-semibold text-sm">
              {view === 'profil' ? 'Mon Profil' : navItems.find(n => n.key === view)?.label || 'Suivi Santé'}
            </h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-brand-300 dark:border-brand-800 text-brand-600 dark:text-brand-400">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-brand-500 inline-block" />
              En ligne
            </Badge>
            <ThemeToggle />
            <UserMenu onProfilClick={() => router.push(`/?vue=profil`)} />
          </div>
        </header>

        {/* Barre de filtre par période — réutilisable, visible sur les vues concernées */}
        {isViewAllowed && VUES_AVEC_PERIODE.includes(view) && (
          <div className="border-b bg-muted/30 px-4 py-2 flex justify-start lg:justify-end shrink-0">
            <PeriodFilter dateRefLabel={DATE_REFERENCE_PAR_VUE[view]} />
          </div>
        )}

        {/* Page content — garde : ne rien rendre si la vue n'est pas autorisée */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {isViewAllowed && view === 'direction' && <DirectionView kpis={kpis} loading={loadingKpis} />}
          {isViewAllowed && view === 'dossiers' && <DossiersView />}
          {isViewAllowed && view === 'kanban' && <div className="h-[calc(100vh-8rem)]"><KanbanView /></div>}
          {isViewAllowed && view === 'technique' && <TechniqueView kpis={kpis} loading={loadingKpis} />}
          {isViewAllowed && view === 'comptabilite' && <ComptabiliteView kpis={kpis} loading={loadingKpis} />}
          {isViewAllowed && view === 'import' && <ImportView />}
          {isViewAllowed && view === 'reception' && <ReceptionView kpis={kpis as Record<string, unknown> | null} loading={loadingKpis} />}
          {isViewAllowed && view === 'reporting' && <ReportingView />}
          {isViewAllowed && view === 'ia' && <IaView />}
          {isViewAllowed && view === 'chat' && <div className="h-[calc(100vh-8rem)] rounded-xl border bg-card overflow-hidden shadow-sm"><AssistantView /></div>}
          {isViewAllowed && view === 'portail' && <PortailView />}
          {isViewAllowed && view === 'assures' && <AssuresView userRole={role || ''} />}
          {isViewAllowed && view === 'prestataires' && <PrestatairesView userRole={role || ''} />}
          {isViewAllowed && view === 'societes' && <SocietesView userRole={role || ''} />}
          {isViewAllowed && view === 'utilisateurs' && <UtilisateursView />}
          {view === 'profil' && <ProfilView />}
          {isViewAllowed && view === 'configuration' && <ConfigurationView />}
          {isViewAllowed && view === 'journal' && <JournalView />}
          {isViewAllowed && view === 'sante' && <SanteView />}
          {isViewAllowed && view === 'kpi-collaborateurs' && <KpiCollaborateursView />}
          {isViewAllowed && view === 'ma-performance' && <MaPerformanceView />}
        </main>
      </div>
    </div>
  );
}