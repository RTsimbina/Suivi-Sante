'use client';

import { useState, useEffect } from 'react';
import { Building2, DollarSign, Clock, CheckCircle2, Plus, FileBarChart, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatMontant, formatDate } from './format';

interface Contrat {
  id: string; reference: string; budgetAnnuel: number; budgetUtilise: number;
  dateDebut: string; dateFin: string; statut: string;
  societe: { id: string; nom: string };
  soldeDisponible: number; tauxUtilisation: number;
  _count: { appelsDeFonds: number };
}

interface AppelFonds {
  id: string; montant: number; dateAppel: string; datePaiement: string | null;
  reference: string | null; statut: string; observations: string | null;
  contrat: { id: string; reference: string; societe: { id: string; nom: string } };
}

const STATUT_BADGE: Record<string, string> = {
  ACTIF: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  EXPIRE: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  SUSPENDU: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  EN_ATTENTE: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  REGLE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  PARTIELLEMENT_REGLE: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
};

const STATUT_LABEL: Record<string, string> = {
  ACTIF: 'Actif', EXPIRE: 'Expiré', SUSPENDU: 'Suspendu',
  EN_ATTENTE: 'En attente', REGLE: 'Réglé', PARTIELLEMENT_REGLE: 'Partiellement réglé',
};

export default function ReportingView() {
  const [tab, setTab] = useState<'contrats' | 'appels' | 'rapport'>('contrats');
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [rapportMois, setRapportMois] = useState(new Date().getMonth() + 1);
  const [generatingRapport, setGeneratingRapport] = useState(false);

  const handleGenererRapport = async () => {
    setGeneratingRapport(true);
    try {
      const res = await fetch(`/api/reporting/rapport?mois=${rapportMois}&annee=2026`);
      if (!res.ok) {
        toast.error('Erreur lors de la génération du rapport');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-suivi-sante-2026-${String(rapportMois).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Rapport PDF téléchargé avec succès');
    } catch {
      toast.error('Erreur réseau lors de la génération');
    } finally {
      setGeneratingRapport(false);
    }
  };
  const [appels, setAppels] = useState<AppelFonds[]>([]);
  const [filterStatut, setFilterStatut] = useState('TOUS');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Formulaire appel de fonds
  const [formContratId, setFormContratId] = useState('');
  const [formMontant, setFormMontant] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formObs, setFormObs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, aRes] = await Promise.all([fetch('/api/contrats'), fetch('/api/appels-fonds')]);
      const cData = await cRes.json();
      const aData = await aRes.json();
      setContrats(Array.isArray(cData) ? cData : []);
      setAppels(Array.isArray(aData) ? aData : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSubmitAppel() {
    if (!formContratId || !formMontant || !formDate) { toast.error('Champs obligatoires manquants'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/appels-fonds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contratId: formContratId, montant: formMontant, dateAppel: formDate, observations: formObs }),
      });
      if (!res.ok) throw new Error();
      toast.success('Appel de fonds enregistré');
      setDialogOpen(false);
      setFormContratId(''); setFormMontant(''); setFormDate(''); setFormObs('');
      loadData();
    } catch { toast.error('Erreur lors de l\'enregistrement'); }
    finally { setSubmitting(false); }
  }

  async function marquerRegle(id: string) {
    try {
      const res = await fetch(`/api/appels-fonds/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: 'REGLE', datePaiement: new Date().toISOString().split('T')[0], reference: `PAIE-${Date.now()}` }) });
      if (res.ok) { toast.success('Appel marqué comme réglé'); loadData(); }
    } catch { toast.error('Erreur'); }
  }

  const totalBudget = contrats.reduce((s, c) => s + c.budgetAnnuel, 0);
  const totalUtilise = contrats.reduce((s, c) => s + c.budgetUtilise, 0);
  const totalAppels = appels.reduce((s, a) => s + a.montant, 0);
  const appelsEnAttente = appels.filter(a => a.statut === 'EN_ATTENTE');
  const filteredAppels = filterStatut === 'TOUS' ? appels : appels.filter(a => a.statut === filterStatut);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([['contrats', 'Suivi des Contrats', Building2], ['appels', 'Appels de Fonds', DollarSign], ['rapport', 'Rapport Mensuel', FileBarChart]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-emerald-600 text-emerald-700 dark:text-emerald-300' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* Tab Contrats */}
      {tab === 'contrats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3"><p className="text-xs text-muted-foreground">Budget total</p><p className="text-lg font-bold">{formatMontant(totalBudget)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Utilisé</p><p className="text-lg font-bold text-amber-600">{formatMontant(totalUtilise)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Solde disponible</p><p className="text-lg font-bold text-emerald-600">{formatMontant(totalBudget - totalUtilise)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Taux d'utilisation</p><p className="text-lg font-bold">{totalBudget > 0 ? Math.round((totalUtilise / totalBudget) * 100) : 0}%</p></Card>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Société</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Référence</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Budget annuel</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Utilisation</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Solde disponible</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-center">Statut</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Fin contrat</th>
                  </tr>
                </thead>
                <tbody>
                  {contrats.map(c => {
                    const taux = c.tauxUtilisation ?? (c.budgetAnnuel > 0 ? Math.round((c.budgetUtilise / c.budgetAnnuel) * 100) : 0);
                    const solde = c.soldeDisponible ?? (c.budgetAnnuel - c.budgetUtilise);
                    return (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{c.societe.nom}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{c.reference}</td>
                      <td className="px-4 py-2.5 text-right">{formatMontant(c.budgetAnnuel)}</td>
                      <td className="px-4 py-2.5 w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={taux} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-10 text-right">{taux}%</span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${solde < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMontant(solde)}</td>
                      <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={STATUT_BADGE[c.statut] || ''}>{STATUT_LABEL[c.statut] || c.statut}</Badge></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(c.dateFin)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab Appels de Fonds */}
      {tab === 'appels' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {['TOUS', 'EN_ATTENTE', 'REGLE', 'PARTIELLEMENT_REGLE'].map(s => (
                <Button key={s} variant={filterStatut === s ? 'default' : 'outline'} size="sm" className={filterStatut === s ? 'bg-emerald-600' : ''} onClick={() => setFilterStatut(s)}>
                  {s === 'TOUS' ? 'Tous' : STATUT_LABEL[s]}
                </Button>
              ))}
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4 mr-1" />Nouvel appel</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nouvel appel de fonds</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5"><Label>Contrat *</Label>
                    <select value={formContratId} onChange={e => setFormContratId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                      <option value="">Sélectionner...</option>
                      {contrats.filter(c => c.statut === 'ACTIF').map(c => <option key={c.id} value={c.id}>{c.societe.nom} ({c.reference})</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label>Montant (Ar) *</Label><Input type="number" value={formMontant} onChange={e => setFormMontant(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Date d'appel *</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Observations</Label><Input value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Optionnel" /></div>
                  <Button onClick={handleSubmitAppel} disabled={submitting} className="w-full bg-emerald-600">
                    {submitting ? 'Enregistrement...' : 'Enregistrer l\'appel de fonds'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3"><p className="text-xs text-muted-foreground">Total appels</p><p className="text-lg font-bold">{appels.length}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Montant total</p><p className="text-lg font-bold">{formatMontant(totalAppels)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Réglés</p><p className="text-lg font-bold text-emerald-600">{appels.filter(a => a.statut === 'REGLE').length}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">En attente</p><p className="text-lg font-bold text-amber-600">{appelsEnAttente.length}</p></Card>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Société</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Contrat</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Montant</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Date appel</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Date paiement</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-center">Statut</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppels.map(a => (
                    <tr key={a.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{a.contrat.societe.nom}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{a.contrat.reference}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatMontant(a.montant)}</td>
                      <td className="px-4 py-2.5">{formatDate(a.dateAppel)}</td>
                      <td className="px-4 py-2.5">{a.datePaiement ? formatDate(a.datePaiement) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={STATUT_BADGE[a.statut] || ''}>{STATUT_LABEL[a.statut] || a.statut}</Badge></td>
                      <td className="px-4 py-2.5 text-right">
                        {a.statut === 'EN_ATTENTE' && (
                          <Button size="sm" variant="outline" onClick={() => marquerRegle(a.id)} className="text-xs h-7 text-emerald-600 border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="size-3 mr-1" />Marquer réglé
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab Rapport Mensuel */}
      {tab === 'rapport' && (
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <FileBarChart className="size-5 text-emerald-600" />
              Rapport mensuel automatique
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Chaque mois, un rapport est automatiquement envoyé aux responsables RH ou Finance des entreprises clientes comprenant le détail des remboursements, les dépenses par salarié, les appels de fonds réglés et les fonds disponibles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5"><Label>Mois</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={rapportMois}
                  onChange={e => setRapportMois(Number(e.target.value))}
                >
                  {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Entreprise</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Toutes les entreprises</option>
                  {contrats.map(c => <option key={c.id} value={c.id}>{c.societe.nom}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 mb-4">
              <p className="text-sm font-medium">Contenu du rapport :</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Détail des remboursements du mois</li>
                <li>Dépenses par salarié et par famille</li>
                <li>Appels de fonds réglés</li>
                <li>Montant des fonds disponibles</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleGenererRapport} disabled={generatingRapport}>
                {generatingRapport ? <Loader2 className="size-4 mr-1 animate-spin" /> : <TrendingUp className="size-4 mr-1" />}
                Télécharger le rapport PDF
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}