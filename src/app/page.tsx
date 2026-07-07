'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Inbox, Wrench, Calculator, Brain, MessageCircle,
  FileText, Menu, X, Sparkles, Globe, Kanban, Upload, FileBarChart, Plus, Users,
  Heart, Stethoscope, Building2, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import UserMenu from '@/components/smartflow/user-menu';
import DirectionView from '@/components/smartflow/direction-view';
import ReceptionView from '@/components/smartflow/reception-view';
import TechniqueView from '@/components/smartflow/technique-view';
import ComptabiliteView from '@/components/smartflow/comptabilite-view';
import IaView from '@/components/smartflow/ia-view';
import ChatView from '@/components/smartflow/chat-view';
import DossiersView from '@/components/smartflow/dossiers-view';
import KanbanView from '@/components/smartflow/kanban-view';
import ImportView from '@/components/smartflow/import-view';
import ReportingView from '@/components/smartflow/reporting-view';
import PortailView from '@/components/smartflow/portail-view';
import DossierForm from '@/components/smartflow/dossier-form';
import UsersView from '@/components/smartflow/users-view';
import AssuresView from '@/components/smartflow/assures-view';
import PrestatairesView from '@/components/smartflow/prestataires-view';
import ConfigurationView from '@/components/smartflow/configuration-view';
import SocietesView from '@/components/smartflow/societes-view';

type View = 'direction' | 'dossiers' | 'kanban' | 'reception' | 'technique' | 'comptabilite' | 'import' | 'reporting' | 'ia' | 'chat' | 'portail' | 'users' | 'assures' | 'prestataires' | 'societes' | 'configuration';

interface Kpis {
  direction: { totalRecus: number; totalTraites: number; totalPayes: number; totalRejetes: number; delaiMoyenGlobal: number; montantTotalReclame: number; montantTotalPaye: number; tauxRejet: number };
  reception: { totalEnregistres: number; tempsMoyenAvantTransfert: number; enAttente: number };
  technique: { totalAnalyses: number; totalValides: number; totalRejetes: number; delaiMoyenAnalyse: number; montantTotalValide: number; enCours: number };
  comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
  productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  volumeMensuel: { mois: string; nbDossiers: number }[];
}

const allNavItems: { key: View; label: string; icon: typeof LayoutDashboard; badge?: string; section?: string; roles: string[] }[] = [
  { key: 'direction', label: 'Direction Générale', icon: LayoutDashboard, section: 'PILOTAGE', roles: ['ADMINISTRATEUR'] },
  { key: 'dossiers', label: 'Table des Dossiers', icon: FileText, section: 'PILOTAGE', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'] },
  { key: 'kanban', label: 'Vue Kanban', icon: Kanban, section: 'PILOTAGE', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE'] },
  { key: 'reception', label: 'Réception', icon: Inbox, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'ACCUEIL'] },
  { key: 'technique', label: 'Service Technique', icon: Wrench, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'TECHNIQUE'] },
  { key: 'comptabilite', label: 'Comptabilité', icon: Calculator, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'COMPTABILITE'] },
  { key: 'import', label: 'Import ISA/SAGE', icon: Upload, section: 'TRAITEMENT', roles: ['ADMINISTRATEUR', 'ACCUEIL'] },
  { key: 'reporting', label: 'Reporting', icon: FileBarChart, section: 'FINANCE', roles: ['ADMINISTRATEUR', 'COMPTABILITE'] },
  { key: 'users', label: 'Utilisateurs', icon: Users, section: 'FINANCE', roles: ['ADMINISTRATEUR'] },
  { key: 'assures', label: 'Assurés', icon: Heart, section: 'GESTION', roles: ['ADMINISTRATEUR'] },
  { key: 'prestataires', label: 'Prestataires', icon: Stethoscope, section: 'GESTION', roles: ['ADMINISTRATEUR'] },
  { key: 'societes', label: 'Sociétés Client', icon: Building2, section: 'GESTION', roles: ['ADMINISTRATEUR'] },
  { key: 'configuration', label: 'Configuration Bots', icon: Zap, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },
  { key: 'ia', label: 'Intelligence IA', icon: Brain, badge: 'IA', section: 'IA', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'] },
  { key: 'chat', label: 'Assistant IA', icon: MessageCircle, badge: 'Chat', section: 'IA', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'] },
  { key: 'portail', label: 'Portail Client', icon: Globe, badge: 'Demo', section: 'CLIENT', roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'] },
];

export default function Home() {
  const { role, isAuthenticated, isLoading: authLoading } = useAuth();
  const [view, setView] = useState<View>('direction');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Filtrer la navigation selon le rôle
  const navItems = useMemo(() => {
    if (!role) return [];
    return allNavItems.filter(item => item.roles.includes(role));
  }, [role]);

  // Définir la vue par défaut selon le rôle
  useEffect(() => {
    if (role && navItems.length > 0) {
      const currentAllowed = navItems.find(n => n.key === view);
      if (!currentAllowed) {
        setView(navItems[0].key);
      }
    }
  }, [role, navItems, view]);

  // Vérifier si l'utilisateur peut créer des dossiers
  const canCreateDossier = role === 'ADMINISTRATEUR' || role === 'ACCUEIL' || role === 'TECHNIQUE' || role === 'COMPTABILITE';

  useEffect(() => {
    async function fetchKpis() {
      try {
        const res = await fetch('/api/kpis');
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        setKpis(data);
      } catch {
        // silent
      } finally {
        setLoadingKpis(false);
      }
    }
    if (isAuthenticated) fetchKpis();
  }, [isAuthenticated]);

  function handleNav(key: View) {
    setView(key);
    setSidebarOpen(false);
  }

  function handleDossierCreated() {
    setFormOpen(false);
    setFormKey(k => k + 1);
    // Re-fetch KPIs
    fetch('/api/kpis').then(r => r.json()).then(setKpis).catch(() => {});
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50/50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transition-transform duration-200 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
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
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-3 px-3">
            {Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-1">{section}</p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = view === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNav(item.key)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', active && 'text-emerald-600')} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-200 text-emerald-600 bg-emerald-50">
                            {item.badge}
                          </Badge>
                        )}
                      </button>
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
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-xs h-8">
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
        {/* Top bar */}
        <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {(() => { const Icon = navItems.find(n => n.key === view)?.icon || LayoutDashboard; return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
            <h2 className="font-semibold text-sm">{navItems.find(n => n.key === view)?.label || 'Suivi Santé'}</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-600">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              En ligne
            </Badge>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === 'direction' && <DirectionView kpis={kpis} loading={loadingKpis} />}
          {view === 'dossiers' && <DossiersView />}
          {view === 'kanban' && <div className="h-[calc(100vh-8rem)]"><KanbanView /></div>}
          {view === 'reception' && <ReceptionView kpis={kpis} loading={loadingKpis} />}
          {view === 'technique' && <TechniqueView kpis={kpis} loading={loadingKpis} />}
          {view === 'comptabilite' && <ComptabiliteView kpis={kpis} loading={loadingKpis} />}
          {view === 'import' && <ImportView />}
          {view === 'reporting' && <ReportingView />}
          {view === 'ia' && <IaView />}
          {view === 'chat' && <div className="h-[calc(100vh-8rem)] rounded-xl border bg-white overflow-hidden"><ChatView /></div>}
          {view === 'portail' && <PortailView />}
          {view === 'users' && <UsersView />}
          {view === 'assures' && <AssuresView />}
          {view === 'prestataires' && <PrestatairesView />}
          {view === 'societes' && <SocietesView />}
          {view === 'configuration' && <ConfigurationView />}
        </main>
      </div>
    </div>
  );
}