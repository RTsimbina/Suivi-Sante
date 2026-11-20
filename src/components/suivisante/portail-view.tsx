'use client';

/**
 * Vue Portail client (refactoring P2 : le monolithe de 951 lignes est éclaté
 * dans le dossier `portail/`).
 *
 * Rôle de cette page principale : bannière d'information et onglets ; chaque
 * onglet est un composant autonome avec ses propres états et appels API :
 * portail-client-tab (recherche publique), chatbot-tab (simulateur mobile)
 * et portail-securise-tab (KPIs entreprise). Les briques partagées
 * (carte dossier, pipeline visuel, types) vivent dans le même dossier.
 */
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, Globe, MessageCircle, Shield } from 'lucide-react';
import PortailClientTab from './portail/portail-client-tab';
import ChatbotTab from './portail/chatbot-tab';
import PortailSecuriseTab from './portail/portail-securise-tab';

export default function PortailView() {
  return (
    <div className="space-y-4">
      {/* Bannière d'information */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 p-4">
        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
          <Info className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-brand-800 dark:text-brand-300">
            Aperçu du portail client
          </p>
          <p className="text-xs text-brand-700 dark:text-brand-300 mt-0.5 leading-relaxed">
            En production, ce portail est accessible via{' '}
            <strong>WhatsApp</strong>, <strong>Telegram</strong> et <strong>Messenger</strong>.
            Les clients peuvent suivre leurs dossiers de remboursement en temps réel.
          </p>
        </div>
      </div>

      {/* Onglets */}
      <Tabs defaultValue="portail" className="w-full">
        <TabsList className="bg-brand-50 dark:bg-brand-950/40">
          <TabsTrigger
            value="portail"
            className="data-[state=active]:bg-brand-600 data-[state=active]:text-white gap-2"
          >
            <Globe className="h-4 w-4" />
            Portail Client (Aperçu)
          </TabsTrigger>
          <TabsTrigger
            value="chatbot"
            className="data-[state=active]:bg-brand-600 data-[state=active]:text-white gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Chatbot Externe (Aperçu)
          </TabsTrigger>
          <TabsTrigger
            value="securise"
            className="data-[state=active]:bg-brand-600 data-[state=active]:text-white gap-2"
          >
            <Shield className="h-4 w-4" />
            Portail Sécurisé
          </TabsTrigger>
        </TabsList>

        <TabsContent value="portail" className="mt-4">
          <PortailClientTab />
        </TabsContent>

        <TabsContent value="chatbot" className="mt-4">
          <ChatbotTab />
        </TabsContent>

        <TabsContent value="securise" className="mt-4">
          <PortailSecuriseTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
