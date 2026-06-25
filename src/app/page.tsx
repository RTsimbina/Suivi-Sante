'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Inbox, Wrench, Calculator, Brain, MessageCircle,
  FileText, Menu, X, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import DirectionView from '@/components/smartflow/direction-view';
import ReceptionView from '@/components/smartflow/reception-view';
import TechniqueView from '@/components/smartflow/technique-view';
import ComptabiliteView from '@/components/smartflow/comptabilite-view';
import IaView from '@/components/smartflow/ia-view';
import ChatView from '@/components/smartflow/chat-view';
import DossiersView from '@/components/smartflow/dossiers-view';

type View = 'direction' | 'reception' | 'technique' | 'comptabilite' | 'ia' | 'chat' | 'dossiers';

interface Kpis {
  direction: { totalRecus: number; totalTraites: number; totalPayes: number; totalRejetes: number; delaiMoyenGlobal: number; montantTotalReclame: number; montantTotalPaye: number; tauxRejet: number };
  reception: { totalEnregistres: number; tempsMoyenAvantTransfert: number; enAttente: number };
  technique: { totalAnalyses: number; totalValides: number; totalRejetes: number; delaiMoyenAnalyse: number; montantTotalValide: number; enCours: number };
  comptabilite: { decomptesRecus: number; paiementsEffectues: number; montantTotalPaye: number; enCoursPaiement: number };
  productivite: { gestionnaireNom: string; service: string; nbDossiers: number; montantTraite: number; tempsMoyenTraitement: number }[];
  parSociete: { societeNom: string; nbDossiers: number; montantReclame: number; montantPaye: number; coutMoyen: number }[];
  volumeMensuel: { mois: string; nbDossiers: number }[];
}

const navItems: { key: View; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
  { key: 'direction', label: 'Direction Générale', icon: LayoutDashboard },
  { key: 'dossiers', label: 'Dossiers', icon: FileText },
  { key: 'reception', label: 'Réception', icon: Inbox },
  { key: 'technique', label: 'Service Technique', icon: Wrench },
  { key: 'comptabilite', label: 'Comptabilité', icon: Calculator },
  { key: 'ia', label: 'Intelligence IA', icon: Brain, badge: 'IA' },
  { key: 'chat', label: 'Assistant IA', icon: MessageCircle, badge: 'Chat' },
];

export default function Home() {
  const [view, setView] = useState<View>('direction');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function fetchKpis() {
      try {
        const res = await fetch('/api/kpis');
        const data = await res.json();
        setKpis(data);
      } catch {
        // silent
      } finally {
        setLoadingKpis(false);
      }
    }
    fetchKpis();
  }, []);

  function handleNav(key: View) {
    setView(key);
    setSidebarOpen(false);
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
              <h1 className="font-bold text-sm leading-tight">SmartFlow IA</h1>
              <p className="text-[10px] text-muted-foreground">Suivi des Dossiers Santé</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-0.5 px-3">
            {navItems.map((item) => {
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
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t">
          <div className="px-3 py-2 rounded-lg bg-muted/50">
            <p className="text-[10px] text-muted-foreground">Version MVP</p>
            <p className="text-[10px] text-muted-foreground">Données au 25 Juin 2026</p>
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
            <h2 className="font-semibold text-sm">{navItems.find(n => n.key === view)?.label || 'SmartFlow IA'}</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-600">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              En ligne
            </Badge>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === 'direction' && <DirectionView kpis={kpis} loading={loadingKpis} />}
          {view === 'reception' && <ReceptionView kpis={kpis} loading={loadingKpis} />}
          {view === 'technique' && <TechniqueView kpis={kpis} loading={loadingKpis} />}
          {view === 'comptabilite' && <ComptabiliteView kpis={kpis} loading={loadingKpis} />}
          {view === 'ia' && <IaView />}
          {view === 'chat' && <div className="h-[calc(100vh-8rem)] rounded-xl border bg-white overflow-hidden"><ChatView /></div>}
          {view === 'dossiers' && <DossiersView />}
        </main>
      </div>
    </div>
  );
}