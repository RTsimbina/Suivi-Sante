'use client';

/**
 * Colonne droite du layout maître-détail : panneau de détail d'une société
 * (en-tête, infos générales, contrats et soldes, onglets Barèmes / Assurés /
 * Prestataires / Contacts). Présentateur pur extrait de societes-view.tsx
 * (Vague 3) — JSX inchangé.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Building2, Users, FileText, Loader2, CheckCircle2, Stethoscope, Percent,
  Phone, Mail, Download, DollarSign, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Societe, SocieteDetails, DetailTab, ContratInfo, EntrepriseContact } from './types';
import { CONTRAT_STATUTS, getStatutConfig } from '@/lib/statuts';
import { BaremesTab, AssuresTab, PrestatairesTab, ContactsTab } from './detail-tabs';

export default function SocieteDetail({
  societe,
  contrats,
  details,
  isLoading,
  activeTab,
  onTabChange,
  canManageContacts,
  rapportLoading,
  onDownloadRapport,
  filteredBaremes,
  baremeSearch,
  setBaremeSearch,
  filteredAssures,
  assureSearch,
  setAssureSearch,
  filteredPrestataires,
  prestataireSearch,
  setPrestataireSearch,
  contacts,
  contactsCount,
  contactSearch,
  setContactSearch,
  contactsLoading,
  onAddContact,
  onEditContact,
  onDeleteContact,
}: {
  societe: Societe;
  contrats: ContratInfo[];
  details: SocieteDetails | null;
  isLoading: boolean;
  activeTab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  canManageContacts: boolean;
  rapportLoading: boolean;
  onDownloadRapport: () => void;
  filteredBaremes: SocieteDetails['baremes'];
  baremeSearch: string;
  setBaremeSearch: (v: string) => void;
  filteredAssures: SocieteDetails['assures'];
  assureSearch: string;
  setAssureSearch: (v: string) => void;
  filteredPrestataires: SocieteDetails['prestataires'];
  prestataireSearch: string;
  setPrestataireSearch: (v: string) => void;
  contacts: EntrepriseContact[];
  contactsCount: number;
  contactSearch: string;
  setContactSearch: (v: string) => void;
  contactsLoading: boolean;
  onAddContact: () => void;
  onEditContact: (c: EntrepriseContact) => void;
  onDeleteContact: (id: string) => void;
}) {
  // Tabs config
  const tabs: { key: DetailTab; label: string; icon: typeof Percent; count: number }[] = [
    { key: 'baremes', label: 'Barèmes', icon: Percent, count: filteredBaremes.length },
    { key: 'assures', label: 'Assurés', icon: Users, count: filteredAssures.length },
    { key: 'prestataires', label: 'Prestataires', icon: Stethoscope, count: filteredPrestataires.length },
    { key: 'contacts', label: 'Contacts', icon: BookOpen, count: contactsCount },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        {/* En-tête société */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">{societe.nom}</h3>
                {societe.actif ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                {societe.telephone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{societe.telephone}</span>
                )}
                {societe.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{societe.email}</span>
                )}
                {societe.nif && (
                  <span>NIF: {societe.nif}</span>
                )}
              </div>
            </div>
          </div>
          {/* Stats rapides */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs gap-1"><Users className="h-3 w-3" />{societe._count.assures} assurés</Badge>
            <Badge variant="outline" className="text-xs gap-1"><Percent className="h-3 w-3" />{societe._count.baremes} barèmes</Badge>
            <Badge variant="outline" className="text-xs gap-1"><FileText className="h-3 w-3" />{societe._count.dossiers} dossiers</Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 ml-1"
              onClick={onDownloadRapport}
              disabled={rapportLoading}
            >
              {rapportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Rapport PDF
            </Button>
          </div>
        </div>

        {/* Infos générales */}
        {societe.adresse && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg bg-muted/30 text-xs">
            <div>
              <p className="text-muted-foreground">Adresse</p>
              <p className="font-medium">{societe.adresse}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contact principal</p>
              <p className="font-medium">{societe.contactPrincipal || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contrats</p>
              <p className="font-medium">{societe._count.contrats}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Créée le</p>
              <p className="font-medium">{new Date(societe.createdAt).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
        )}

        {/* Contrats */}
        {contrats.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-rose-500" />
              Contrats et soldes
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium text-muted-foreground">Référence</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">Budget</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">Utilisé</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">Solde</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {contrats.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono">{c.reference}</td>
                      <td className="py-2 px-3 text-right">{c.budgetAnnuel.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-3 text-right text-amber-600">{c.budgetUtilise.toLocaleString('fr-FR')} Ar</td>
                      <td className={cn('py-2 px-3 text-right font-medium', c.solde < 0 ? 'text-red-600' : 'text-emerald-600')}>{c.solde.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant="outline" className={cn('text-[9px]',
                            getStatutConfig(CONTRAT_STATUTS, c.statut)?.badge ?? 'bg-muted text-muted-foreground'
                          )}>{getStatutConfig(CONTRAT_STATUTS, c.statut)?.label ?? c.statut}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Onglets Barèmes / Assurés / Prestataires ─── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="ml-2 text-xs text-muted-foreground">Chargement des données...</span>
          </div>
        ) : details ? (
          <div>
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b mb-4">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                      isActive
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    <Badge variant="outline" className={cn(
                      'text-[9px] ml-0.5',
                      isActive && 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                    )}>{tab.count}</Badge>
                  </button>
                );
              })}
            </div>

            {/* Contenu des onglets */}
            {activeTab === 'baremes' && (
              <BaremesTab baremes={filteredBaremes} search={baremeSearch} onSearchChange={setBaremeSearch} totalCount={details.baremes.length} />
            )}
            {activeTab === 'assures' && (
              <AssuresTab assures={filteredAssures} search={assureSearch} onSearchChange={setAssureSearch} totalCount={details.assures.length} />
            )}
            {activeTab === 'prestataires' && (
              <PrestatairesTab prestataires={filteredPrestataires} search={prestataireSearch} onSearchChange={setPrestataireSearch} totalCount={details.prestataires.length} />
            )}
            {activeTab === 'contacts' && canManageContacts && (
              <ContactsTab
                contacts={contacts}
                search={contactSearch}
                onSearchChange={setContactSearch}
                totalCount={contactsCount}
                loading={contactsLoading}
                onAdd={onAddContact}
                onEdit={onEditContact}
                onDelete={onDeleteContact}
              />
            )}
            {activeTab === 'contacts' && !canManageContacts && (
              <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Accès réservé aux administrateurs et techniciens</p>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
