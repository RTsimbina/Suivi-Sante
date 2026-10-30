'use client';

/**
 * Onglet « Portail Sécurisé » : sélection de l'entreprise, chargement des
 * dossiers et contrats (avec abort), KPIs dérivés (dont le taux de paiement),
 * table Contrats & Solde et liste des dossiers. Extrait tel quel de l'ancien
 * monolithe portail-view.tsx.
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Shield, BarChart3, TrendingUp, Users, FolderOpen, CreditCard, Receipt, FileText,
} from 'lucide-react';
import { formatMontant, statutLabel } from '../format';
import { cn } from '@/lib/utils';
import type { PortailDossier, PortailKPI, ContratRow } from './types';
import DossierClientCard from './dossier-client-card';

export default function PortailSecuriseTab() {
  const [societes, setSocietes] = useState<Array<{id: string; nom: string}>>([]);
  const [selectedSociete, setSelectedSociete] = useState('');
  const [kpis, setKpis] = useState<PortailKPI | null>(null);
  const [contrats, setContrats] = useState<ContratRow[]>([]);
  const [dossiers, setDossiers] = useState<PortailDossier[]>([]);
  const [loading, setLoading] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(false);

  useEffect(() => {
    fetch('/api/societes').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : data.societes || [];
      setSocietes(list.map((s: {id: string; nom: string}) => ({id: s.id, nom: s.nom})));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSociete) return;

    const controller = new AbortController();

    (async () => {
      try {
        const [dossRes, contratsRes] = await Promise.all([
          fetch(`/api/dossiers?societeId=${selectedSociete}&limit=200`, { signal: controller.signal }),
          fetch('/api/contrats', { signal: controller.signal }),
        ]);
        const dossData = await dossRes.json();
        const contratsData = await contratsRes.json();

        const dossiersList = dossData.dossiers || [];
      setDossiers(dossiersList.map((d: {numeroDossier: string; statut: string; typeDossier: string; dateReception: string; montantReclame: number; montantPaye?: number; datePaiement?: string; referencePaiement?: string; prestataire?: string; motifRejet?: string}) => ({
        numeroDossier: d.numeroDossier,
        statut: d.statut,
        statutLabel: statutLabel(d.statut),
        typeDossier: d.typeDossier,
        dateReception: d.dateReception,
        montantReclame: d.montantReclame,
        montantPaye: d.montantPaye,
        datePaiement: d.datePaiement,
        referencePaiement: d.referencePaiement,
        prestataire: d.prestataire,
        motifRejet: d.motifRejet,
      })));

      const societeDossiers = dossiersList;
      const totalReclame = societeDossiers.reduce((s: number, d: {montantReclame: number}) => s + d.montantReclame, 0);
      const totalPaye = societeDossiers.filter((d: {statut: string; montantPaye?: number}) => d.statut === 'PAYE').reduce((s: number, d: {montantPaye?: number}) => s + (d.montantPaye || 0), 0);
      const enCours = societeDossiers.filter((d: {statut: string}) => !['PAYE', 'REJETE'].includes(d.statut)).length;
      const rejete = societeDossiers.filter((d: {statut: string}) => d.statut === 'REJETE').length;
      setKpis({
        totalDossiers: societeDossiers.length,
        totalReclame,
        totalPaye,
        totalEnCours: enCours,
        totalRejete: rejete,
        delaiMoyen: 0,
      });

      const contratsArray = Array.isArray(contratsData) ? contratsData : contratsData.contrats || [];
      const societeContrats = contratsArray.filter((c: {societeId?: string}) => c.societeId === selectedSociete);
      setContrats(societeContrats.map((c: {id: string; societe?: {nom: string}; budgetAnnuel?: number; budgetUtilise?: number; soldeDisponible?: number; tauxUtilisation?: number; _count?: {appelsDeFonds: number}}) => ({
        id: c.id,
        societeNom: c.societe?.nom || '',
        budget: c.budgetAnnuel || 0,
        utilise: c.budgetUtilise || 0,
        solde: c.soldeDisponible ?? (c.budgetAnnuel || 0) - (c.budgetUtilise || 0),
        nbDossiers: c._count?.appelsDeFonds || 0,
      })));
      } catch { /* aborted or network error */ } finally {
        setLoading(false);
        setKpiLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedSociete]);

  return (
    <div className="space-y-4">
      <Card className="border-emerald-100 dark:border-emerald-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-600" />
                Sélectionnez votre entreprise
              </label>
              <select
                value={selectedSociete}
                onChange={(e) => {
                  setSelectedSociete(e.target.value);
                  if (!e.target.value) {
                    setKpis(null);
                    setContrats([]);
                    setDossiers([]);
                  }
                }}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="">Choisir une entreprise...</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedSociete && (
        <Card className="border-dashed border-border">
          <CardContent className="p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-foreground">Sélectionnez votre entreprise</p>
            <p className="text-xs text-muted-foreground mt-1">
              Choisissez votre entreprise ci-dessus pour accéder à vos KPIs, contrats et dossiers.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedSociete && (
        <>
          {kpiLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({length: 6}).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : kpis && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <Card className="border-emerald-100 dark:border-emerald-800">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40"><FolderOpen className="h-4 w-4 text-emerald-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Total dossiers</span>
                  </div>
                  <p className="text-2xl font-bold">{kpis.totalDossiers}</p>
                </CardContent>
              </Card>
              <Card className="border-sky-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40"><BarChart3 className="h-4 w-4 text-sky-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Montant réclamé</span>
                  </div>
                  <p className="text-2xl font-bold">{formatMontant(kpis.totalReclame)}</p>
                </CardContent>
              </Card>
              <Card className="border-teal-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40"><TrendingUp className="h-4 w-4 text-teal-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Montant payé</span>
                  </div>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{formatMontant(kpis.totalPaye)}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40"><CreditCard className="h-4 w-4 text-amber-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">En cours</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{kpis.totalEnCours}</p>
                </CardContent>
              </Card>
              <Card className="border-red-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40"><Receipt className="h-4 w-4 text-red-500" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Rejetés</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{kpis.totalRejete}</p>
                </CardContent>
              </Card>
              <Card className="border-violet-100">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40"><Users className="h-4 w-4 text-violet-600" /></div>
                    <span className="text-xs text-muted-foreground font-medium">Taux paiement</span>
                  </div>
                  <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">
                    {kpis.totalDossiers > 0 ? ((kpis.totalPaye / kpis.totalReclame) * 100).toFixed(1) + '%' : '\u2014'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {contrats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  Contrats & Solde
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium text-xs">Type</th>
                        <th className="pb-2 font-medium text-xs text-right">Budget</th>
                        <th className="pb-2 font-medium text-xs text-right">Utilisé</th>
                        <th className="pb-2 font-medium text-xs text-right">Solde</th>
                        <th className="pb-2 font-medium text-xs text-center">Dossiers</th>
                        <th className="pb-2 font-medium text-xs text-right">Taux utilisation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contrats.map((c) => {
                        const tauxUtil = c.budget > 0 ? (c.utilise / c.budget) * 100 : 0;
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 text-xs font-medium">{c.typeContrat}</td>
                            <td className="py-2 text-xs text-right">{formatMontant(c.budget)}</td>
                            <td className="py-2 text-xs text-right">{formatMontant(c.utilise)}</td>
                            <td className="py-2 text-xs text-right font-bold" style={{color: c.solde < c.budget * 0.2 ? '#dc2626' : '#059669'}}>
                              {formatMontant(c.solde)}
                            </td>
                            <td className="py-2 text-xs text-center">
                              <Badge variant="outline" className="text-[10px]">{c.nbDossiers}</Badge>
                            </td>
                            <td className="py-2 text-xs text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', tauxUtil > 80 ? 'bg-red-50 dark:bg-red-950/400' : tauxUtil > 50 ? 'bg-amber-50 dark:bg-amber-950/400' : 'bg-emerald-50 dark:bg-emerald-950/400')}
                                    style={{width: `${Math.min(tauxUtil, 100)}%`}}
                                  />
                                </div>
                                <span className="text-[10px]">{tauxUtil.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Dossiers de l&apos;entreprise ({dossiers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : dossiers.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun dossier trouvé pour cette entreprise.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dossiers.slice(0, 50).map((d) => (
                    <DossierClientCard key={d.numeroDossier} dossier={d} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
